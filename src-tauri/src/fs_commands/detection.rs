use std::io::Read;
use std::path::Path;

// ---------------------------------------------------------------------------
// 常量
// ---------------------------------------------------------------------------

pub(super) const READ_MAX_BYTES: u64 = 250 * 1024; // 250KB
pub(super) const READ_DATA_URL_MAX_BYTES: u64 = 25 * 1024 * 1024; // 25MB
pub(super) const LINE_MAX_CHARS: usize = 2000;

// ---------------------------------------------------------------------------
// 二进制检测
// ---------------------------------------------------------------------------

const BINARY_EXTENSIONS: &[&str] = &[
    "exe", "dll", "so", "dylib", "bin", "pyc", "pyo", "zip", "tar", "gz", "xz", "z", "bz2", "7z",
    "rar", "png", "jpg", "jpeg", "gif", "webp", "ico", "bmp", "pdf", "woff", "woff2", "ttf", "otf",
    "mp3", "wav", "ogg", "mp4", "webm", "mov", "avi", "mkv",
];

pub(super) fn path_has_binary_extension(p: &Path) -> bool {
    p.extension()
        .and_then(|e| e.to_str())
        .map(|e| BINARY_EXTENSIONS.iter().any(|ext| ext.eq_ignore_ascii_case(e)))
        .unwrap_or(false)
}

/// 已知的纯文本扩展名（跳过二进制内容检测，用 lossy UTF-8 读取）
const TEXT_EXTENSIONS: &[&str] = &[
    "txt", "md", "qmd", "markdown", "csv", "json", "yaml", "yml", "toml", "ini", "xml",
    "html", "htm", "css", "scss", "less", "js", "jsx", "ts", "tsx", "mjs", "cjs",
    "py", "rs", "go", "java", "c", "cpp", "h", "sh", "bash", "zsh", "fish", "ps1",
    "sql", "graphql", "vue", "svelte", "log", "cfg", "conf", "env",
];

pub(super) fn path_has_text_extension(p: &Path) -> bool {
    p.extension()
        .and_then(|e| e.to_str())
        .map(|e| TEXT_EXTENSIONS.iter().any(|ext| ext.eq_ignore_ascii_case(e)))
        .unwrap_or(false)
}

/// 读取前 8KB，若非 UTF-8 或可打印字节占比 < 70% 则视为二进制。
pub(super) fn is_binary_content(mut reader: impl Read) -> Result<bool, std::io::Error> {
    let mut buf = [0u8; 8192];
    let n = reader.read(&mut buf)?;
    let buf = &buf[..n];
    if buf.is_empty() {
        return Ok(false);
    }
    match std::str::from_utf8(buf) {
        Ok(s) => {
            let printable = s.chars().filter(|c| !c.is_control() || *c == '\n' || *c == '\r' || *c == '\t').count();
            let total = s.chars().count().max(1);
            Ok(printable * 100 / total < 70)
        }
        Err(_) => Ok(true),
    }
}

// ---------------------------------------------------------------------------
// MIME 检测：优先 magic bytes，扩展名 fallback
// ---------------------------------------------------------------------------

pub(super) fn mime_from_magic(bytes: &[u8]) -> Option<&'static str> {
    if bytes.len() < 12 {
        return None;
    }
    // PNG
    if bytes.starts_with(&[0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]) {
        return Some("image/png");
    }
    // JPEG
    if bytes.starts_with(&[0xFF, 0xD8, 0xFF]) {
        return Some("image/jpeg");
    }
    // GIF
    if bytes.starts_with(b"GIF87a") || bytes.starts_with(b"GIF89a") {
        return Some("image/gif");
    }
    // WebP: RIFF....WEBP
    if bytes.len() >= 12 && bytes[0..4] == [0x52, 0x49, 0x46, 0x46] && bytes[8..12] == *b"WEBP" {
        return Some("image/webp");
    }
    // PDF
    if bytes.starts_with(b"%PDF") {
        return Some("application/pdf");
    }
    // ZIP (含 docx/xlsx/pptx)
    if bytes.len() >= 4 && bytes[0..2] == [0x50, 0x4B] && (bytes[2] == 0x03 || bytes[2] == 0x05) {
        return Some("application/zip");
    }
    // SVG (文本，可选按内容判断；此处不检测，交给扩展名)
    None
}

pub(super) fn mime_from_extension(p: &Path) -> &'static str {
    let ext = p
        .extension()
        .and_then(|e| e.to_str())
        .map(|s| s.to_lowercase());
    match ext.as_deref() {
        Some("png") => "image/png",
        Some("jpg") | Some("jpeg") => "image/jpeg",
        Some("gif") => "image/gif",
        Some("webp") => "image/webp",
        Some("svg") => "image/svg+xml",
        Some("pdf") => "application/pdf",
        Some("docx") => "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        Some("xlsx") => "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        Some("pptx") => "application/vnd.openxmlformats-officedocument.presentationml.presentation",
        _ => "application/octet-stream",
    }
}
