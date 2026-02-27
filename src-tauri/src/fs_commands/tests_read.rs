use super::read::{
    read_file, read_file_as_data_url, read_file_raw, ReadFileArgs, ReadFileAsDataUrlArgs,
    ReadFileRawArgs,
};
use super::FsError;

// ---------------------------------------------------------------------------
// read_file — edge cases
// ---------------------------------------------------------------------------

#[test]
fn read_file_empty_file() {
    let dir = tempfile::tempdir().unwrap();
    let root = dir.path().to_str().unwrap();
    std::fs::write(dir.path().join("empty.txt"), "").unwrap();

    let out = read_file(ReadFileArgs {
        workspace_root: root.to_string(),
        path: "empty.txt".to_string(),
        offset: None,
        limit: None,
    })
    .unwrap();
    assert_eq!(out, "");
}

#[test]
fn read_file_rejects_directory() {
    let dir = tempfile::tempdir().unwrap();
    let root = dir.path().to_str().unwrap();
    std::fs::create_dir(dir.path().join("sub")).unwrap();

    let result = read_file(ReadFileArgs {
        workspace_root: root.to_string(),
        path: "sub".to_string(),
        offset: None,
        limit: None,
    });
    assert!(matches!(result, Err(FsError::NotAllowed(_))));
}

#[test]
fn read_file_too_large() {
    let dir = tempfile::tempdir().unwrap();
    let root = dir.path().to_str().unwrap();
    let big = vec![b'x'; 251 * 1024];
    std::fs::write(dir.path().join("big.txt"), &big).unwrap();

    let result = read_file(ReadFileArgs {
        workspace_root: root.to_string(),
        path: "big.txt".to_string(),
        offset: None,
        limit: None,
    });
    assert!(matches!(result, Err(FsError::TooLarge)));
}

#[test]
fn read_file_truncates_long_lines() {
    let dir = tempfile::tempdir().unwrap();
    let root = dir.path().to_str().unwrap();
    let long_line = "A".repeat(2500);
    std::fs::write(dir.path().join("long.txt"), &long_line).unwrap();

    let out = read_file(ReadFileArgs {
        workspace_root: root.to_string(),
        path: "long.txt".to_string(),
        offset: None,
        limit: None,
    })
    .unwrap();
    assert!(out.contains("[... truncated 500 chars]"));
}

#[test]
fn read_file_text_ext_skips_binary_check() {
    let dir = tempfile::tempdir().unwrap();
    let root = dir.path().to_str().unwrap();
    std::fs::write(dir.path().join("main.rs"), "fn main() {}").unwrap();

    let result = read_file(ReadFileArgs {
        workspace_root: root.to_string(),
        path: "main.rs".to_string(),
        offset: None,
        limit: None,
    });
    assert!(result.is_ok());
}

// ---------------------------------------------------------------------------
// read_file_raw
// ---------------------------------------------------------------------------

#[test]
fn read_file_raw_returns_content_without_line_numbers() {
    let dir = tempfile::tempdir().unwrap();
    let root = dir.path().to_str().unwrap();
    std::fs::write(dir.path().join("raw.txt"), "hello\nworld").unwrap();

    let out = read_file_raw(ReadFileRawArgs {
        workspace_root: root.to_string(),
        path: "raw.txt".to_string(),
    })
    .unwrap();
    assert_eq!(out, "hello\nworld");
}

#[test]
fn read_file_raw_rejects_binary() {
    let dir = tempfile::tempdir().unwrap();
    let root = dir.path().to_str().unwrap();
    std::fs::write(dir.path().join("bin.exe"), "fake").unwrap();

    let result = read_file_raw(ReadFileRawArgs {
        workspace_root: root.to_string(),
        path: "bin.exe".to_string(),
    });
    assert!(matches!(result, Err(FsError::BinaryFile)));
}

#[test]
fn read_file_raw_rejects_too_large() {
    let dir = tempfile::tempdir().unwrap();
    let root = dir.path().to_str().unwrap();
    let big = vec![b'x'; 251 * 1024];
    std::fs::write(dir.path().join("big.txt"), &big).unwrap();

    let result = read_file_raw(ReadFileRawArgs {
        workspace_root: root.to_string(),
        path: "big.txt".to_string(),
    });
    assert!(matches!(result, Err(FsError::TooLarge)));
}

// ---------------------------------------------------------------------------
// read_file_as_data_url
// ---------------------------------------------------------------------------

#[test]
fn read_file_as_data_url_returns_base64() {
    let dir = tempfile::tempdir().unwrap();
    let root = dir.path().to_str().unwrap();
    let mut png = vec![0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A];
    png.extend_from_slice(&[0u8; 8]);
    std::fs::write(dir.path().join("tiny.png"), &png).unwrap();

    let result = read_file_as_data_url(ReadFileAsDataUrlArgs {
        workspace_root: root.to_string(),
        path: "tiny.png".to_string(),
    })
    .unwrap();
    assert!(result.data_url.starts_with("data:image/png;base64,"));
}

#[test]
fn read_file_as_data_url_extension_fallback() {
    let dir = tempfile::tempdir().unwrap();
    let root = dir.path().to_str().unwrap();
    std::fs::write(dir.path().join("doc.pdf"), "not a real pdf but short").unwrap();

    let result = read_file_as_data_url(ReadFileAsDataUrlArgs {
        workspace_root: root.to_string(),
        path: "doc.pdf".to_string(),
    })
    .unwrap();
    assert!(result.data_url.starts_with("data:application/pdf;base64,"));
}

#[test]
fn read_file_as_data_url_rejects_directory() {
    let dir = tempfile::tempdir().unwrap();
    let root = dir.path().to_str().unwrap();
    std::fs::create_dir(dir.path().join("sub")).unwrap();

    let result = read_file_as_data_url(ReadFileAsDataUrlArgs {
        workspace_root: root.to_string(),
        path: "sub".to_string(),
    });
    assert!(matches!(result, Err(FsError::NotAllowed(_))));
}
