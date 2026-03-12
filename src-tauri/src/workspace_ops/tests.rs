// FILE_SIZE_EXCEPTION: comprehensive workspace ops + security regression tests
use super::*;
use std::fs;
use tempfile::TempDir;

// --- read/write ---

#[test]
fn test_read_write_file() {
    let dir = TempDir::new().unwrap();
    let wr = dir.path().to_str().unwrap();
    ws_write_file(wr, "test.txt", "hello world").unwrap();
    let content = ws_read_file(wr, "test.txt").unwrap();
    assert_eq!(content, "hello world");
}

#[test]
fn test_write_creates_parent() {
    let dir = TempDir::new().unwrap();
    let wr = dir.path().to_str().unwrap();
    ws_write_file(wr, "a/b/c.txt", "deep").unwrap();
    assert_eq!(fs::read_to_string(dir.path().join("a/b/c.txt")).unwrap(), "deep");
}

// --- append ---

#[test]
fn test_append_file_new() {
    let dir = TempDir::new().unwrap();
    let wr = dir.path().to_str().unwrap();
    ws_append_file(wr, "log.txt", "line1\n").unwrap();
    assert_eq!(fs::read_to_string(dir.path().join("log.txt")).unwrap(), "line1\n");
}

#[test]
fn test_append_file_existing() {
    let dir = TempDir::new().unwrap();
    let wr = dir.path().to_str().unwrap();
    fs::write(dir.path().join("log.txt"), "first\n").unwrap();
    ws_append_file(wr, "log.txt", "second\n").unwrap();
    assert_eq!(
        fs::read_to_string(dir.path().join("log.txt")).unwrap(),
        "first\nsecond\n"
    );
}

// --- list_dir ---

#[test]
fn test_list_dir() {
    let dir = TempDir::new().unwrap();
    let wr = dir.path().to_str().unwrap();
    fs::write(dir.path().join("x.txt"), "").unwrap();
    fs::write(dir.path().join("y.txt"), "").unwrap();
    let mut entries = ws_list_dir(wr, ".").unwrap();
    entries.sort();
    assert_eq!(entries, vec!["x.txt", "y.txt"]);
}

// --- exists ---

#[test]
fn test_exists_true() {
    let dir = TempDir::new().unwrap();
    let wr = dir.path().to_str().unwrap();
    fs::write(dir.path().join("a.txt"), "hello").unwrap();
    assert!(ws_exists(wr, "a.txt").unwrap());
}

#[test]
fn test_exists_false() {
    let dir = TempDir::new().unwrap();
    let wr = dir.path().to_str().unwrap();
    assert!(!ws_exists(wr, "nope.txt").unwrap());
}

#[test]
fn test_exists_outside_workspace() {
    let dir = TempDir::new().unwrap();
    let wr = dir.path().to_str().unwrap();
    assert!(!ws_exists(wr, "/etc/passwd").unwrap());
}

// --- stat ---

#[test]
fn test_stat_file() {
    let dir = TempDir::new().unwrap();
    let wr = dir.path().to_str().unwrap();
    fs::write(dir.path().join("f.txt"), "data").unwrap();
    let s = ws_stat(wr, "f.txt").unwrap();
    assert_eq!(s.size, 4);
    assert!(!s.is_dir);
    assert!(!s.is_binary);
}

#[test]
fn test_stat_directory() {
    let dir = TempDir::new().unwrap();
    let wr = dir.path().to_str().unwrap();
    fs::create_dir(dir.path().join("sub")).unwrap();
    let s = ws_stat(wr, "sub").unwrap();
    assert!(s.is_dir);
}

#[test]
fn test_stat_binary_extension() {
    let dir = TempDir::new().unwrap();
    let wr = dir.path().to_str().unwrap();
    fs::write(dir.path().join("img.png"), &[0x89, 0x50, 0x4E, 0x47]).unwrap();
    let s = ws_stat(wr, "img.png").unwrap();
    assert!(s.is_binary);
}

#[test]
fn test_stat_outside_workspace() {
    let dir = TempDir::new().unwrap();
    let wr = dir.path().to_str().unwrap();
    assert!(ws_stat(wr, "/etc/passwd").is_err());
}

// --- copy ---

#[test]
fn test_copy_file() {
    let dir = TempDir::new().unwrap();
    let wr = dir.path().to_str().unwrap();
    fs::write(dir.path().join("src.txt"), "content").unwrap();
    ws_copy_file(wr, "src.txt", "dst.txt").unwrap();
    assert_eq!(fs::read_to_string(dir.path().join("dst.txt")).unwrap(), "content");
    assert!(dir.path().join("src.txt").exists());
}

#[test]
fn test_copy_file_creates_parent() {
    let dir = TempDir::new().unwrap();
    let wr = dir.path().to_str().unwrap();
    fs::write(dir.path().join("a.txt"), "x").unwrap();
    ws_copy_file(wr, "a.txt", "sub/deep/b.txt").unwrap();
    assert_eq!(
        fs::read_to_string(dir.path().join("sub/deep/b.txt")).unwrap(),
        "x"
    );
}

// --- move ---

#[test]
fn test_move_file() {
    let dir = TempDir::new().unwrap();
    let wr = dir.path().to_str().unwrap();
    fs::write(dir.path().join("old.txt"), "data").unwrap();
    ws_move_file(wr, "old.txt", "new.txt").unwrap();
    assert!(!dir.path().join("old.txt").exists());
    assert_eq!(fs::read_to_string(dir.path().join("new.txt")).unwrap(), "data");
}

// --- remove ---

#[test]
fn test_remove_file() {
    let dir = TempDir::new().unwrap();
    let wr = dir.path().to_str().unwrap();
    fs::write(dir.path().join("rm.txt"), "bye").unwrap();
    ws_remove(wr, "rm.txt").unwrap();
    assert!(!dir.path().join("rm.txt").exists());
}

#[test]
fn test_remove_empty_dir() {
    let dir = TempDir::new().unwrap();
    let wr = dir.path().to_str().unwrap();
    fs::create_dir(dir.path().join("empty")).unwrap();
    ws_remove(wr, "empty").unwrap();
    assert!(!dir.path().join("empty").exists());
}

#[test]
fn test_remove_non_empty_dir_fails() {
    let dir = TempDir::new().unwrap();
    let wr = dir.path().to_str().unwrap();
    fs::create_dir(dir.path().join("full")).unwrap();
    fs::write(dir.path().join("full/child.txt"), "x").unwrap();
    assert!(ws_remove(wr, "full").is_err());
    assert!(dir.path().join("full").exists());
}

#[test]
fn test_remove_outside_workspace() {
    let dir = TempDir::new().unwrap();
    let wr = dir.path().to_str().unwrap();
    assert!(ws_remove(wr, "/etc/passwd").is_err());
}

// --- create_dir ---

#[test]
fn test_create_dir() {
    let dir = TempDir::new().unwrap();
    let wr = dir.path().to_str().unwrap();
    ws_create_dir(wr, "a/b/c").unwrap();
    assert!(dir.path().join("a/b/c").is_dir());
}

#[test]
fn test_create_dir_outside_workspace() {
    let dir = TempDir::new().unwrap();
    let wr = dir.path().to_str().unwrap();
    assert!(ws_create_dir(wr, "/tmp/escape-test-108").is_err());
}

// --- glob ---

#[test]
fn test_glob_basic() {
    let dir = TempDir::new().unwrap();
    let wr = dir.path().to_str().unwrap();
    fs::write(dir.path().join("a.txt"), "").unwrap();
    fs::write(dir.path().join("b.txt"), "").unwrap();
    fs::write(dir.path().join("c.rs"), "").unwrap();
    let mut files = ws_glob(wr, "*.txt").unwrap();
    files.sort();
    assert_eq!(files, vec!["a.txt", "b.txt"]);
}

#[test]
fn test_glob_nested() {
    let dir = TempDir::new().unwrap();
    let wr = dir.path().to_str().unwrap();
    fs::create_dir_all(dir.path().join("src/lib")).unwrap();
    fs::write(dir.path().join("src/a.ts"), "").unwrap();
    fs::write(dir.path().join("src/lib/b.ts"), "").unwrap();
    let mut files = ws_glob(wr, "src/**/*.ts").unwrap();
    files.sort();
    assert_eq!(files, vec!["src/a.ts", "src/lib/b.ts"]);
}

#[test]
fn test_glob_limit() {
    let dir = TempDir::new().unwrap();
    let wr = dir.path().to_str().unwrap();
    for i in 0..1005 {
        fs::write(dir.path().join(format!("{i:04}.txt")), "").unwrap();
    }
    let files = ws_glob(wr, "*.txt").unwrap();
    assert_eq!(files.len(), 1000);
}

#[test]
fn test_glob_absolute_pattern_rejected() {
    let dir = TempDir::new().unwrap();
    let wr = dir.path().to_str().unwrap();
    let err = ws_glob(wr, "/etc/*").unwrap_err();
    assert!(err.contains("absolute glob patterns not allowed"));
}

#[test]
fn test_glob_parent_traversal_rejected() {
    let dir = TempDir::new().unwrap();
    let wr = dir.path().to_str().unwrap();
    let err = ws_glob(wr, "../*").unwrap_err();
    assert!(err.contains("parent traversal"));
}

#[test]
fn test_glob_nested_parent_traversal_rejected() {
    let dir = TempDir::new().unwrap();
    let wr = dir.path().to_str().unwrap();
    let err = ws_glob(wr, "sub/../../*.txt").unwrap_err();
    assert!(err.contains("parent traversal"));
}
