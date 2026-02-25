use std::fs;
use std::path::Path;

use serde::{Deserialize, Serialize};

use super::detection::{is_binary_content, path_has_binary_extension};
use super::validation::ensure_inside_workspace_exists;
use super::FsError;

// ---------------------------------------------------------------------------
// list_dir
// ---------------------------------------------------------------------------

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ListDirArgs {
    pub workspace_root: String,
    /// 相对工作区根的目录路径，空字符串表示根
    pub path: String,
    /// 是否包含以 . 开头的隐藏文件，默认 true
    pub include_hidden: Option<bool>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ListDirEntry {
    pub name: String,
    /// 相对工作区根的路径
    pub path: String,
    pub is_dir: bool,
    pub mtime_secs: i64,
}

#[tauri::command]
pub fn list_dir(args: ListDirArgs) -> Result<Vec<ListDirEntry>, FsError> {
    let root = Path::new(&args.workspace_root)
        .canonicalize()
        .map_err(|_| FsError::NotFound)?
        .into_os_string()
        .into_string()
        .map_err(|_| FsError::Io("workspace path invalid utf-8".into()))?;

    let dir_path = if args.path.trim().is_empty() {
        root.clone()
    } else {
        let resolved = Path::new(&root).join(&args.path);
        let canonical = resolved.canonicalize().map_err(|e| {
            if e.kind() == std::io::ErrorKind::NotFound {
                FsError::NotFound
            } else {
                FsError::Io(e.to_string())
            }
        })?;
        canonical
            .into_os_string()
            .into_string()
            .map_err(|_| FsError::Io("path invalid utf-8".into()))?
    };

    if !dir_path.starts_with(&root) {
        return Err(FsError::OutsideWorkspace);
    }
    let meta = fs::metadata(&dir_path).map_err(FsError::from)?;
    if !meta.is_dir() {
        return Err(FsError::NotAllowed("not a directory".into()));
    }

    let root_path = Path::new(&root);
    let mut entries = Vec::new();
    for e in fs::read_dir(&dir_path).map_err(FsError::from)? {
        let e = e.map_err(FsError::from)?;
        let entry_path = e.path();
        let canonical = match entry_path.canonicalize() {
            Ok(p) => p,
            Err(_) => continue,
        };
        let canonical_str = match canonical.into_os_string().into_string() {
            Ok(s) => s,
            Err(_) => continue,
        };
        if !canonical_str.starts_with(&root) {
            continue;
        }
        let name = e
            .file_name()
            .into_string()
            .map_err(|_| FsError::Io("entry name invalid utf-8".into()))?;
        if args.include_hidden == Some(false) && name.starts_with('.') {
            continue;
        }
        let rel = Path::new(&canonical_str)
            .strip_prefix(root_path)
            .map_err(|_| FsError::Io("strip prefix".into()))?;
        let path = rel.to_string_lossy().replace('\\', "/");
        let meta = fs::metadata(&canonical_str).map_err(FsError::from)?;
        let is_dir = meta.is_dir();
        let mtime_secs = meta
            .modified()
            .map(|t| t.duration_since(std::time::UNIX_EPOCH).unwrap_or_default().as_secs() as i64)
            .unwrap_or(0);
        entries.push(ListDirEntry {
            name,
            path,
            is_dir,
            mtime_secs,
        });
    }
    entries.sort_by(|a, b| {
        match (a.is_dir, b.is_dir) {
            (true, false) => std::cmp::Ordering::Less,
            (false, true) => std::cmp::Ordering::Greater,
            _ => a.name.to_lowercase().cmp(&b.name.to_lowercase()),
        }
    });
    Ok(entries)
}

// ---------------------------------------------------------------------------
// stat_file
// ---------------------------------------------------------------------------

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StatFileArgs {
    pub workspace_root: String,
    pub path: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StatFileResult {
    pub size: u64,
    pub mtime_secs: i64,
    pub is_dir: bool,
    pub is_binary: bool,
}

#[tauri::command]
pub fn stat_file(args: StatFileArgs) -> Result<StatFileResult, FsError> {
    let abs = ensure_inside_workspace_exists(&args.workspace_root, &args.path)?;
    let meta = fs::metadata(&abs).map_err(FsError::from)?;
    let is_dir = meta.is_dir();
    let size = meta.len();
    let mtime_secs = meta
        .modified()
        .map(|t| t.duration_since(std::time::UNIX_EPOCH).unwrap_or_default().as_secs() as i64)
        .unwrap_or(0);

    let is_binary = if meta.is_file() {
        path_has_binary_extension(&abs)
            || fs::File::open(&abs)
                .ok()
                .and_then(|f| is_binary_content(f).ok())
                .unwrap_or(false)
    } else {
        false
    };

    Ok(StatFileResult {
        size,
        mtime_secs,
        is_dir,
        is_binary,
    })
}
