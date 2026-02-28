use std::fs;
use std::path::Path;

use serde::Deserialize;

use super::validation::{ensure_inside_workspace_exists, ensure_inside_workspace_may_not_exist};
use super::FsError;

// ---------------------------------------------------------------------------
// copy_entry
// ---------------------------------------------------------------------------

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CopyEntryArgs {
    pub workspace_root: String,
    pub from_path: String,
    pub to_path: String,
}

/// Core copy logic, separated from Tauri event emission for testability.
pub(super) fn copy_entry_inner(args: &CopyEntryArgs) -> Result<String, FsError> {
    let from_abs = ensure_inside_workspace_exists(&args.workspace_root, &args.from_path)?;
    let to_abs = ensure_inside_workspace_may_not_exist(&args.workspace_root, &args.to_path)?;

    if to_abs.exists() {
        return Err(FsError::NotAllowed("destination already exists".into()));
    }

    let meta = fs::metadata(&from_abs).map_err(FsError::from)?;
    if meta.is_dir() {
        copy_dir_recursive(&from_abs, &to_abs)?;
    } else {
        if let Some(parent) = to_abs.parent() {
            if !parent.exists() {
                fs::create_dir_all(parent).map_err(FsError::from)?;
            }
        }
        fs::copy(&from_abs, &to_abs).map_err(FsError::from)?;
    }

    let root = Path::new(&args.workspace_root)
        .canonicalize()
        .map_err(FsError::from)?;
    let rel = to_abs
        .strip_prefix(&root)
        .map(|p| p.to_string_lossy().replace('\\', "/"))
        .unwrap_or_else(|_| args.to_path.clone());

    Ok(rel)
}

#[tauri::command]
pub fn copy_entry(app: tauri::AppHandle, args: CopyEntryArgs) -> Result<(), FsError> {
    let rel = copy_entry_inner(&args)?;

    use tauri::Emitter;
    let _ = app.emit(
        crate::workspace_watcher::EVENT_WORKSPACE_FILE_CHANGED,
        crate::workspace_watcher::WorkspaceFileChangedPayload {
            path: rel,
            kind: crate::workspace_watcher::FileChangeKind::Create,
        },
    );

    Ok(())
}

// ---------------------------------------------------------------------------
// Recursive directory copy helper
// ---------------------------------------------------------------------------

fn copy_dir_recursive(src: &Path, dst: &Path) -> Result<(), FsError> {
    fs::create_dir_all(dst).map_err(FsError::from)?;
    for entry in fs::read_dir(src).map_err(FsError::from)? {
        let entry = entry.map_err(FsError::from)?;
        let ty = entry.file_type().map_err(FsError::from)?;
        let src_path = entry.path();
        let dst_path = dst.join(entry.file_name());
        if ty.is_dir() {
            copy_dir_recursive(&src_path, &dst_path)?;
        } else {
            fs::copy(&src_path, &dst_path).map_err(FsError::from)?;
        }
    }
    Ok(())
}
