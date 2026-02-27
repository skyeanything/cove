use std::path::Path;

use super::validation::{
    ensure_inside_workspace_exists, ensure_inside_workspace_may_not_exist,
    normalize_path_components,
};
use super::FsError;

// ---------------------------------------------------------------------------
// normalize_path_components
// ---------------------------------------------------------------------------

#[test]
fn normalize_removes_cur_dir() {
    let result = normalize_path_components(Path::new("/a/./b"));
    assert_eq!(result, Path::new("/a/b"));
}

#[test]
fn normalize_resolves_parent() {
    let result = normalize_path_components(Path::new("/a/b/../c"));
    assert_eq!(result, Path::new("/a/c"));
}

#[test]
fn normalize_nested_parent() {
    let result = normalize_path_components(Path::new("/a/b/c/../../d"));
    assert_eq!(result, Path::new("/a/d"));
}

#[test]
fn normalize_at_root() {
    let result = normalize_path_components(Path::new("/../.."));
    assert_eq!(result, Path::new("/"));
}

#[test]
fn normalize_mixed() {
    let result = normalize_path_components(Path::new("/a/./b/../c"));
    assert_eq!(result, Path::new("/a/c"));
}

// ---------------------------------------------------------------------------
// ensure_inside_workspace_exists
// ---------------------------------------------------------------------------

#[test]
fn workspace_exists_relative_inside() {
    let dir = tempfile::tempdir().unwrap();
    let root = dir.path().to_str().unwrap();
    std::fs::write(dir.path().join("hello.txt"), "hi").unwrap();

    let result = ensure_inside_workspace_exists(root, "hello.txt");
    assert!(result.is_ok());
    assert!(result.unwrap().ends_with("hello.txt"));
}

#[test]
fn workspace_exists_absolute_outside() {
    let dir = tempfile::tempdir().unwrap();
    let root = dir.path().to_str().unwrap();

    let result = ensure_inside_workspace_exists(root, "/etc/hosts");
    assert!(matches!(result, Err(FsError::OutsideWorkspace)));
}

#[test]
fn workspace_exists_not_found() {
    let dir = tempfile::tempdir().unwrap();
    let root = dir.path().to_str().unwrap();

    let result = ensure_inside_workspace_exists(root, "does_not_exist.txt");
    assert!(matches!(result, Err(FsError::NotFound)));
}

#[cfg(unix)]
#[test]
fn workspace_exists_symlink_inside() {
    let dir = tempfile::tempdir().unwrap();
    let root = dir.path().to_str().unwrap();
    let target = dir.path().join("real.txt");
    std::fs::write(&target, "content").unwrap();
    std::os::unix::fs::symlink(&target, dir.path().join("link.txt")).unwrap();

    let result = ensure_inside_workspace_exists(root, "link.txt");
    assert!(result.is_ok());
}

#[cfg(unix)]
#[test]
fn workspace_exists_symlink_escaping() {
    let dir = tempfile::tempdir().unwrap();
    let root = dir.path().to_str().unwrap();
    // Create a symlink pointing outside the workspace
    std::os::unix::fs::symlink("/etc/hosts", dir.path().join("escape.txt")).unwrap();

    let result = ensure_inside_workspace_exists(root, "escape.txt");
    assert!(matches!(result, Err(FsError::OutsideWorkspace)));
}

// ---------------------------------------------------------------------------
// ensure_inside_workspace_may_not_exist
// ---------------------------------------------------------------------------

#[test]
fn workspace_may_not_exist_new_file() {
    let dir = tempfile::tempdir().unwrap();
    let root = dir.path().to_str().unwrap();

    let result = ensure_inside_workspace_may_not_exist(root, "new_file.txt");
    assert!(result.is_ok());
}

#[test]
fn workspace_may_not_exist_traversal() {
    let dir = tempfile::tempdir().unwrap();
    let root = dir.path().to_str().unwrap();

    let result = ensure_inside_workspace_may_not_exist(root, "../../etc/passwd");
    assert!(matches!(result, Err(FsError::OutsideWorkspace)));
}

#[test]
fn workspace_may_not_exist_absolute_outside() {
    let dir = tempfile::tempdir().unwrap();
    let root = dir.path().to_str().unwrap();

    let result = ensure_inside_workspace_may_not_exist(root, "/tmp/outside.txt");
    assert!(matches!(result, Err(FsError::OutsideWorkspace)));
}
