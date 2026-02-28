use super::copy::{copy_entry_inner, CopyEntryArgs};
use super::FsError;

// ---------------------------------------------------------------------------
// Args deserialization (camelCase JSON contract)
// ---------------------------------------------------------------------------

#[test]
fn copy_entry_args_deserialize_from_camel_case_json() {
    let json = r#"{"workspaceRoot":"/tmp/ws","fromPath":"a.txt","toPath":"b.txt"}"#;
    let args: CopyEntryArgs = serde_json::from_str(json).unwrap();
    assert_eq!(args.workspace_root, "/tmp/ws");
    assert_eq!(args.from_path, "a.txt");
    assert_eq!(args.to_path, "b.txt");
}

// ---------------------------------------------------------------------------
// Copy file
// ---------------------------------------------------------------------------

#[test]
fn copy_entry_copies_file() {
    let dir = tempfile::tempdir().unwrap();
    let root = dir.path().to_str().unwrap();
    std::fs::write(dir.path().join("src.txt"), "hello").unwrap();

    copy_entry_inner(&CopyEntryArgs {
        workspace_root: root.to_string(),
        from_path: "src.txt".to_string(),
        to_path: "dst.txt".to_string(),
    })
    .unwrap();

    assert!(dir.path().join("dst.txt").is_file());
    assert_eq!(
        std::fs::read_to_string(dir.path().join("dst.txt")).unwrap(),
        "hello"
    );
    // Source should still exist (copy, not move)
    assert!(dir.path().join("src.txt").is_file());
}

// ---------------------------------------------------------------------------
// Copy directory recursively
// ---------------------------------------------------------------------------

#[test]
fn copy_entry_copies_directory_recursively() {
    let dir = tempfile::tempdir().unwrap();
    let root = dir.path().to_str().unwrap();

    // Create a nested directory structure
    std::fs::create_dir_all(dir.path().join("src_dir/sub")).unwrap();
    std::fs::write(dir.path().join("src_dir/a.txt"), "aaa").unwrap();
    std::fs::write(dir.path().join("src_dir/sub/b.txt"), "bbb").unwrap();

    copy_entry_inner(&CopyEntryArgs {
        workspace_root: root.to_string(),
        from_path: "src_dir".to_string(),
        to_path: "dst_dir".to_string(),
    })
    .unwrap();

    assert!(dir.path().join("dst_dir").is_dir());
    assert_eq!(
        std::fs::read_to_string(dir.path().join("dst_dir/a.txt")).unwrap(),
        "aaa"
    );
    assert_eq!(
        std::fs::read_to_string(dir.path().join("dst_dir/sub/b.txt")).unwrap(),
        "bbb"
    );
    // Source should still exist
    assert!(dir.path().join("src_dir/a.txt").is_file());
}

// ---------------------------------------------------------------------------
// Error: destination already exists
// ---------------------------------------------------------------------------

#[test]
fn copy_entry_errors_when_destination_exists() {
    let dir = tempfile::tempdir().unwrap();
    let root = dir.path().to_str().unwrap();
    std::fs::write(dir.path().join("src.txt"), "hello").unwrap();
    std::fs::write(dir.path().join("dst.txt"), "existing").unwrap();

    let result = copy_entry_inner(&CopyEntryArgs {
        workspace_root: root.to_string(),
        from_path: "src.txt".to_string(),
        to_path: "dst.txt".to_string(),
    });
    assert!(matches!(result, Err(FsError::NotAllowed(_))));
}

// ---------------------------------------------------------------------------
// Error: source outside workspace
// ---------------------------------------------------------------------------

#[test]
fn copy_entry_errors_when_source_outside_workspace() {
    let workspace = tempfile::tempdir().unwrap();
    let root = workspace.path().to_str().unwrap();
    let outside = tempfile::tempdir().unwrap();
    let outside_file = outside.path().join("outside.txt");
    std::fs::write(&outside_file, "x").unwrap();

    let result = copy_entry_inner(&CopyEntryArgs {
        workspace_root: root.to_string(),
        from_path: outside_file.to_str().unwrap().to_string(),
        to_path: "copy.txt".to_string(),
    });
    assert!(matches!(result, Err(FsError::OutsideWorkspace)));
}

// ---------------------------------------------------------------------------
// Error: source not found
// ---------------------------------------------------------------------------

#[test]
fn copy_entry_errors_when_source_not_found() {
    let dir = tempfile::tempdir().unwrap();
    let root = dir.path().to_str().unwrap();

    let result = copy_entry_inner(&CopyEntryArgs {
        workspace_root: root.to_string(),
        from_path: "nonexistent.txt".to_string(),
        to_path: "dst.txt".to_string(),
    });
    assert!(matches!(result, Err(FsError::NotFound)));
}
