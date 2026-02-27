use std::io::Cursor;
use std::path::Path;

use super::detection::{
    is_binary_content, mime_from_extension, mime_from_magic, path_has_binary_extension,
    path_has_text_extension,
};

// ---------------------------------------------------------------------------
// path_has_binary_extension
// ---------------------------------------------------------------------------

#[test]
fn binary_ext_common_formats() {
    for ext in &["png", "jpg", "jpeg", "exe", "dll", "zip", "pdf", "mp4", "gif", "webp"] {
        let name = format!("file.{ext}");
        assert!(path_has_binary_extension(Path::new(&name)), "expected true for .{ext}");
    }
}

#[test]
fn binary_ext_case_insensitive() {
    assert!(path_has_binary_extension(Path::new("photo.PNG")));
    assert!(path_has_binary_extension(Path::new("photo.Jpg")));
}

#[test]
fn binary_ext_false_for_text() {
    for ext in &["rs", "txt", "md", "json", "ts"] {
        let name = format!("f.{ext}");
        assert!(!path_has_binary_extension(Path::new(&name)));
    }
}

#[test]
fn binary_ext_false_for_no_extension() {
    assert!(!path_has_binary_extension(Path::new("Makefile")));
    assert!(!path_has_binary_extension(Path::new("LICENSE")));
}

// ---------------------------------------------------------------------------
// path_has_text_extension
// ---------------------------------------------------------------------------

#[test]
fn text_ext_common_formats() {
    for ext in &["txt", "md", "json", "rs", "ts", "py", "css", "html", "yaml"] {
        let name = format!("file.{ext}");
        assert!(path_has_text_extension(Path::new(&name)), "expected true for .{ext}");
    }
}

#[test]
fn text_ext_case_insensitive() {
    assert!(path_has_text_extension(Path::new("README.TXT")));
    assert!(path_has_text_extension(Path::new("main.Rs")));
}

#[test]
fn text_ext_false_for_binary() {
    assert!(!path_has_text_extension(Path::new("image.png")));
    assert!(!path_has_text_extension(Path::new("app.exe")));
}

#[test]
fn text_ext_false_for_no_extension() {
    assert!(!path_has_text_extension(Path::new("Makefile")));
}

// ---------------------------------------------------------------------------
// is_binary_content
// ---------------------------------------------------------------------------

#[test]
fn binary_content_empty_not_binary() {
    let cursor = Cursor::new(Vec::<u8>::new());
    assert!(!is_binary_content(cursor).unwrap());
}

#[test]
fn binary_content_utf8_text_not_binary() {
    let cursor = Cursor::new(b"Hello, world! This is plain ASCII text.\n");
    assert!(!is_binary_content(cursor).unwrap());
}

#[test]
fn binary_content_with_whitespace_not_binary() {
    let cursor = Cursor::new(b"line1\tvalue\nline2\rline3\r\n");
    assert!(!is_binary_content(cursor).unwrap());
}

#[test]
fn binary_content_control_chars_is_binary() {
    let data = vec![0x01u8; 100];
    assert!(is_binary_content(Cursor::new(data)).unwrap());
}

#[test]
fn binary_content_invalid_utf8_is_binary() {
    let data = vec![0xFF, 0xFE, 0x00, 0x01, 0xFF, 0xFE];
    assert!(is_binary_content(Cursor::new(data)).unwrap());
}

// ---------------------------------------------------------------------------
// mime_from_magic
// ---------------------------------------------------------------------------

#[test]
fn mime_magic_png() {
    let mut data = vec![0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A];
    data.extend_from_slice(&[0u8; 4]); // pad to 12 bytes
    assert_eq!(mime_from_magic(&data), Some("image/png"));
}

#[test]
fn mime_magic_jpeg() {
    let mut data = vec![0xFF, 0xD8, 0xFF, 0xE0];
    data.extend_from_slice(&[0u8; 8]);
    assert_eq!(mime_from_magic(&data), Some("image/jpeg"));
}

#[test]
fn mime_magic_gif() {
    let mut data = b"GIF89a".to_vec();
    data.extend_from_slice(&[0u8; 6]);
    assert_eq!(mime_from_magic(&data), Some("image/gif"));
}

#[test]
fn mime_magic_webp() {
    let mut data = vec![0x52, 0x49, 0x46, 0x46]; // RIFF
    data.extend_from_slice(&[0x00; 4]); // file size placeholder
    data.extend_from_slice(b"WEBP"); // WEBP
    assert_eq!(mime_from_magic(&data), Some("image/webp"));
}

#[test]
fn mime_magic_pdf() {
    let mut data = b"%PDF-1.4".to_vec();
    data.extend_from_slice(&[0u8; 4]);
    assert_eq!(mime_from_magic(&data), Some("application/pdf"));
}

#[test]
fn mime_magic_zip() {
    let mut data = vec![0x50, 0x4B, 0x03, 0x04];
    data.extend_from_slice(&[0u8; 8]);
    assert_eq!(mime_from_magic(&data), Some("application/zip"));
}

#[test]
fn mime_magic_too_short_returns_none() {
    assert_eq!(mime_from_magic(&[0x89, 0x50, 0x4E]), None);
    assert_eq!(mime_from_magic(&[]), None);
}

#[test]
fn mime_magic_unknown_returns_none() {
    let data = vec![0x42u8; 16]; // random bytes
    assert_eq!(mime_from_magic(&data), None);
}

// ---------------------------------------------------------------------------
// mime_from_extension
// ---------------------------------------------------------------------------

#[test]
fn mime_ext_known_types() {
    assert_eq!(mime_from_extension(Path::new("a.png")), "image/png");
    assert_eq!(mime_from_extension(Path::new("a.jpg")), "image/jpeg");
    assert_eq!(mime_from_extension(Path::new("a.svg")), "image/svg+xml");
    assert_eq!(mime_from_extension(Path::new("a.pdf")), "application/pdf");
    assert_eq!(
        mime_from_extension(Path::new("a.docx")),
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    );
    assert_eq!(
        mime_from_extension(Path::new("a.xlsx")),
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );
}

#[test]
fn mime_ext_unknown_returns_octet_stream() {
    assert_eq!(mime_from_extension(Path::new("a.xyz")), "application/octet-stream");
    assert_eq!(mime_from_extension(Path::new("no_ext")), "application/octet-stream");
}
