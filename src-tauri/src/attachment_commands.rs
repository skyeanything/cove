use std::fs;
use std::io::Read;
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

use base64::engine::general_purpose::STANDARD as BASE64_STANDARD;
use base64::Engine;
use calamine::{open_workbook_auto, Reader};
use quick_xml::events::Event;
use quick_xml::Reader as XmlReader;
use serde::{Deserialize, Serialize};
use tauri::Manager;
use zip::ZipArchive;

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SaveAttachmentFileArgs {
    pub source_path: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SaveAttachmentFileResult {
    pub path: String,
    pub name: String,
    pub size: u64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub preview_data_url: Option<String>,
}

/// 从前端拖放/粘贴保存附件：无本地路径时用 base64 写入 AppData
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SaveAttachmentFromBase64Args {
    pub name: String,
    pub content_base64: String,
    #[serde(default)]
    pub mime_type: Option<String>,
}

/// 读取附件为 data URL，用于原生 PDF 等发送（有大小上限）
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ReadAttachmentDataUrlArgs {
    pub path: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ReadAttachmentDataUrlResult {
    pub data_url: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ReadAttachmentTextArgs {
    pub path: String,
    #[serde(default)]
    pub max_bytes: Option<u64>,
    #[serde(default)]
    pub page_range: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ParseDocumentTextResult {
    pub file_type: String,
    pub content: String,
    pub truncated: bool,
    pub warnings: Vec<String>,
}

fn safe_file_name(name: &str) -> String {
    let sanitized = name
        .chars()
        .map(|ch| match ch {
            '/' | '\\' | ':' | '*' | '?' | '"' | '<' | '>' | '|' => '_',
            _ => ch,
        })
        .collect::<String>()
        .trim()
        .to_string();
    if sanitized.is_empty() {
        "attachment".to_string()
    } else {
        sanitized
    }
}

fn split_name_ext(file_name: &str) -> (&str, Option<&str>) {
    match file_name.rsplit_once('.') {
        Some((name, ext)) if !name.is_empty() && !ext.is_empty() => (name, Some(ext)),
        _ => (file_name, None),
    }
}

fn unique_file_name(file_name: &str) -> String {
    let now_ms = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis();
    let (name, ext) = split_name_ext(file_name);
    match ext {
        Some(ext) => format!("{}_{}.{}", name, now_ms, ext),
        None => format!("{}_{}", name, now_ms),
    }
}

fn guess_image_mime_by_ext(file_name: &str) -> Option<&'static str> {
    let ext = split_name_ext(file_name).1?.to_ascii_lowercase();
    match ext.as_str() {
        "png" => Some("image/png"),
        "jpg" | "jpeg" => Some("image/jpeg"),
        "gif" => Some("image/gif"),
        "webp" => Some("image/webp"),
        _ => None,
    }
}

fn read_image_preview_data_url(path: &Path, file_name: &str) -> Option<String> {
    // 仅为小图生成 base64 预览，避免大文件占用过高内存
    const MAX_PREVIEW_SIZE: u64 = 6 * 1024 * 1024;
    let meta = fs::metadata(path).ok()?;
    if meta.len() > MAX_PREVIEW_SIZE {
        return None;
    }
    let mime = guess_image_mime_by_ext(file_name)?;
    let bytes = fs::read(path).ok()?;
    let b64 = BASE64_STANDARD.encode(bytes);
    Some(format!("data:{};base64,{}", mime, b64))
}

fn is_text_like_extension(file_name: &str) -> bool {
    let ext = split_name_ext(file_name)
        .1
        .unwrap_or_default()
        .to_ascii_lowercase();
    matches!(
        ext.as_str(),
        "txt"
            | "md"
            | "json"
            | "csv"
            | "ts"
            | "tsx"
            | "js"
            | "jsx"
            | "py"
            | "rs"
            | "go"
            | "java"
            | "c"
            | "cpp"
            | "h"
            | "html"
            | "css"
            | "scss"
            | "less"
            | "xml"
            | "yaml"
            | "yml"
            | "toml"
            | "ini"
            | "sh"
            | "bash"
            | "zsh"
            | "fish"
            | "ps1"
    )
}

fn get_extension(path: &Path) -> String {
    path.extension()
        .and_then(|ext| ext.to_str())
        .unwrap_or_default()
        .to_ascii_lowercase()
}

fn truncate_text_by_chars(mut text: String, max_chars: usize) -> (String, bool) {
    let total_chars = text.chars().count();
    if total_chars <= max_chars {
        return (text, false);
    }
    text = text.chars().take(max_chars).collect::<String>();
    (format!(
        "{}\n\n[内容已截断：原始文本长度约 {} 字符，当前保留 {} 字符]",
        text, total_chars, max_chars
    ), true)
}

fn parse_plain_text(path: &Path, max_bytes: u64) -> Result<(String, bool, Vec<String>), String> {
    let meta = fs::metadata(path).map_err(|e| format!("读取附件信息失败：{}", e))?;
    let read_len = std::cmp::min(meta.len(), max_bytes) as usize;
    let mut file = fs::File::open(path).map_err(|e| format!("打开附件失败：{}", e))?;
    let mut buf = vec![0u8; read_len];
    file.read_exact(&mut buf)
        .map_err(|e| format!("读取附件内容失败：{}", e))?;
    let mut text = String::from_utf8_lossy(&buf).to_string();
    let mut warnings = Vec::new();
    let mut truncated = false;
    if meta.len() > max_bytes {
        truncated = true;
        warnings.push("文件按字节上限截断".to_string());
        text.push_str(&format!(
            "\n\n[内容已截断：原始文件超过 {} 字节]",
            max_bytes
        ));
    }
    Ok((text, truncated, warnings))
}

fn parse_page_range(raw: &str, max_page: usize) -> Vec<usize> {
    let mut pages: Vec<usize> = Vec::new();
    for part in raw.split(',') {
        let token = part.trim();
        if token.is_empty() {
            continue;
        }
        if let Some((a, b)) = token.split_once('-') {
            let start = a.trim().parse::<usize>().unwrap_or(0);
            let end = b.trim().parse::<usize>().unwrap_or(0);
            if start == 0 || end == 0 {
                continue;
            }
            let (from, to) = if start <= end { (start, end) } else { (end, start) };
            for p in from..=to {
                if p <= max_page {
                    pages.push(p);
                }
            }
        } else if let Ok(page) = token.parse::<usize>() {
            if page > 0 && page <= max_page {
                pages.push(page);
            }
        }
    }
    pages.sort_unstable();
    pages.dedup();
    pages
}

fn parse_pdf(
    path: &Path,
    max_chars: usize,
    page_range: Option<&str>,
) -> Result<(String, bool, Vec<String>), String> {
    let bytes = fs::read(path).map_err(|e| format!("读取 PDF 失败：{}", e))?;
    let mut warnings = Vec::new();
    let text = if let Some(raw_range) = page_range {
        let pages = pdf_extract::extract_text_from_mem_by_pages(&bytes)
            .map_err(|e| format!("按页解析 PDF 失败：{}", e))?;
        if pages.is_empty() {
            String::new()
        } else {
            let selected = parse_page_range(raw_range, pages.len());
            if selected.is_empty() {
                warnings.push("pageRange 无效，已回退为全文解析".to_string());
                pdf_extract::extract_text_from_mem(&bytes)
                    .map_err(|e| format!("解析 PDF 文本失败：{}", e))?
            } else {
                let mut picked = String::new();
                for p in selected {
                    if let Some(content) = pages.get(p - 1) {
                        picked.push_str(&format!("# Page {}\n{}\n\n", p, content));
                    }
                }
                picked
            }
        }
    } else {
        pdf_extract::extract_text_from_mem(&bytes)
            .map_err(|e| format!("解析 PDF 文本失败：{}", e))?
    };
    let (content, truncated) = truncate_text_by_chars(text, max_chars);
    if truncated {
        warnings.push("PDF 文本按字符上限截断".to_string());
    }
    Ok((content, truncated, warnings))
}

fn parse_docx(path: &Path, max_chars: usize) -> Result<(String, bool, Vec<String>), String> {
    let text = docx_lite::extract_text(path).map_err(|e| format!("解析 DOCX 文本失败：{}", e))?;
    let (content, truncated) = truncate_text_by_chars(text, max_chars);
    let warnings = if truncated {
        vec!["DOCX 文本按字符上限截断".to_string()]
    } else {
        Vec::new()
    };
    Ok((content, truncated, warnings))
}

fn parse_xlsx(path: &Path, max_chars: usize) -> Result<(String, bool, Vec<String>), String> {
    let mut workbook = open_workbook_auto(path).map_err(|e| format!("打开 XLSX 失败：{}", e))?;
    let sheet_names = workbook.sheet_names().to_owned();
    if sheet_names.is_empty() {
        return Ok(("该表格没有可读取的工作表。".to_string(), false, Vec::new()));
    }

    let mut out = String::new();
    for sheet_name in sheet_names {
        if let Ok(range) = workbook.worksheet_range(&sheet_name) {
            out.push_str(&format!("# Sheet: {}\n", sheet_name));
            for row in range.rows() {
                let line = row
                    .iter()
                    .map(|cell| cell.to_string())
                    .collect::<Vec<_>>()
                    .join("\t");
                if !line.trim().is_empty() {
                    out.push_str(&line);
                    out.push('\n');
                }
            }
            out.push('\n');
        }
    }
    if out.trim().is_empty() {
        return Ok(("该表格没有可读取的文本单元格。".to_string(), false, Vec::new()));
    }
    let (content, truncated) = truncate_text_by_chars(out, max_chars);
    let warnings = if truncated {
        vec!["XLSX 文本按字符上限截断".to_string()]
    } else {
        Vec::new()
    };
    Ok((content, truncated, warnings))
}

fn extract_slide_index(name: &str) -> usize {
    let slide_name = name
        .rsplit('/')
        .next()
        .unwrap_or(name)
        .strip_suffix(".xml")
        .unwrap_or(name);
    let num = slide_name
        .strip_prefix("slide")
        .unwrap_or("0")
        .parse::<usize>()
        .unwrap_or(0);
    num
}

fn parse_pptx(path: &Path, max_chars: usize) -> Result<(String, bool, Vec<String>), String> {
    let file = fs::File::open(path).map_err(|e| format!("打开 PPTX 失败：{}", e))?;
    let mut archive = ZipArchive::new(file).map_err(|e| format!("读取 PPTX 结构失败：{}", e))?;

    let mut slide_names: Vec<String> = Vec::new();
    for i in 0..archive.len() {
        let entry = archive
            .by_index(i)
            .map_err(|e| format!("读取 PPTX 幻灯片失败：{}", e))?;
        let name = entry.name().to_string();
        if name.starts_with("ppt/slides/slide") && name.ends_with(".xml") {
            slide_names.push(name);
        }
    }
    if slide_names.is_empty() {
        return Ok(("该演示文稿没有可读取的幻灯片。".to_string(), false, Vec::new()));
    }
    slide_names.sort_by_key(|name| extract_slide_index(name));

    let mut out = String::new();
    for slide_name in &slide_names {
        let slide_index = extract_slide_index(slide_name);
        let mut entry = archive
            .by_name(slide_name)
            .map_err(|e| format!("读取 PPTX 幻灯片内容失败：{}", e))?;
        let mut bytes = Vec::new();
        entry
            .read_to_end(&mut bytes)
            .map_err(|e| format!("读取 PPTX 幻灯片内容失败：{}", e))?;

        let mut reader = XmlReader::from_reader(bytes.as_slice());
        reader.config_mut().trim_text(true);
        let mut buf = Vec::new();
        let mut texts: Vec<String> = Vec::new();
        loop {
            match reader.read_event_into(&mut buf) {
                Ok(Event::Text(text_event)) => {
                    if let Ok(text) = text_event.unescape() {
                        let value = text.into_owned();
                        if !value.trim().is_empty() {
                            texts.push(value);
                        }
                    }
                }
                Ok(Event::Eof) => break,
                Ok(_) => {}
                Err(err) => {
                    return Err(format!("解析 PPTX XML 失败：{}", err));
                }
            }
            buf.clear();
        }

        out.push_str(&format!("# Slide {}\n", if slide_index == 0 { 1 } else { slide_index }));
        if texts.is_empty() {
            out.push_str("[空白或无文本]\n\n");
        } else {
            out.push_str(&texts.join(" "));
            out.push_str("\n\n");
        }
    }

    let (content, truncated) = truncate_text_by_chars(out, max_chars);
    let warnings = if truncated {
        vec!["PPTX 文本按字符上限截断".to_string()]
    } else {
        Vec::new()
    };
    Ok((content, truncated, warnings))
}

/// 最大以 data URL 读取的附件大小（25MB），避免内存溢出
const MAX_DATA_URL_BYTES: u64 = 25 * 1024 * 1024;

#[tauri::command]
pub fn save_attachment_from_base64(
    app: tauri::AppHandle,
    args: SaveAttachmentFromBase64Args,
) -> Result<SaveAttachmentFileResult, String> {
    let app_data_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("获取应用目录失败：{}", e))?;
    let attachment_dir = app_data_dir.join("attachments");
    fs::create_dir_all(&attachment_dir).map_err(|e| format!("创建附件目录失败：{}", e))?;

    let bytes = BASE64_STANDARD
        .decode(&args.content_base64)
        .map_err(|e| format!("Base64 解码失败：{}", e))?;
    let origin_name = safe_file_name(&args.name);
    let final_name = unique_file_name(&origin_name);
    let dest_path: PathBuf = attachment_dir.join(&final_name);

    fs::write(&dest_path, &bytes).map_err(|e| format!("保存附件失败：{}", e))?;
    let size = bytes.len() as u64;
    let preview_data_url = read_image_preview_data_url(&dest_path, &origin_name);

    Ok(SaveAttachmentFileResult {
        path: dest_path.to_string_lossy().to_string(),
        name: origin_name,
        size,
        preview_data_url,
    })
}

#[tauri::command]
pub fn read_attachment_as_data_url(
    app: tauri::AppHandle,
    args: ReadAttachmentDataUrlArgs,
) -> Result<ReadAttachmentDataUrlResult, String> {
    let app_data_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("获取应用目录失败：{}", e))?;
    let attachment_dir = app_data_dir.join("attachments");

    let requested_path = Path::new(&args.path);
    let canonical_requested = requested_path
        .canonicalize()
        .map_err(|e| format!("读取附件失败：{}", e))?;
    let canonical_root = attachment_dir
        .canonicalize()
        .map_err(|e| format!("附件目录不可用：{}", e))?;

    if !canonical_requested.starts_with(&canonical_root) {
        return Err("无权读取该附件路径".to_string());
    }
    if !canonical_requested.is_file() {
        return Err("附件文件不存在".to_string());
    }

    let meta = fs::metadata(&canonical_requested).map_err(|e| format!("读取文件信息失败：{}", e))?;
    if meta.len() > MAX_DATA_URL_BYTES {
        return Err(format!(
            "附件超过 {}MB，无法以原生方式发送，请使用「文本提取」或缩小文件",
            MAX_DATA_URL_BYTES / (1024 * 1024)
        ));
    }

    let file_name = canonical_requested
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("file");
    let ext = get_extension(&canonical_requested);
    let mime = match ext.as_str() {
        "pdf" => "application/pdf",
        _ => {
            if let Some(m) = guess_image_mime_by_ext(file_name) {
                m
            } else {
                "application/octet-stream"
            }
        }
    };
    let bytes = fs::read(&canonical_requested).map_err(|e| format!("读取附件内容失败：{}", e))?;
    let b64 = BASE64_STANDARD.encode(&bytes);
    let data_url = format!("data:{};base64,{}", mime, b64);

    Ok(ReadAttachmentDataUrlResult { data_url })
}

#[tauri::command]
pub fn save_attachment_file(
    app: tauri::AppHandle,
    args: SaveAttachmentFileArgs,
) -> Result<SaveAttachmentFileResult, String> {
    let src_path = Path::new(&args.source_path);
    if !src_path.exists() {
        return Err("源文件不存在".to_string());
    }

    let src_meta = fs::metadata(src_path).map_err(|e| format!("读取源文件失败：{}", e))?;
    if !src_meta.is_file() {
        return Err("仅支持上传文件".to_string());
    }

    let app_data_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("获取应用目录失败：{}", e))?;
    let attachment_dir = app_data_dir.join("attachments");
    fs::create_dir_all(&attachment_dir).map_err(|e| format!("创建附件目录失败：{}", e))?;

    let origin_name = src_path
        .file_name()
        .and_then(|n| n.to_str())
        .map(safe_file_name)
        .unwrap_or_else(|| "attachment".to_string());
    let final_name = unique_file_name(&origin_name);
    let dest_path: PathBuf = attachment_dir.join(final_name);

    fs::copy(src_path, &dest_path).map_err(|e| format!("保存附件失败：{}", e))?;
    let size = fs::metadata(&dest_path)
        .map_err(|e| format!("读取附件信息失败：{}", e))?
        .len();
    let preview_data_url = read_image_preview_data_url(&dest_path, &origin_name);

    Ok(SaveAttachmentFileResult {
        path: dest_path.to_string_lossy().to_string(),
        name: origin_name,
        size,
        preview_data_url,
    })
}

#[tauri::command]
pub fn parse_document_text(
    app: tauri::AppHandle,
    args: ReadAttachmentTextArgs,
) -> Result<ParseDocumentTextResult, String> {
    let app_data_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("获取应用目录失败：{}", e))?;
    let attachment_dir = app_data_dir.join("attachments");

    let requested_path = Path::new(&args.path);
    let canonical_requested = requested_path
        .canonicalize()
        .map_err(|e| format!("读取附件失败：{}", e))?;
    let canonical_root = attachment_dir
        .canonicalize()
        .map_err(|e| format!("附件目录不可用：{}", e))?;

    if !canonical_requested.starts_with(&canonical_root) {
        return Err("无权读取该附件路径".to_string());
    }
    if !canonical_requested.is_file() {
        return Err("附件文件不存在".to_string());
    }

    let file_name = canonical_requested
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or_default();
    let extension = get_extension(&canonical_requested);
    let can_parse = is_text_like_extension(file_name)
        || extension == "pdf"
        || extension == "docx"
        || extension == "xlsx"
        || extension == "pptx";
    if !can_parse {
        return Err("该附件不是可读取的文本文件".to_string());
    }

    let max_bytes = args.max_bytes.unwrap_or(128 * 1024).min(512 * 1024);
    let max_chars = std::cmp::max(4096, max_bytes as usize);
    let (content, truncated, mut warnings) = match extension.as_str() {
        "pdf" => parse_pdf(&canonical_requested, max_chars, args.page_range.as_deref())?,
        "docx" => parse_docx(&canonical_requested, max_chars)?,
        "xlsx" => parse_xlsx(&canonical_requested, max_chars)?,
        "pptx" => parse_pptx(&canonical_requested, max_chars)?,
        "doc" => {
            return Err("DOC 老格式暂未支持，请先转换为 DOCX 或 PDF。".to_string());
        }
        _ => parse_plain_text(&canonical_requested, max_bytes)?,
    };
    if content.trim().is_empty() {
        warnings.push("解析结果为空文本".to_string());
    }
    Ok(ParseDocumentTextResult {
        file_type: extension,
        content,
        truncated,
        warnings,
    })
}
