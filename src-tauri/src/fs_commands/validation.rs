use std::path::{Path, PathBuf};

use super::FsError;

/// 规范化路径成分（解析 `.` 与 `..`），不要求路径在磁盘上存在。
pub(super) fn normalize_path_components(p: &Path) -> PathBuf {
    let mut out = PathBuf::new();
    for c in p.components() {
        match c {
            std::path::Component::CurDir => {}
            std::path::Component::ParentDir => {
                out.pop();
            }
            other => out.push(other),
        }
    }
    out
}

/// 路径必须存在：规范为绝对路径并校验在工作区内。
pub(crate) fn ensure_inside_workspace_exists(workspace_root: &str, path: &str) -> Result<PathBuf, FsError> {
    let root = Path::new(workspace_root)
        .canonicalize()
        .map_err(|_| FsError::NotFound)?
        .into_os_string()
        .into_string()
        .map_err(|_| FsError::Io("workspace path invalid utf-8".into()))?;

    let p = Path::new(path);
    let resolved = if p.is_absolute() {
        PathBuf::from(path)
    } else {
        Path::new(&root).join(path)
    };
    let canonical = resolved.canonicalize().map_err(|e| {
        if e.kind() == std::io::ErrorKind::NotFound {
            FsError::NotFound
        } else {
            FsError::Io(e.to_string())
        }
    })?;
    let canonical_str = canonical
        .into_os_string()
        .into_string()
        .map_err(|_| FsError::Io("resolved path invalid utf-8".into()))?;
    if !canonical_str.starts_with(&root) {
        return Err(FsError::OutsideWorkspace);
    }
    Ok(PathBuf::from(canonical_str))
}

/// 路径可以不存在（如写入新文件）：规范为绝对路径并校验在工作区内。
pub(crate) fn ensure_inside_workspace_may_not_exist(workspace_root: &str, path: &str) -> Result<PathBuf, FsError> {
    let root = Path::new(workspace_root).canonicalize().map_err(|_| FsError::NotFound)?;

    let p = Path::new(path);
    let resolved = if p.is_absolute() {
        normalize_path_components(Path::new(path))
    } else {
        normalize_path_components(&root.join(path))
    };
    if !resolved.starts_with(&root) {
        return Err(FsError::OutsideWorkspace);
    }
    Ok(resolved)
}
