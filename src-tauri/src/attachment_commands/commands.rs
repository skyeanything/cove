use std::fs;
use std::path::Path;

use base64::engine::general_purpose::STANDARD as BASE64_STANDARD;
use base64::Engine;
use tauri::Manager;

use super::file_utils::{
    get_extension, guess_image_mime_by_ext, is_text_like_extension, read_image_preview_data_url,
    safe_file_name, unique_file_name,
};
use super::parsers::{parse_docx, parse_pdf, parse_plain_text, parse_pptx, parse_xlsx};
use super::{
    ParseDocumentTextResult, ReadAttachmentDataUrlArgs, ReadAttachmentDataUrlResult,
    ReadAttachmentTextArgs, SaveAttachmentFileArgs, SaveAttachmentFileResult,
    SaveAttachmentFromBase64Args,
};

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
    let dest_path = attachment_dir.join(&final_name);

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
    let dest_path = attachment_dir.join(final_name);

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
