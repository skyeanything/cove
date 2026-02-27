use std::fs;
use std::path::Path;
use std::time::{SystemTime, UNIX_EPOCH};

use base64::engine::general_purpose::STANDARD as BASE64_STANDARD;
use base64::Engine;

pub(super) fn safe_file_name(name: &str) -> String {
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

pub(super) fn split_name_ext(file_name: &str) -> (&str, Option<&str>) {
    match file_name.rsplit_once('.') {
        Some((name, ext)) if !name.is_empty() && !ext.is_empty() => (name, Some(ext)),
        _ => (file_name, None),
    }
}

pub(super) fn unique_file_name(file_name: &str) -> String {
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

pub(super) fn guess_image_mime_by_ext(file_name: &str) -> Option<&'static str> {
    let ext = split_name_ext(file_name).1?.to_ascii_lowercase();
    match ext.as_str() {
        "png" => Some("image/png"),
        "jpg" | "jpeg" => Some("image/jpeg"),
        "gif" => Some("image/gif"),
        "webp" => Some("image/webp"),
        _ => None,
    }
}

pub(super) fn read_image_preview_data_url(path: &Path, file_name: &str) -> Option<String> {
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

pub(super) fn is_text_like_extension(file_name: &str) -> bool {
    let ext = split_name_ext(file_name)
        .1
        .unwrap_or_default()
        .to_ascii_lowercase();
    matches!(
        ext.as_str(),
        "txt"
            | "md"
            | "qmd"
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

pub(super) fn get_extension(path: &Path) -> String {
    path.extension()
        .and_then(|ext| ext.to_str())
        .unwrap_or_default()
        .to_ascii_lowercase()
}

pub(super) fn truncate_text_by_chars(mut text: String, max_chars: usize) -> (String, bool) {
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

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;

    // ---- safe_file_name ----

    #[test]
    fn safe_file_name_normal() {
        assert_eq!(safe_file_name("report.pdf"), "report.pdf");
    }

    #[test]
    fn safe_file_name_replaces_unsafe_chars() {
        assert_eq!(safe_file_name("a/b\\c:d*e?f\"g<h>i|j"), "a_b_c_d_e_f_g_h_i_j");
    }

    #[test]
    fn safe_file_name_empty_or_whitespace() {
        assert_eq!(safe_file_name(""), "attachment");
        assert_eq!(safe_file_name("   "), "attachment");
    }

    // ---- split_name_ext ----

    #[test]
    fn split_name_ext_with_extension() {
        assert_eq!(split_name_ext("foo.txt"), ("foo", Some("txt")));
    }

    #[test]
    fn split_name_ext_no_extension() {
        assert_eq!(split_name_ext("noext"), ("noext", None));
    }

    #[test]
    fn split_name_ext_hidden_file() {
        assert_eq!(split_name_ext(".hidden"), (".hidden", None));
    }

    #[test]
    fn split_name_ext_multiple_dots() {
        assert_eq!(split_name_ext("a.b.c"), ("a.b", Some("c")));
    }

    // ---- unique_file_name ----

    #[test]
    fn unique_file_name_with_ext() {
        let result = unique_file_name("doc.pdf");
        assert!(result.starts_with("doc_"));
        assert!(result.ends_with(".pdf"));
    }

    #[test]
    fn unique_file_name_without_ext() {
        let result = unique_file_name("noext");
        assert!(result.starts_with("noext_"));
        assert!(!result.contains('.'));
    }

    // ---- guess_image_mime_by_ext ----

    #[test]
    fn guess_image_mime_known_types() {
        assert_eq!(guess_image_mime_by_ext("a.png"), Some("image/png"));
        assert_eq!(guess_image_mime_by_ext("b.jpg"), Some("image/jpeg"));
        assert_eq!(guess_image_mime_by_ext("c.jpeg"), Some("image/jpeg"));
        assert_eq!(guess_image_mime_by_ext("d.gif"), Some("image/gif"));
        assert_eq!(guess_image_mime_by_ext("e.webp"), Some("image/webp"));
    }

    #[test]
    fn guess_image_mime_non_image() {
        assert_eq!(guess_image_mime_by_ext("file.pdf"), None);
        assert_eq!(guess_image_mime_by_ext("noext"), None);
    }

    // ---- is_text_like_extension ----

    #[test]
    fn is_text_like_known_types() {
        for ext in ["txt", "md", "json", "py", "rs", "html"] {
            assert!(is_text_like_extension(&format!("file.{}", ext)), "expected true for {}", ext);
        }
    }

    #[test]
    fn is_text_like_non_text() {
        for ext in ["pdf", "png", "exe"] {
            assert!(!is_text_like_extension(&format!("file.{}", ext)), "expected false for {}", ext);
        }
        assert!(!is_text_like_extension("noext"));
    }

    // ---- get_extension ----

    #[test]
    fn get_extension_lowercased() {
        assert_eq!(get_extension(Path::new("file.PDF")), "pdf");
    }

    #[test]
    fn get_extension_none() {
        assert_eq!(get_extension(Path::new("noext")), "");
    }

    // ---- truncate_text_by_chars ----

    #[test]
    fn truncate_within_limit() {
        let (text, truncated) = truncate_text_by_chars("hello".to_string(), 100);
        assert_eq!(text, "hello");
        assert!(!truncated);
    }

    #[test]
    fn truncate_over_limit() {
        let (text, truncated) = truncate_text_by_chars("abcdef".to_string(), 3);
        assert!(truncated);
        assert!(text.starts_with("abc"));
        assert!(text.contains("内容已截断"));
    }

    // ---- read_image_preview_data_url ----

    #[test]
    fn read_image_preview_small_png() {
        // Minimal valid 1x1 white PNG
        let png_bytes: [u8; 69] = [
            0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, // PNG signature
            0x00, 0x00, 0x00, 0x0D, 0x49, 0x48, 0x44, 0x52, // IHDR chunk
            0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
            0x08, 0x02, 0x00, 0x00, 0x00, 0x90, 0x77, 0x53,
            0xDE, 0x00, 0x00, 0x00, 0x0C, 0x49, 0x44, 0x41, // IDAT chunk
            0x54, 0x08, 0xD7, 0x63, 0xF8, 0xCF, 0xC0, 0x00,
            0x00, 0x00, 0x02, 0x00, 0x01, 0xE2, 0x21, 0xBC,
            0x33, 0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4E, // IEND chunk
            0x44, 0xAE, 0x42, 0x60, 0x82,
        ];
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("tiny.png");
        let mut f = std::fs::File::create(&path).unwrap();
        f.write_all(&png_bytes).unwrap();

        let result = read_image_preview_data_url(&path, "tiny.png");
        assert!(result.is_some());
        let url = result.unwrap();
        assert!(url.starts_with("data:image/png;base64,"));
    }

    #[test]
    fn read_image_preview_non_image() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("doc.pdf");
        std::fs::write(&path, b"fake pdf content").unwrap();

        assert!(read_image_preview_data_url(&path, "doc.pdf").is_none());
    }
}
