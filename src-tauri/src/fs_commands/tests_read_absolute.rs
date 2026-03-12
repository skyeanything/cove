use super::read_absolute::{read_absolute_file, read_absolute_file_as_data_url, ReadAbsoluteFileArgs};
use super::FsError;

#[test]
fn reads_text_file() {
    let dir = tempfile::tempdir().unwrap();
    let file = dir.path().join("hello.txt");
    std::fs::write(&file, "hello world").unwrap();

    let out = read_absolute_file(ReadAbsoluteFileArgs {
        path: file.to_str().unwrap().to_string(),
    })
    .unwrap();
    assert_eq!(out, "hello world");
}

#[test]
fn rejects_relative_path() {
    let result = read_absolute_file(ReadAbsoluteFileArgs {
        path: "relative/file.txt".to_string(),
    });
    assert!(matches!(result, Err(FsError::NotAllowed(_))));
}

#[test]
fn rejects_directory() {
    let dir = tempfile::tempdir().unwrap();
    let result = read_absolute_file(ReadAbsoluteFileArgs {
        path: dir.path().to_str().unwrap().to_string(),
    });
    assert!(matches!(result, Err(FsError::NotAllowed(_))));
}

#[test]
fn rejects_nonexistent() {
    let result = read_absolute_file(ReadAbsoluteFileArgs {
        path: "/tmp/nonexistent_test_file_abc123.txt".to_string(),
    });
    assert!(matches!(result, Err(FsError::NotFound)));
}

#[test]
fn rejects_binary_extension() {
    let dir = tempfile::tempdir().unwrap();
    let file = dir.path().join("binary.exe");
    std::fs::write(&file, "fake").unwrap();

    let result = read_absolute_file(ReadAbsoluteFileArgs {
        path: file.to_str().unwrap().to_string(),
    });
    assert!(matches!(result, Err(FsError::BinaryFile)));
}

#[test]
fn data_url_returns_base64() {
    let dir = tempfile::tempdir().unwrap();
    let file = dir.path().join("tiny.png");
    let mut png = vec![0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A];
    png.extend_from_slice(&[0u8; 8]);
    std::fs::write(&file, &png).unwrap();

    let result = read_absolute_file_as_data_url(ReadAbsoluteFileArgs {
        path: file.to_str().unwrap().to_string(),
    })
    .unwrap();
    assert!(result.data_url.starts_with("data:image/png;base64,"));
}

#[test]
fn data_url_rejects_relative_path() {
    let result = read_absolute_file_as_data_url(ReadAbsoluteFileArgs {
        path: "relative/image.png".to_string(),
    });
    assert!(matches!(result, Err(FsError::NotAllowed(_))));
}
