// FILE_SIZE_EXCEPTION: security regression tests for glob pattern validation
use super::run_js_inner;
use std::fs;
use tempfile::TempDir;

fn run(workspace: &str, code: &str) -> super::JsExecutionResult {
    run_js_inner(workspace, code, 5_000, None).expect("run_js_inner failed")
}

// --- exists ---

#[test]
fn test_exists_true() {
    let dir = TempDir::new().unwrap();
    fs::write(dir.path().join("a.txt"), "hello").unwrap();
    let r = run(dir.path().to_str().unwrap(), r#"
        workspace.exists('a.txt') ? 'yes' : 'no'
    "#);
    assert!(r.error.is_none());
    assert_eq!(r.result, "yes");
}

#[test]
fn test_exists_false() {
    let dir = TempDir::new().unwrap();
    let r = run(dir.path().to_str().unwrap(), r#"
        workspace.exists('nope.txt') ? 'yes' : 'no'
    "#);
    assert!(r.error.is_none());
    assert_eq!(r.result, "no");
}

#[test]
fn test_exists_outside_workspace_returns_false() {
    let dir = TempDir::new().unwrap();
    let r = run(dir.path().to_str().unwrap(), r#"
        workspace.exists('/etc/passwd') ? 'yes' : 'no'
    "#);
    assert!(r.error.is_none());
    assert_eq!(r.result, "no");
}

// --- stat ---

#[test]
fn test_stat_file() {
    let dir = TempDir::new().unwrap();
    fs::write(dir.path().join("f.txt"), "data").unwrap();
    let r = run(dir.path().to_str().unwrap(), r#"
        var s = workspace.stat('f.txt');
        JSON.stringify({ size: s.size, isDir: s.isDir, isBinary: s.isBinary })
    "#);
    assert!(r.error.is_none());
    let v: serde_json::Value = serde_json::from_str(&r.result).unwrap();
    assert_eq!(v["size"], 4);
    assert_eq!(v["isDir"], false);
    assert_eq!(v["isBinary"], false);
}

#[test]
fn test_stat_directory() {
    let dir = TempDir::new().unwrap();
    fs::create_dir(dir.path().join("sub")).unwrap();
    let r = run(dir.path().to_str().unwrap(), r#"
        var s = workspace.stat('sub');
        s.isDir ? 'yes' : 'no'
    "#);
    assert!(r.error.is_none());
    assert_eq!(r.result, "yes");
}

#[test]
fn test_stat_binary_extension() {
    let dir = TempDir::new().unwrap();
    fs::write(dir.path().join("img.png"), &[0x89, 0x50, 0x4E, 0x47]).unwrap();
    let r = run(dir.path().to_str().unwrap(), r#"
        workspace.stat('img.png').isBinary ? 'yes' : 'no'
    "#);
    assert!(r.error.is_none());
    assert_eq!(r.result, "yes");
}

#[test]
fn test_stat_outside_workspace() {
    let dir = TempDir::new().unwrap();
    let r = run(dir.path().to_str().unwrap(), "workspace.stat('/etc/passwd')");
    assert!(r.error.is_some());
}

// --- copyFile ---

#[test]
fn test_copy_file() {
    let dir = TempDir::new().unwrap();
    fs::write(dir.path().join("src.txt"), "content").unwrap();
    let r = run(dir.path().to_str().unwrap(), "workspace.copyFile('src.txt', 'dst.txt')");
    assert!(r.error.is_none());
    assert_eq!(fs::read_to_string(dir.path().join("dst.txt")).unwrap(), "content");
    // Source still exists
    assert!(dir.path().join("src.txt").exists());
}

#[test]
fn test_copy_file_creates_parent() {
    let dir = TempDir::new().unwrap();
    fs::write(dir.path().join("a.txt"), "x").unwrap();
    let r = run(dir.path().to_str().unwrap(), "workspace.copyFile('a.txt', 'sub/deep/b.txt')");
    assert!(r.error.is_none());
    assert_eq!(fs::read_to_string(dir.path().join("sub/deep/b.txt")).unwrap(), "x");
}

// --- moveFile ---

#[test]
fn test_move_file() {
    let dir = TempDir::new().unwrap();
    fs::write(dir.path().join("old.txt"), "data").unwrap();
    let r = run(dir.path().to_str().unwrap(), "workspace.moveFile('old.txt', 'new.txt')");
    assert!(r.error.is_none());
    assert!(!dir.path().join("old.txt").exists());
    assert_eq!(fs::read_to_string(dir.path().join("new.txt")).unwrap(), "data");
}

// --- remove ---

#[test]
fn test_remove_file() {
    let dir = TempDir::new().unwrap();
    fs::write(dir.path().join("rm.txt"), "bye").unwrap();
    let r = run(dir.path().to_str().unwrap(), "workspace.remove('rm.txt')");
    assert!(r.error.is_none());
    assert!(!dir.path().join("rm.txt").exists());
}

#[test]
fn test_remove_empty_dir() {
    let dir = TempDir::new().unwrap();
    fs::create_dir(dir.path().join("empty")).unwrap();
    let r = run(dir.path().to_str().unwrap(), "workspace.remove('empty')");
    assert!(r.error.is_none());
    assert!(!dir.path().join("empty").exists());
}

#[test]
fn test_remove_non_empty_dir_fails() {
    let dir = TempDir::new().unwrap();
    fs::create_dir(dir.path().join("full")).unwrap();
    fs::write(dir.path().join("full/child.txt"), "x").unwrap();
    let r = run(dir.path().to_str().unwrap(), "workspace.remove('full')");
    assert!(r.error.is_some());
    // Directory still exists
    assert!(dir.path().join("full").exists());
}

#[test]
fn test_remove_outside_workspace() {
    let dir = TempDir::new().unwrap();
    let r = run(dir.path().to_str().unwrap(), "workspace.remove('/etc/passwd')");
    assert!(r.error.is_some());
}

// --- createDir ---

#[test]
fn test_create_dir() {
    let dir = TempDir::new().unwrap();
    let r = run(dir.path().to_str().unwrap(), "workspace.createDir('a/b/c')");
    assert!(r.error.is_none());
    assert!(dir.path().join("a/b/c").is_dir());
}

#[test]
fn test_create_dir_outside_workspace() {
    let dir = TempDir::new().unwrap();
    let r = run(dir.path().to_str().unwrap(), "workspace.createDir('/tmp/escape-test-108')");
    assert!(r.error.is_some());
}

// --- glob ---

#[test]
fn test_glob_basic() {
    let dir = TempDir::new().unwrap();
    fs::write(dir.path().join("a.txt"), "").unwrap();
    fs::write(dir.path().join("b.txt"), "").unwrap();
    fs::write(dir.path().join("c.rs"), "").unwrap();
    let r = run(dir.path().to_str().unwrap(), r#"
        var files = workspace.glob('*.txt');
        files.sort();
        JSON.stringify(files)
    "#);
    assert!(r.error.is_none());
    let v: Vec<String> = serde_json::from_str(&r.result).unwrap();
    assert_eq!(v, vec!["a.txt", "b.txt"]);
}

#[test]
fn test_glob_nested() {
    let dir = TempDir::new().unwrap();
    fs::create_dir_all(dir.path().join("src/lib")).unwrap();
    fs::write(dir.path().join("src/a.ts"), "").unwrap();
    fs::write(dir.path().join("src/lib/b.ts"), "").unwrap();
    let r = run(dir.path().to_str().unwrap(), r#"
        var files = workspace.glob('src/**/*.ts');
        files.sort();
        JSON.stringify(files)
    "#);
    assert!(r.error.is_none());
    let v: Vec<String> = serde_json::from_str(&r.result).unwrap();
    assert_eq!(v, vec!["src/a.ts", "src/lib/b.ts"]);
}

#[test]
fn test_glob_limit() {
    let dir = TempDir::new().unwrap();
    for i in 0..1005 {
        fs::write(dir.path().join(format!("{i:04}.txt")), "").unwrap();
    }
    let r = run(dir.path().to_str().unwrap(), r#"
        var files = workspace.glob('*.txt');
        String(files.length)
    "#);
    assert!(r.error.is_none());
    assert_eq!(r.result, "1000");
}

#[test]
fn test_glob_absolute_pattern_rejected() {
    let dir = TempDir::new().unwrap();
    let r = run(dir.path().to_str().unwrap(), "workspace.glob('/etc/*')");
    assert!(r.error.is_some());
    assert!(r.error.unwrap().contains("absolute glob patterns not allowed"));
}

#[test]
fn test_glob_parent_traversal_rejected() {
    let dir = TempDir::new().unwrap();
    let r = run(dir.path().to_str().unwrap(), "workspace.glob('../*')");
    assert!(r.error.is_some());
    assert!(r.error.unwrap().contains("parent traversal"));
}

#[test]
fn test_glob_nested_parent_traversal_rejected() {
    let dir = TempDir::new().unwrap();
    let r = run(dir.path().to_str().unwrap(), "workspace.glob('sub/../../*.txt')");
    assert!(r.error.is_some());
    assert!(r.error.unwrap().contains("parent traversal"));
}

#[cfg(windows)]
#[test]
fn test_glob_backslash_parent_traversal_rejected() {
    let dir = TempDir::new().unwrap();
    let r = run(dir.path().to_str().unwrap(), r#"workspace.glob('..\\*')"#);
    assert!(r.error.is_some());
    assert!(r.error.unwrap().contains("parent traversal"));
}

// --- appendFile ---

#[test]
fn test_append_file_new() {
    let dir = TempDir::new().unwrap();
    let r = run(dir.path().to_str().unwrap(), "workspace.appendFile('log.txt', 'line1\\n')");
    assert!(r.error.is_none());
    assert_eq!(fs::read_to_string(dir.path().join("log.txt")).unwrap(), "line1\n");
}

#[test]
fn test_append_file_existing() {
    let dir = TempDir::new().unwrap();
    fs::write(dir.path().join("log.txt"), "first\n").unwrap();
    let r = run(dir.path().to_str().unwrap(), "workspace.appendFile('log.txt', 'second\\n')");
    assert!(r.error.is_none());
    assert_eq!(fs::read_to_string(dir.path().join("log.txt")).unwrap(), "first\nsecond\n");
}

// --- existing functions still work ---

#[test]
fn test_read_write_file() {
    let dir = TempDir::new().unwrap();
    let r = run(dir.path().to_str().unwrap(), r#"
        workspace.writeFile('test.txt', 'hello world');
        workspace.readFile('test.txt')
    "#);
    assert!(r.error.is_none());
    assert_eq!(r.result, "hello world");
}

#[test]
fn test_list_dir() {
    let dir = TempDir::new().unwrap();
    fs::write(dir.path().join("x.txt"), "").unwrap();
    fs::write(dir.path().join("y.txt"), "").unwrap();
    let r = run(dir.path().to_str().unwrap(), r#"
        var entries = workspace.listDir('.');
        entries.sort();
        JSON.stringify(entries)
    "#);
    assert!(r.error.is_none());
    let v: Vec<String> = serde_json::from_str(&r.result).unwrap();
    assert_eq!(v, vec!["x.txt", "y.txt"]);
}

#[test]
fn test_console_output() {
    let dir = TempDir::new().unwrap();
    let r = run(dir.path().to_str().unwrap(), "console.log('hello'); console.warn('w')");
    assert_eq!(r.output, "hello\n[warn] w");
}
