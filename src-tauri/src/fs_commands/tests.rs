use super::read::{read_file, ReadFileArgs};
use super::write::{write_file, WriteFileArgs};
use super::list::{stat_file, StatFileArgs};
use super::FsError;

/// 前端 invoke 传的是 camelCase 且包在 args 里；此处验证反序列化契约。
#[test]
fn read_file_args_deserialize_from_camel_case_json() {
    let json = r#"{"workspaceRoot":"/tmp/ws","path":"a/b.txt","limit":10}"#;
    let args: ReadFileArgs = serde_json::from_str(json).unwrap();
    assert_eq!(args.workspace_root, "/tmp/ws");
    assert_eq!(args.path, "a/b.txt");
    assert_eq!(args.offset, None);
    assert_eq!(args.limit, Some(10));
}

#[test]
fn write_file_args_deserialize_from_camel_case_json() {
    let json = r#"{"workspaceRoot":"/tmp","path":"f.txt","content":"hi"}"#;
    let args: WriteFileArgs = serde_json::from_str(json).unwrap();
    assert_eq!(args.workspace_root, "/tmp");
    assert_eq!(args.path, "f.txt");
    assert_eq!(args.content, "hi");
}

#[test]
fn stat_file_args_deserialize_from_camel_case_json() {
    let json = r#"{"workspaceRoot":"/tmp","path":"f.txt"}"#;
    let args: StatFileArgs = serde_json::from_str(json).unwrap();
    assert_eq!(args.workspace_root, "/tmp");
    assert_eq!(args.path, "f.txt");
}

#[test]
fn read_file_returns_line_numbered_content() {
    let dir = tempfile::tempdir().unwrap();
    let root = dir.path().to_str().unwrap();
    let f = dir.path().join("hello.txt");
    std::fs::write(&f, "line1\nline2\nline3\n").unwrap();

    let out = read_file(ReadFileArgs {
        workspace_root: root.to_string(),
        path: "hello.txt".to_string(),
        offset: None,
        limit: None,
    })
    .unwrap();
    assert!(out.starts_with("00001| line1\n"));
    assert!(out.contains("00002| line2\n"));
    assert!(out.contains("00003| line3\n"));
}

#[test]
fn read_file_offset_limit() {
    let dir = tempfile::tempdir().unwrap();
    let root = dir.path().to_str().unwrap();
    std::fs::write(dir.path().join("five.txt"), "a\nb\nc\nd\ne\n").unwrap();

    let out = read_file(ReadFileArgs {
        workspace_root: root.to_string(),
        path: "five.txt".to_string(),
        offset: Some(1),
        limit: Some(2),
    })
    .unwrap();
    assert_eq!(out.trim(), "00002| b\n00003| c");
}

#[test]
fn read_file_outside_workspace_rejected() {
    let dir = tempfile::tempdir().unwrap();
    let root = dir.path().to_str().unwrap();
    let result = read_file(ReadFileArgs {
        workspace_root: root.to_string(),
        path: "/etc/hosts".to_string(),
        offset: None,
        limit: Some(5),
    });
    assert!(matches!(result, Err(FsError::OutsideWorkspace)));
}

#[test]
fn read_file_binary_extension_rejected() {
    let dir = tempfile::tempdir().unwrap();
    let root = dir.path().to_str().unwrap();
    std::fs::write(dir.path().join("x.png"), "not really png").unwrap();

    let result = read_file(ReadFileArgs {
        workspace_root: root.to_string(),
        path: "x.png".to_string(),
        offset: None,
        limit: None,
    });
    assert!(matches!(result, Err(FsError::BinaryFile)));
}

#[test]
fn write_file_creates_file_and_parent_dir() {
    let dir = tempfile::tempdir().unwrap();
    let root = dir.path().to_str().unwrap();
    let sub = dir.path().join("sub");
    assert!(!sub.exists());

    write_file(WriteFileArgs {
        workspace_root: root.to_string(),
        path: "sub/nested/file.txt".to_string(),
        content: "written".to_string(),
    })
    .unwrap();

    let p = dir.path().join("sub/nested/file.txt");
    assert!(p.is_file());
    assert_eq!(std::fs::read_to_string(&p).unwrap(), "written");
}

#[test]
fn write_file_outside_workspace_rejected() {
    let dir = tempfile::tempdir().unwrap();
    let root = dir.path().to_str().unwrap();
    let result = write_file(WriteFileArgs {
        workspace_root: root.to_string(),
        path: "../../etc/foo".to_string(),
        content: "x".to_string(),
    });
    assert!(matches!(result, Err(FsError::OutsideWorkspace)));
}

#[test]
fn stat_file_returns_metadata() {
    let dir = tempfile::tempdir().unwrap();
    let root = dir.path().to_str().unwrap();
    std::fs::write(dir.path().join("f.txt"), "hello").unwrap();

    let st = stat_file(StatFileArgs {
        workspace_root: root.to_string(),
        path: "f.txt".to_string(),
    })
    .unwrap();
    assert_eq!(st.size, 5);
    assert!(!st.is_dir);
    assert!(!st.is_binary);
}
