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
