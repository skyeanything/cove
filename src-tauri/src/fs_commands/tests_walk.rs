use std::fs;
use tempfile::TempDir;

use super::walk::{WalkFileEntry, WalkFilesArgs, walk_files};

fn setup_workspace() -> TempDir {
    let dir = TempDir::new().unwrap();
    let root = dir.path();

    // Create directory structure
    fs::create_dir_all(root.join("src/components")).unwrap();
    fs::create_dir_all(root.join("src/hooks")).unwrap();
    fs::create_dir_all(root.join(".hidden")).unwrap();

    // Create files
    fs::write(root.join("package.json"), "{}").unwrap();
    fs::write(root.join("README.md"), "# hi").unwrap();
    fs::write(root.join("src/main.ts"), "").unwrap();
    fs::write(root.join("src/components/App.tsx"), "").unwrap();
    fs::write(root.join("src/hooks/useStore.ts"), "").unwrap();
    fs::write(root.join(".hidden/secret.txt"), "").unwrap();

    dir
}

fn names(entries: &[WalkFileEntry]) -> Vec<&str> {
    entries.iter().map(|e| e.name.as_str()).collect()
}

fn paths(entries: &[WalkFileEntry]) -> Vec<&str> {
    entries.iter().map(|e| e.path.as_str()).collect()
}

#[test]
fn walks_recursively_and_returns_files() {
    let dir = setup_workspace();
    let args = WalkFilesArgs {
        workspace_root: dir.path().to_string_lossy().into_owned(),
        include_dirs: None,
        max_depth: None,
        max_entries: None,
    };
    let result = walk_files(args).unwrap();

    // Should find files in subdirectories
    let p = paths(&result);
    assert!(p.contains(&"package.json"));
    assert!(p.contains(&"src/main.ts"));
    assert!(p.contains(&"src/components/App.tsx"));
    assert!(p.contains(&"src/hooks/useStore.ts"));
}

#[test]
fn skips_hidden_files_and_dirs() {
    let dir = setup_workspace();
    let args = WalkFilesArgs {
        workspace_root: dir.path().to_string_lossy().into_owned(),
        include_dirs: Some(true),
        max_depth: None,
        max_entries: None,
    };
    let result = walk_files(args).unwrap();

    let p = paths(&result);
    assert!(!p.iter().any(|path| path.contains(".hidden")));
    let n = names(&result);
    assert!(!n.contains(&".hidden"));
}

#[test]
fn includes_dirs_when_requested() {
    let dir = setup_workspace();
    let args = WalkFilesArgs {
        workspace_root: dir.path().to_string_lossy().into_owned(),
        include_dirs: Some(true),
        max_depth: None,
        max_entries: None,
    };
    let result = walk_files(args).unwrap();

    let dirs: Vec<_> = result.iter().filter(|e| e.is_dir).collect();
    assert!(!dirs.is_empty());
    let dir_names: Vec<_> = dirs.iter().map(|d| d.name.as_str()).collect();
    assert!(dir_names.contains(&"src"));
    assert!(dir_names.contains(&"components"));
}

#[test]
fn excludes_dirs_by_default() {
    let dir = setup_workspace();
    let args = WalkFilesArgs {
        workspace_root: dir.path().to_string_lossy().into_owned(),
        include_dirs: None,
        max_depth: None,
        max_entries: None,
    };
    let result = walk_files(args).unwrap();
    assert!(result.iter().all(|e| !e.is_dir));
}

#[test]
fn respects_max_depth() {
    let dir = setup_workspace();
    let args = WalkFilesArgs {
        workspace_root: dir.path().to_string_lossy().into_owned(),
        include_dirs: None,
        max_depth: Some(1),
        max_entries: None,
    };
    let result = walk_files(args).unwrap();
    let p = paths(&result);

    // Depth 1 = only root-level files
    assert!(p.contains(&"package.json"));
    assert!(p.contains(&"README.md"));
    // Should NOT contain files deeper than 1 level
    assert!(!p.contains(&"src/main.ts"));
}

#[test]
fn respects_max_entries() {
    let dir = setup_workspace();
    let args = WalkFilesArgs {
        workspace_root: dir.path().to_string_lossy().into_owned(),
        include_dirs: Some(true),
        max_depth: None,
        max_entries: Some(3),
    };
    let result = walk_files(args).unwrap();
    assert!(result.len() <= 3);
}

#[test]
fn paths_use_forward_slashes() {
    let dir = setup_workspace();
    let args = WalkFilesArgs {
        workspace_root: dir.path().to_string_lossy().into_owned(),
        include_dirs: None,
        max_depth: None,
        max_entries: None,
    };
    let result = walk_files(args).unwrap();
    for entry in &result {
        assert!(!entry.path.contains('\\'), "path should use forward slashes: {}", entry.path);
    }
}

#[test]
fn sorts_dirs_first_then_alphabetical() {
    let dir = setup_workspace();
    let args = WalkFilesArgs {
        workspace_root: dir.path().to_string_lossy().into_owned(),
        include_dirs: Some(true),
        max_depth: None,
        max_entries: None,
    };
    let result = walk_files(args).unwrap();

    // All dirs should come before all files
    let first_file = result.iter().position(|e| !e.is_dir);
    let last_dir = result.iter().rposition(|e| e.is_dir);
    if let (Some(ff), Some(ld)) = (first_file, last_dir) {
        assert!(ld < ff, "all dirs should precede all files");
    }
}

#[test]
fn returns_error_for_nonexistent_workspace() {
    let args = WalkFilesArgs {
        workspace_root: "/nonexistent/path/workspace".to_string(),
        include_dirs: None,
        max_depth: None,
        max_entries: None,
    };
    assert!(walk_files(args).is_err());
}

#[test]
fn respects_gitignore() {
    let dir = setup_workspace();
    let root = dir.path();

    // The ignore crate needs a .git dir to recognize .gitignore
    fs::create_dir_all(root.join(".git")).unwrap();
    fs::write(root.join(".gitignore"), "*.log\nbuild/\n").unwrap();
    fs::write(root.join("debug.log"), "log content").unwrap();
    fs::create_dir_all(root.join("build")).unwrap();
    fs::write(root.join("build/output.js"), "").unwrap();

    let args = WalkFilesArgs {
        workspace_root: root.to_string_lossy().into_owned(),
        include_dirs: Some(true),
        max_depth: None,
        max_entries: None,
    };
    let result = walk_files(args).unwrap();
    let p = paths(&result);

    assert!(!p.contains(&"debug.log"));
    assert!(!p.contains(&"build/output.js"));
    assert!(!p.iter().any(|path| path.starts_with("build")));
}
