use std::collections::HashSet;
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
    /// Extensions to force-include even if gitignored (without dot, e.g. ["docx", "xlsx"])
    pub force_include_exts: Option<Vec<String>>,
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

    let mut entries = walk_respecting_gitignore(&root, include_dirs, max_depth, max_entries)?;

    // Second pass: collect files with force-included extensions that gitignore may hide
    if let Some(ref exts) = args.force_include_exts {
        if !exts.is_empty() {
            let existing: HashSet<String> = entries.iter().map(|e| e.path.clone()).collect();
            let ext_set: HashSet<String> = exts.iter().map(|s| s.to_lowercase()).collect();
            let remaining = max_entries.saturating_sub(entries.len());
            let extra = walk_for_extensions(&root, &ext_set, max_depth, remaining)?;
            for entry in extra {
                if !existing.contains(&entry.path) {
                    entries.push(entry);
                }
            }
        }
    }

    entries.sort_by(|a, b| match (a.is_dir, b.is_dir) {
        (true, false) => std::cmp::Ordering::Less,
        (false, true) => std::cmp::Ordering::Greater,
        _ => a.path.to_lowercase().cmp(&b.path.to_lowercase()),
    });

    Ok(entries)
}

fn walk_respecting_gitignore(
    root: &Path,
    include_dirs: bool,
    max_depth: usize,
    max_entries: usize,
) -> Result<Vec<WalkFileEntry>, FsError> {
    let walker = ignore::WalkBuilder::new(root)
        .max_depth(Some(max_depth))
        .hidden(true)
        .git_ignore(true)
        .git_global(true)
        .git_exclude(true)
        .build();

    collect_entries(walker, root, include_dirs, max_entries)
}

fn walk_for_extensions(
    root: &Path,
    exts: &HashSet<String>,
    max_depth: usize,
    max_entries: usize,
) -> Result<Vec<WalkFileEntry>, FsError> {
    let walker = ignore::WalkBuilder::new(root)
        .max_depth(Some(max_depth))
        .hidden(true)
        .git_ignore(false)
        .git_global(false)
        .git_exclude(false)
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
        if entry.path() == root {
            continue;
        }
        if entry.file_type().map_or(true, |ft| ft.is_dir()) {
            continue;
        }
        let ext = match entry.path().extension() {
            Some(e) => e.to_string_lossy().to_lowercase(),
            None => continue,
        };
        if !exts.contains(ext.as_str()) {
            continue;
        }
        let rel = match entry.path().strip_prefix(root) {
            Ok(r) => r,
            Err(_) => continue,
        };
        let path = rel.to_string_lossy().replace('\\', "/");
        let name = entry.file_name().to_string_lossy().into_owned();
        entries.push(WalkFileEntry {
            name,
            path,
            is_dir: false,
        });
    }
    Ok(entries)
}

fn collect_entries(
    walker: ignore::Walk,
    root: &Path,
    include_dirs: bool,
    max_entries: usize,
) -> Result<Vec<WalkFileEntry>, FsError> {
    let mut entries = Vec::new();
    for result in walker {
        if entries.len() >= max_entries {
            break;
        }
        let entry = match result {
            Ok(e) => e,
            Err(_) => continue,
        };
        if entry.path() == root {
            continue;
        }
        let is_dir = entry.file_type().map_or(false, |ft| ft.is_dir());
        if is_dir && !include_dirs {
            continue;
        }
        let rel = match entry.path().strip_prefix(root) {
            Ok(r) => r,
            Err(_) => continue,
        };
        let path = rel.to_string_lossy().replace('\\', "/");
        let name = entry.file_name().to_string_lossy().into_owned();
        entries.push(WalkFileEntry { name, path, is_dir });
    }
    Ok(entries)
}
