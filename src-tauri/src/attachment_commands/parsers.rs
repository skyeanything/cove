use std::fs;
use std::io::Read;
use std::path::Path;

use calamine::{open_workbook_auto, Reader};
use quick_xml::events::Event;
use quick_xml::Reader as XmlReader;
use zip::ZipArchive;

use super::file_utils::truncate_text_by_chars;

pub(super) fn parse_plain_text(path: &Path, max_bytes: u64) -> Result<(String, bool, Vec<String>), String> {
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

pub(super) fn parse_page_range(raw: &str, max_page: usize) -> Vec<usize> {
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

pub(super) fn parse_pdf(
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

pub(super) fn parse_docx(path: &Path, max_chars: usize) -> Result<(String, bool, Vec<String>), String> {
    let text = docx_lite::extract_text(path).map_err(|e| format!("解析 DOCX 文本失败：{}", e))?;
    let (content, truncated) = truncate_text_by_chars(text, max_chars);
    let warnings = if truncated {
        vec!["DOCX 文本按字符上限截断".to_string()]
    } else {
        Vec::new()
    };
    Ok((content, truncated, warnings))
}

pub(super) fn parse_xlsx(path: &Path, max_chars: usize) -> Result<(String, bool, Vec<String>), String> {
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

pub(super) fn parse_pptx(path: &Path, max_chars: usize) -> Result<(String, bool, Vec<String>), String> {
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn page_range_basics() {
        assert_eq!(parse_page_range("1,3,5", 10), vec![1, 3, 5]);
        assert_eq!(parse_page_range("2-5", 10), vec![2, 3, 4, 5]);
        assert_eq!(parse_page_range("1,3-5,7", 10), vec![1, 3, 4, 5, 7]);
    }

    #[test]
    fn page_range_reversed() {
        assert_eq!(parse_page_range("5-2", 10), vec![2, 3, 4, 5]);
    }

    #[test]
    fn page_range_edge_cases() {
        assert_eq!(parse_page_range("1,99", 5), vec![1]); // out of bounds
        assert_eq!(parse_page_range("1,1,2", 10), vec![1, 2]); // dedup
        let empty: Vec<usize> = vec![];
        assert_eq!(parse_page_range("", 10), empty);
        assert_eq!(parse_page_range("abc", 10), empty);
    }

    #[test]
    fn slide_index() {
        assert_eq!(extract_slide_index("ppt/slides/slide3.xml"), 3);
        assert_eq!(extract_slide_index("ppt/slides/slide12.xml"), 12);
        assert_eq!(extract_slide_index("garbage"), 0);
    }

    #[test]
    fn plain_text_reads_content() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("test.txt");
        std::fs::write(&path, "hello world").unwrap();
        let (text, truncated, warnings) = parse_plain_text(&path, 1024).unwrap();
        assert_eq!(text, "hello world");
        assert!(!truncated);
        assert!(warnings.is_empty());
    }

    #[test]
    fn plain_text_truncates_large_file() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("big.txt");
        std::fs::write(&path, "a".repeat(200)).unwrap();
        let (text, truncated, warnings) = parse_plain_text(&path, 50).unwrap();
        assert!(truncated);
        assert!(!warnings.is_empty());
        assert!(text.contains("内容已截断"));
    }
}
