use super::list::{list_dir, stat_file, ListDirArgs, StatFileArgs};
use super::FsError;

// ---------------------------------------------------------------------------
// list_dir
// ---------------------------------------------------------------------------

#[test]
fn list_dir_basic() {
    let dir = tempfile::tempdir().unwrap();
    let root = dir.path().to_str().unwrap();
    std::fs::write(dir.path().join("a.txt"), "a").unwrap();
    std::fs::write(dir.path().join("b.txt"), "b").unwrap();

    let entries = list_dir(ListDirArgs {
        workspace_root: root.to_string(),
        path: "".to_string(),
        include_hidden: None,
    })
    .unwrap();
    let names: Vec<&str> = entries.iter().map(|e| e.name.as_str()).collect();
    assert!(names.contains(&"a.txt"));
    assert!(names.contains(&"b.txt"));
}

#[test]
fn list_dir_sorts_dirs_first() {
    let dir = tempfile::tempdir().unwrap();
    let root = dir.path().to_str().unwrap();
    std::fs::write(dir.path().join("file.txt"), "f").unwrap();
    std::fs::create_dir(dir.path().join("subdir")).unwrap();

    let entries = list_dir(ListDirArgs {
        workspace_root: root.to_string(),
        path: "".to_string(),
        include_hidden: None,
    })
    .unwrap();
    assert!(entries[0].is_dir, "first entry should be a directory");
    assert_eq!(entries[0].name, "subdir");
}

#[test]
fn list_dir_sorts_alphabetically() {
    let dir = tempfile::tempdir().unwrap();
    let root = dir.path().to_str().unwrap();
    std::fs::write(dir.path().join("c.txt"), "c").unwrap();
    std::fs::write(dir.path().join("a.txt"), "a").unwrap();
    std::fs::write(dir.path().join("b.txt"), "b").unwrap();

    let entries = list_dir(ListDirArgs {
        workspace_root: root.to_string(),
        path: "".to_string(),
        include_hidden: None,
    })
    .unwrap();
    let names: Vec<&str> = entries.iter().map(|e| e.name.as_str()).collect();
    assert_eq!(names, vec!["a.txt", "b.txt", "c.txt"]);
}

#[test]
fn list_dir_empty_path_lists_root() {
    let dir = tempfile::tempdir().unwrap();
    let root = dir.path().to_str().unwrap();
    std::fs::write(dir.path().join("root.txt"), "r").unwrap();

    let entries = list_dir(ListDirArgs {
        workspace_root: root.to_string(),
        path: "".to_string(),
        include_hidden: None,
    })
    .unwrap();
    assert_eq!(entries.len(), 1);
    assert_eq!(entries[0].name, "root.txt");
}

#[test]
fn list_dir_filters_hidden() {
    let dir = tempfile::tempdir().unwrap();
    let root = dir.path().to_str().unwrap();
    std::fs::write(dir.path().join(".hidden"), "h").unwrap();
    std::fs::write(dir.path().join("visible.txt"), "v").unwrap();

    let entries = list_dir(ListDirArgs {
        workspace_root: root.to_string(),
        path: "".to_string(),
        include_hidden: Some(false),
    })
    .unwrap();
    let names: Vec<&str> = entries.iter().map(|e| e.name.as_str()).collect();
    assert!(!names.contains(&".hidden"));
    assert!(names.contains(&"visible.txt"));
}

#[test]
fn list_dir_includes_hidden_by_default() {
    let dir = tempfile::tempdir().unwrap();
    let root = dir.path().to_str().unwrap();
    std::fs::write(dir.path().join(".hidden"), "h").unwrap();

    let entries = list_dir(ListDirArgs {
        workspace_root: root.to_string(),
        path: "".to_string(),
        include_hidden: None,
    })
    .unwrap();
    let names: Vec<&str> = entries.iter().map(|e| e.name.as_str()).collect();
    assert!(names.contains(&".hidden"));
}

#[test]
fn list_dir_empty_directory() {
    let dir = tempfile::tempdir().unwrap();
    let root = dir.path().to_str().unwrap();
    std::fs::create_dir(dir.path().join("empty")).unwrap();

    let entries = list_dir(ListDirArgs {
        workspace_root: root.to_string(),
        path: "empty".to_string(),
        include_hidden: None,
    })
    .unwrap();
    assert!(entries.is_empty());
}

#[test]
fn list_dir_rejects_file_path() {
    let dir = tempfile::tempdir().unwrap();
    let root = dir.path().to_str().unwrap();
    std::fs::write(dir.path().join("file.txt"), "f").unwrap();

    let result = list_dir(ListDirArgs {
        workspace_root: root.to_string(),
        path: "file.txt".to_string(),
        include_hidden: None,
    });
    assert!(matches!(result, Err(FsError::NotAllowed(_))));
}

#[test]
fn list_dir_outside_workspace() {
    let dir = tempfile::tempdir().unwrap();
    let root = dir.path().to_str().unwrap();

    let result = list_dir(ListDirArgs {
        workspace_root: root.to_string(),
        path: "../../..".to_string(),
        include_hidden: None,
    });
    assert!(matches!(result, Err(FsError::OutsideWorkspace)));
}

// ---------------------------------------------------------------------------
// stat_file
// ---------------------------------------------------------------------------

#[test]
fn stat_file_directory() {
    let dir = tempfile::tempdir().unwrap();
    let root = dir.path().to_str().unwrap();
    std::fs::create_dir(dir.path().join("sub")).unwrap();

    let st = stat_file(StatFileArgs {
        workspace_root: root.to_string(),
        path: "sub".to_string(),
    })
    .unwrap();
    assert!(st.is_dir);
    assert!(!st.is_binary);
}

#[test]
fn stat_file_binary_by_extension() {
    let dir = tempfile::tempdir().unwrap();
    let root = dir.path().to_str().unwrap();
    std::fs::write(dir.path().join("img.png"), "fake png").unwrap();

    let st = stat_file(StatFileArgs {
        workspace_root: root.to_string(),
        path: "img.png".to_string(),
    })
    .unwrap();
    assert!(st.is_binary);
}

#[test]
fn stat_file_outside_workspace() {
    let workspace = tempfile::tempdir().unwrap();
    let root = workspace.path().to_str().unwrap();
    // Create a real file in a separate temp dir (outside the workspace)
    let outside = tempfile::tempdir().unwrap();
    let outside_file = outside.path().join("outside.txt");
    std::fs::write(&outside_file, "x").unwrap();

    let result = stat_file(StatFileArgs {
        workspace_root: root.to_string(),
        path: outside_file.to_str().unwrap().to_string(),
    });
    assert!(matches!(result, Err(FsError::OutsideWorkspace)));
}

#[test]
fn stat_file_not_found() {
    let dir = tempfile::tempdir().unwrap();
    let root = dir.path().to_str().unwrap();

    let result = stat_file(StatFileArgs {
        workspace_root: root.to_string(),
        path: "nope.txt".to_string(),
    });
    assert!(matches!(result, Err(FsError::NotFound)));
}
