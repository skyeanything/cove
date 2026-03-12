use super::copy::{copy_external_file_inner, CopyExternalFileArgs};
use super::FsError;

// ---------------------------------------------------------------------------
// Args deserialization (camelCase JSON contract)
// ---------------------------------------------------------------------------

#[test]
fn copy_external_file_args_deserialize() {
    let json = r#"{"workspaceRoot":"/ws","externalPath":"/ext/a.txt","destPath":"a.txt"}"#;
    let args: CopyExternalFileArgs = serde_json::from_str(json).unwrap();
    assert_eq!(args.workspace_root, "/ws");
    assert_eq!(args.external_path, "/ext/a.txt");
    assert_eq!(args.dest_path, "a.txt");
}

// ---------------------------------------------------------------------------
// Copy file from external path into workspace
// ---------------------------------------------------------------------------

#[test]
fn copy_external_file_copies_file_into_workspace() {
    let workspace = tempfile::tempdir().unwrap();
    let external = tempfile::tempdir().unwrap();
    let ext_file = external.path().join("photo.png");
    std::fs::write(&ext_file, "binary-data").unwrap();

    copy_external_file_inner(&CopyExternalFileArgs {
        workspace_root: workspace.path().to_str().unwrap().to_string(),
        external_path: ext_file.to_str().unwrap().to_string(),
        dest_path: "photo.png".to_string(),
    })
    .unwrap();

    assert_eq!(
        std::fs::read_to_string(workspace.path().join("photo.png")).unwrap(),
        "binary-data"
    );
    // Source still exists (copy, not move)
    assert!(ext_file.exists());
}

// ---------------------------------------------------------------------------
// Copy directory recursively from external path
// ---------------------------------------------------------------------------

#[test]
fn copy_external_file_copies_directory_into_workspace() {
    let workspace = tempfile::tempdir().unwrap();
    let external = tempfile::tempdir().unwrap();
    std::fs::create_dir_all(external.path().join("mydir/sub")).unwrap();
    std::fs::write(external.path().join("mydir/a.txt"), "aaa").unwrap();
    std::fs::write(external.path().join("mydir/sub/b.txt"), "bbb").unwrap();

    let ext_dir = external.path().join("mydir");
    copy_external_file_inner(&CopyExternalFileArgs {
        workspace_root: workspace.path().to_str().unwrap().to_string(),
        external_path: ext_dir.to_str().unwrap().to_string(),
        dest_path: "mydir".to_string(),
    })
    .unwrap();

    assert!(workspace.path().join("mydir/sub").is_dir());
    assert_eq!(
        std::fs::read_to_string(workspace.path().join("mydir/a.txt")).unwrap(),
        "aaa"
    );
    assert_eq!(
        std::fs::read_to_string(workspace.path().join("mydir/sub/b.txt")).unwrap(),
        "bbb"
    );
}

// ---------------------------------------------------------------------------
// Error: source not found
// ---------------------------------------------------------------------------

#[test]
fn copy_external_file_errors_when_source_not_found() {
    let workspace = tempfile::tempdir().unwrap();
    let result = copy_external_file_inner(&CopyExternalFileArgs {
        workspace_root: workspace.path().to_str().unwrap().to_string(),
        external_path: "/nonexistent/file.txt".to_string(),
        dest_path: "file.txt".to_string(),
    });
    assert!(matches!(result, Err(FsError::NotFound)));
}

// ---------------------------------------------------------------------------
// Error: destination already exists
// ---------------------------------------------------------------------------

#[test]
fn copy_external_file_errors_when_dest_exists() {
    let workspace = tempfile::tempdir().unwrap();
    let external = tempfile::tempdir().unwrap();
    let ext_file = external.path().join("a.txt");
    std::fs::write(&ext_file, "new").unwrap();
    std::fs::write(workspace.path().join("a.txt"), "existing").unwrap();

    let result = copy_external_file_inner(&CopyExternalFileArgs {
        workspace_root: workspace.path().to_str().unwrap().to_string(),
        external_path: ext_file.to_str().unwrap().to_string(),
        dest_path: "a.txt".to_string(),
    });
    assert!(matches!(result, Err(FsError::NotAllowed(_))));
}

// ---------------------------------------------------------------------------
// Parent directories are created automatically
// ---------------------------------------------------------------------------

#[test]
fn copy_external_file_creates_parent_dirs() {
    let workspace = tempfile::tempdir().unwrap();
    let external = tempfile::tempdir().unwrap();
    let ext_file = external.path().join("data.csv");
    std::fs::write(&ext_file, "col1,col2").unwrap();

    copy_external_file_inner(&CopyExternalFileArgs {
        workspace_root: workspace.path().to_str().unwrap().to_string(),
        external_path: ext_file.to_str().unwrap().to_string(),
        dest_path: "deep/nested/data.csv".to_string(),
    })
    .unwrap();

    assert_eq!(
        std::fs::read_to_string(workspace.path().join("deep/nested/data.csv")).unwrap(),
        "col1,col2"
    );
}

// ---------------------------------------------------------------------------
// Error: destination escapes workspace via ..
// ---------------------------------------------------------------------------

#[test]
fn copy_external_file_errors_when_dest_outside_workspace() {
    let workspace = tempfile::tempdir().unwrap();
    let external = tempfile::tempdir().unwrap();
    let ext_file = external.path().join("a.txt");
    std::fs::write(&ext_file, "x").unwrap();

    let result = copy_external_file_inner(&CopyExternalFileArgs {
        workspace_root: workspace.path().to_str().unwrap().to_string(),
        external_path: ext_file.to_str().unwrap().to_string(),
        dest_path: "../escape.txt".to_string(),
    });
    assert!(matches!(result, Err(FsError::OutsideWorkspace)));
}
