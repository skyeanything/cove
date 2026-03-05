use std::path::Path;

use super::file_utils::{get_extension, is_text_like_extension};
use super::parsers::{parse_docx, parse_pdf, parse_plain_text, parse_pptx, parse_xlsx};
use super::{AttachmentMetadata, PreprocessAttachmentArgs, PreprocessAttachmentResult};

/// Default max chars for preprocessing (64K)
const DEFAULT_MAX_CHARS: usize = 65_536;

/// Summary length: first N characters of content, whitespace-normalized
const SUMMARY_LENGTH: usize = 800;

fn classify_file_type(ext: &str) -> &'static str {
    match ext {
        "pdf" => "pdf",
        "docx" => "docx",
        "xlsx" => "xlsx",
        "pptx" => "pptx",
        "png" | "jpg" | "jpeg" | "gif" | "webp" | "svg" | "bmp" | "ico" => "image",
        _ if is_text_like_extension(&format!("f.{}", ext)) => "text",
        _ => "binary",
    }
}

fn make_summary(content: &str) -> String {
    let normalized: String = content
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ");
    if normalized.len() <= SUMMARY_LENGTH {
        normalized
    } else {
        let truncated: String = normalized.chars().take(SUMMARY_LENGTH).collect();
        format!("{}...", truncated)
    }
}

fn get_image_dimensions(path: &Path) -> Option<(u32, u32)> {
    let bytes = std::fs::read(path).ok()?;
    let ext = get_extension(path);
    match ext.as_str() {
        "png" => parse_png_dimensions(&bytes),
        "jpg" | "jpeg" => parse_jpeg_dimensions(&bytes),
        "gif" => parse_gif_dimensions(&bytes),
        "webp" => parse_webp_dimensions(&bytes),
        _ => None,
    }
}

fn parse_png_dimensions(bytes: &[u8]) -> Option<(u32, u32)> {
    if bytes.len() < 24 || &bytes[0..8] != b"\x89PNG\r\n\x1a\n" {
        return None;
    }
    let width = u32::from_be_bytes([bytes[16], bytes[17], bytes[18], bytes[19]]);
    let height = u32::from_be_bytes([bytes[20], bytes[21], bytes[22], bytes[23]]);
    Some((width, height))
}

fn parse_jpeg_dimensions(bytes: &[u8]) -> Option<(u32, u32)> {
    if bytes.len() < 2 || bytes[0] != 0xFF || bytes[1] != 0xD8 {
        return None;
    }
    let mut i = 2;
    while i + 1 < bytes.len() {
        if bytes[i] != 0xFF {
            i += 1;
            continue;
        }
        let marker = bytes[i + 1];
        if marker == 0xC0 || marker == 0xC2 {
            if i + 9 < bytes.len() {
                let height = u16::from_be_bytes([bytes[i + 5], bytes[i + 6]]) as u32;
                let width = u16::from_be_bytes([bytes[i + 7], bytes[i + 8]]) as u32;
                return Some((width, height));
            }
            return None;
        }
        if i + 3 < bytes.len() {
            let len = u16::from_be_bytes([bytes[i + 2], bytes[i + 3]]) as usize;
            i += 2 + len;
        } else {
            break;
        }
    }
    None
}

fn parse_gif_dimensions(bytes: &[u8]) -> Option<(u32, u32)> {
    if bytes.len() < 10 || &bytes[0..3] != b"GIF" {
        return None;
    }
    let width = u16::from_le_bytes([bytes[6], bytes[7]]) as u32;
    let height = u16::from_le_bytes([bytes[8], bytes[9]]) as u32;
    Some((width, height))
}

fn parse_webp_dimensions(bytes: &[u8]) -> Option<(u32, u32)> {
    if bytes.len() < 30 || &bytes[0..4] != b"RIFF" || &bytes[8..12] != b"WEBP" {
        return None;
    }
    if &bytes[12..16] == b"VP8 " && bytes.len() >= 30 {
        let width = (u16::from_le_bytes([bytes[26], bytes[27]]) & 0x3FFF) as u32;
        let height = (u16::from_le_bytes([bytes[28], bytes[29]]) & 0x3FFF) as u32;
        return Some((width, height));
    }
    if &bytes[12..16] == b"VP8L" && bytes.len() >= 25 {
        let bits = u32::from_le_bytes([bytes[21], bytes[22], bytes[23], bytes[24]]);
        let width = (bits & 0x3FFF) + 1;
        let height = ((bits >> 14) & 0x3FFF) + 1;
        return Some((width, height));
    }
    None
}

fn count_lines(content: &str) -> usize {
    content.lines().count()
}

#[tauri::command]
pub fn preprocess_attachment(
    args: PreprocessAttachmentArgs,
) -> Result<PreprocessAttachmentResult, String> {
    let path = Path::new(&args.path);
    if !path.is_file() {
        return Err("File does not exist".to_string());
    }

    let file_name = path
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or_default();
    let ext = get_extension(path);
    let file_type = classify_file_type(&ext);

    // Images: return dimensions only, no text content
    if file_type == "image" {
        let dims = get_image_dimensions(path);
        return Ok(PreprocessAttachmentResult {
            file_type: file_type.to_string(),
            content: String::new(),
            summary: String::new(),
            char_count: 0,
            truncated: false,
            warnings: Vec::new(),
            metadata: AttachmentMetadata {
                image_dimensions: dims.map(|(w, h)| format!("{}x{}", w, h)),
                ..Default::default()
            },
        });
    }

    // Binary/unsupported: no content
    if file_type == "binary" {
        return Ok(PreprocessAttachmentResult {
            file_type: file_type.to_string(),
            content: String::new(),
            summary: String::new(),
            char_count: 0,
            truncated: false,
            warnings: vec!["Unsupported file type for text extraction".to_string()],
            metadata: AttachmentMetadata::default(),
        });
    }

    let max_chars = args.max_chars.unwrap_or(DEFAULT_MAX_CHARS);
    let max_bytes = max_chars as u64;

    let (content, truncated, mut warnings) = match ext.as_str() {
        "pdf" => parse_pdf(path, max_chars, None)?,
        "docx" => parse_docx(path, max_chars)?,
        "xlsx" => parse_xlsx(path, max_chars)?,
        "pptx" => parse_pptx(path, max_chars)?,
        "doc" => {
            return Err("DOC format not supported. Please convert to DOCX or PDF.".to_string());
        }
        _ => parse_plain_text(path, max_bytes)?,
    };

    if content.trim().is_empty() {
        warnings.push("Parsed content is empty".to_string());
    }

    let char_count = content.chars().count();
    let summary = make_summary(&content);

    // Build metadata based on file type
    let metadata = match ext.as_str() {
        "xlsx" => {
            let sheet_count = content.matches("# Sheet:").count();
            AttachmentMetadata {
                sheet_names: if sheet_count > 0 {
                    Some(
                        content
                            .lines()
                            .filter(|l| l.starts_with("# Sheet:"))
                            .map(|l| l.trim_start_matches("# Sheet: ").to_string())
                            .collect(),
                    )
                } else {
                    None
                },
                ..Default::default()
            }
        }
        "pptx" => {
            let slide_count = content.matches("# Slide").count();
            AttachmentMetadata {
                slide_count: if slide_count > 0 {
                    Some(slide_count as u32)
                } else {
                    None
                },
                ..Default::default()
            }
        }
        _ if is_text_like_extension(file_name) => AttachmentMetadata {
            line_count: Some(count_lines(&content) as u32),
            ..Default::default()
        },
        _ => AttachmentMetadata::default(),
    };

    Ok(PreprocessAttachmentResult {
        file_type: file_type.to_string(),
        content,
        summary,
        char_count,
        truncated,
        warnings,
        metadata,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn classify_file_types() {
        assert_eq!(classify_file_type("pdf"), "pdf");
        assert_eq!(classify_file_type("docx"), "docx");
        assert_eq!(classify_file_type("xlsx"), "xlsx");
        assert_eq!(classify_file_type("pptx"), "pptx");
        assert_eq!(classify_file_type("png"), "image");
        assert_eq!(classify_file_type("jpg"), "image");
        assert_eq!(classify_file_type("ts"), "text");
        assert_eq!(classify_file_type("py"), "text");
        assert_eq!(classify_file_type("exe"), "binary");
    }

    #[test]
    fn summary_short_text() {
        let s = make_summary("Hello world");
        assert_eq!(s, "Hello world");
    }

    #[test]
    fn summary_long_text() {
        let long = "word ".repeat(500);
        let s = make_summary(&long);
        assert!(s.len() <= SUMMARY_LENGTH + 10);
        assert!(s.ends_with("..."));
    }

    #[test]
    fn summary_normalizes_whitespace() {
        let s = make_summary("  hello   world  \n  foo  ");
        assert_eq!(s, "hello world foo");
    }

    #[test]
    fn png_dimensions() {
        let png: [u8; 24] = [
            0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, // signature
            0x00, 0x00, 0x00, 0x0D, 0x49, 0x48, 0x44, 0x52, // IHDR
            0x00, 0x00, 0x00, 0x64, // width = 100
            0x00, 0x00, 0x00, 0xC8, // height = 200
        ];
        assert_eq!(parse_png_dimensions(&png), Some((100, 200)));
    }

    #[test]
    fn gif_dimensions() {
        let mut gif = vec![0u8; 10];
        gif[0..3].copy_from_slice(b"GIF");
        gif[6..8].copy_from_slice(&50u16.to_le_bytes()); // width
        gif[8..10].copy_from_slice(&30u16.to_le_bytes()); // height
        assert_eq!(parse_gif_dimensions(&gif), Some((50, 30)));
    }
}
