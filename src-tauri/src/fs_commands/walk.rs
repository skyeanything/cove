use std::path::Path;

use serde::{Deserialize, Serialize};

use super::FsError;

const DEFAULT_MAX_DEPTH: usize = 8;
const DEFAULT_MAX_ENTRIES: usize = 5000;

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WalkFilesArgs {
    pub workspace_root: String,
    /// Whether to include directories in results (default false)
    pub include_dirs: Option<bool>,
    /// Max recursion depth (default 8)
    pub max_depth: Option<usize>,
    /// Max entries returned (default 5000)
    pub max_entries: Option<usize>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WalkFileEntry {
    /// File/directory name (leaf)
    pub name: String,
    /// Relative path from workspace root, using `/` separators
    pub path: String,
    pub is_dir: bool,
}

#[tauri::command]
pub fn walk_files(args: WalkFilesArgs) -> Result<Vec<WalkFileEntry>, FsError> {
    let root = Path::new(&args.workspace_root)
        .canonicalize()
        .map_err(|_| FsError::NotFound)?;

    let include_dirs = args.include_dirs.unwrap_or(false);
    let max_depth = args.max_depth.unwrap_or(DEFAULT_MAX_DEPTH);
    let max_entries = args.max_entries.unwrap_or(DEFAULT_MAX_ENTRIES);

    let walker = ignore::WalkBuilder::new(&root)
        .max_depth(Some(max_depth))
        .hidden(true) // respect hidden files (skip dotfiles)
        .git_ignore(true)
        .git_global(true)
        .git_exclude(true)
        .build();

    let mut entries = Vec::new();

    for result in walker {
        if entries.len() >= max_entries {
            break;
        }
        let entry = match result {
            Ok(e) => e,
            Err(_) => continue,
        };

        // Skip the root directory itself
        if entry.path() == root {
            continue;
        }

        let is_dir = entry.file_type().map_or(false, |ft| ft.is_dir());
        if is_dir && !include_dirs {
            continue;
        }

        let rel = match entry.path().strip_prefix(&root) {
            Ok(r) => r,
            Err(_) => continue,
        };
        let path = rel.to_string_lossy().replace('\\', "/");
        let name = entry
            .file_name()
            .to_string_lossy()
            .into_owned();

        entries.push(WalkFileEntry { name, path, is_dir });
    }

    // Sort: directories first, then alphabetical by path
    entries.sort_by(|a, b| {
        match (a.is_dir, b.is_dir) {
            (true, false) => std::cmp::Ordering::Less,
            (false, true) => std::cmp::Ordering::Greater,
            _ => a.path.to_lowercase().cmp(&b.path.to_lowercase()),
        }
    });

    Ok(entries)
}
