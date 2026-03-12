use std::fs;
use std::path::Path;

use base64::engine::general_purpose::STANDARD as BASE64_STANDARD;
use base64::Engine;
use serde::Deserialize;

use super::validation::{ensure_inside_workspace_exists, ensure_inside_workspace_may_not_exist};
use super::FsError;

// ---------------------------------------------------------------------------
// write_file
// ---------------------------------------------------------------------------

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WriteFileArgs {
    pub workspace_root: String,
    pub path: String,
    pub content: String,
}

#[tauri::command]
pub fn write_file(args: WriteFileArgs) -> Result<(), FsError> {
    let abs = ensure_inside_workspace_may_not_exist(&args.workspace_root, &args.path)?;
    if abs.is_dir() {
        return Err(FsError::NotAllowed("path is a directory".into()));
    }
    if let Some(parent) = abs.parent() {
        if !parent.exists() {
            fs::create_dir_all(parent).map_err(FsError::from)?;
        }
    }
    fs::write(&abs, args.content).map_err(FsError::from)?;
    Ok(())
}

// ---------------------------------------------------------------------------
// create_new_file: atomic create-only, fails if file already exists
// ---------------------------------------------------------------------------

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateNewFileArgs {
    pub workspace_root: String,
    pub path: String,
}

#[tauri::command]
pub fn create_new_file(args: CreateNewFileArgs) -> Result<(), FsError> {
    let abs = ensure_inside_workspace_may_not_exist(&args.workspace_root, &args.path)?;
    if abs.is_dir() {
        return Err(FsError::NotAllowed("path is a directory".into()));
    }
    if let Some(p) = abs.parent().filter(|p| !p.exists()) {
        fs::create_dir_all(p).map_err(FsError::from)?;
    }
    fs::File::options().write(true).create_new(true).open(&abs).map_err(|e| {
        if e.kind() == std::io::ErrorKind::AlreadyExists {
            FsError::NotAllowed("already exists".into())
        } else {
            FsError::from(e)
        }
    })?;
    Ok(())
}

// ---------------------------------------------------------------------------
// create_dir
// ---------------------------------------------------------------------------

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateDirArgs {
    pub workspace_root: String,
    /// 父目录相对工作区根的路径，空字符串表示工作区根
    pub path: String,
    /// 新文件夹名称
    pub name: String,
}

#[tauri::command]
pub fn create_dir(app: tauri::AppHandle, args: CreateDirArgs) -> Result<(), FsError> {
    let parent_path = if args.path.trim().is_empty() {
        ".".to_string()
    } else {
        args.path.clone()
    };
    let parent = ensure_inside_workspace_exists(&args.workspace_root, &parent_path)?;
    let name = args.name.trim();
    if name.is_empty() || name.contains('/') || name.contains('\\') {
        return Err(FsError::NotAllowed("invalid folder name".into()));
    }
    let new_dir = parent.join(name);
    if new_dir.exists() {
        return Err(FsError::NotAllowed("already exists".into()));
    }
    fs::create_dir(&new_dir).map_err(FsError::from)?;
    let root = Path::new(&args.workspace_root).canonicalize().map_err(FsError::from)?;
    let rel = new_dir
        .strip_prefix(&root)
        .map(|p| p.to_string_lossy().replace('\\', "/"))
        .map_err(|_| FsError::Io("strip prefix".into()))?;
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
// move_file (含重命名)
// ---------------------------------------------------------------------------

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MoveFileArgs {
    pub workspace_root: String,
    pub from_path: String,
    pub to_path: String,
}

#[tauri::command]
pub fn move_file(app: tauri::AppHandle, args: MoveFileArgs) -> Result<(), FsError> {
    let from_abs = ensure_inside_workspace_exists(&args.workspace_root, &args.from_path)?;
    let to_abs = ensure_inside_workspace_may_not_exist(&args.workspace_root, &args.to_path)?;
    if from_abs == to_abs {
        return Ok(());
    }
    if to_abs.exists() {
        return Err(FsError::NotAllowed("destination already exists".into()));
    }
    if let Some(parent) = to_abs.parent() {
        if !parent.exists() {
            fs::create_dir_all(parent).map_err(FsError::from)?;
        }
    }
    fs::rename(&from_abs, &to_abs).map_err(FsError::from)?;
    let root = Path::new(&args.workspace_root).canonicalize().map_err(FsError::from)?;
    let from_rel = from_abs
        .strip_prefix(&root)
        .map(|p| p.to_string_lossy().replace('\\', "/"))
        .unwrap_or_else(|_| args.from_path.clone());
    let to_rel = to_abs
        .strip_prefix(&root)
        .map(|p| p.to_string_lossy().replace('\\', "/"))
        .unwrap_or_else(|_| args.to_path.clone());
    use tauri::Emitter;
    let _ = app.emit(
        crate::workspace_watcher::EVENT_WORKSPACE_FILE_CHANGED,
        crate::workspace_watcher::WorkspaceFileChangedPayload {
            path: from_rel,
            kind: crate::workspace_watcher::FileChangeKind::Rename,
        },
    );
    let _ = app.emit(
        crate::workspace_watcher::EVENT_WORKSPACE_FILE_CHANGED,
        crate::workspace_watcher::WorkspaceFileChangedPayload {
            path: to_rel,
            kind: crate::workspace_watcher::FileChangeKind::Create,
        },
    );
    Ok(())
}

// ---------------------------------------------------------------------------
// remove_entry (文件或目录)
// ---------------------------------------------------------------------------

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RemoveEntryArgs {
    pub workspace_root: String,
    pub path: String,
}

#[tauri::command]
pub fn remove_entry(app: tauri::AppHandle, args: RemoveEntryArgs) -> Result<(), FsError> {
    let abs = ensure_inside_workspace_exists(&args.workspace_root, &args.path)?;
    let meta = fs::metadata(&abs).map_err(FsError::from)?;
    if meta.is_dir() {
        fs::remove_dir_all(&abs).map_err(FsError::from)?;
    } else {
        fs::remove_file(&abs).map_err(FsError::from)?;
    }
    use tauri::Emitter;
    let _ = app.emit(
        crate::workspace_watcher::EVENT_WORKSPACE_FILE_CHANGED,
        crate::workspace_watcher::WorkspaceFileChangedPayload {
            path: args.path.clone(),
            kind: crate::workspace_watcher::FileChangeKind::Remove,
        },
    );
    Ok(())
}

// ---------------------------------------------------------------------------
// reveal_in_finder
// ---------------------------------------------------------------------------

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RevealInFinderArgs {
    pub workspace_root: String,
    pub path: String,
}

#[tauri::command]
pub fn reveal_in_finder(args: RevealInFinderArgs) -> Result<(), FsError> {
    let abs = ensure_inside_workspace_exists(&args.workspace_root, &args.path)?;
    let abs_str = abs.to_str().ok_or_else(|| FsError::Io("path invalid utf-8".into()))?;

    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("open")
            .arg("-R")
            .arg(abs_str)
            .spawn()
            .map_err(|e| FsError::Io(e.to_string()))?;
    }

    #[cfg(target_os = "windows")]
    {
        let arg = format!("/select,{}", abs_str);
        std::process::Command::new("explorer").arg(arg).spawn().map_err(|e| FsError::Io(e.to_string()))?;
    }

    #[cfg(not(any(target_os = "macos", target_os = "windows")))]
    {
        if let Some(parent) = abs.parent() {
            if let Some(p) = parent.to_str() {
                let _ = std::process::Command::new("xdg-open").arg(p).spawn();
            }
        }
    }

    Ok(())
}

// ---------------------------------------------------------------------------
// open_with_app
// ---------------------------------------------------------------------------

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OpenWithAppArgs {
    pub workspace_root: String,
    pub path: String,
    /// 可选：指定用哪个应用打开（macOS 上为 app 名称或 bundle path）
    #[serde(default)]
    pub open_with: Option<String>,
}

#[tauri::command]
pub fn open_with_app(args: OpenWithAppArgs) -> Result<(), FsError> {
    let abs = ensure_inside_workspace_exists(&args.workspace_root, &args.path)?;
    let abs_str = abs.to_str().ok_or_else(|| FsError::Io("path invalid utf-8".into()))?;

    let mut cmd = std::process::Command::new("open");
    if let Some(app) = &args.open_with {
        cmd.arg("-a").arg(app);
    }
    cmd.arg(abs_str);
    cmd.spawn().map_err(|e| FsError::Io(e.to_string()))?;
    Ok(())
}

// ---------------------------------------------------------------------------
// create_file
// ---------------------------------------------------------------------------

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateFileArgs {
    pub workspace_root: String,
    /// 父目录相对工作区根的路径，空字符串表示工作区根
    pub path: String,
    /// 文件名（含扩展名），不可含路径分隔符
    pub name: String,
}

#[tauri::command]
pub fn create_file(app: tauri::AppHandle, args: CreateFileArgs) -> Result<(), FsError> {
    let name = args.name.trim();
    if name.is_empty() || name.contains('/') || name.contains('\\') {
        return Err(FsError::NotAllowed("invalid file name".into()));
    }
    // Build parent path: use "." for workspace root so ensure_inside_workspace_exists works
    let parent_rel = args.path.trim();
    let parent_path = if parent_rel.is_empty() { "." } else { parent_rel };
    // Validate parent exists and is inside workspace (same pattern as create_dir)
    let parent_abs = ensure_inside_workspace_exists(&args.workspace_root, parent_path)?;
    let new_file = parent_abs.join(name);
    if new_file.exists() {
        return Err(FsError::NotAllowed("already exists".into()));
    }
    fs::write(&new_file, "").map_err(FsError::from)?;
    let rel_path = if parent_rel.is_empty() {
        name.to_string()
    } else {
        format!("{}/{}", parent_rel, name)
    };
    use tauri::Emitter;
    let _ = app.emit(
        crate::workspace_watcher::EVENT_WORKSPACE_FILE_CHANGED,
        crate::workspace_watcher::WorkspaceFileChangedPayload {
            path: rel_path,
            kind: crate::workspace_watcher::FileChangeKind::Create,
        },
    );
    Ok(())
}

// FILE_SIZE_EXCEPTION: write.rs exceeds 300 lines — multiple Tauri FS commands in one file

// ---------------------------------------------------------------------------
// write_binary_file
// ---------------------------------------------------------------------------

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WriteBinaryFileArgs {
    pub workspace_root: String,
    pub path: String,
    /// Base64-encoded binary content
    pub content_base64: String,
}

#[tauri::command]
pub fn write_binary_file(app: tauri::AppHandle, args: WriteBinaryFileArgs) -> Result<String, FsError> {
    let abs = ensure_inside_workspace_may_not_exist(&args.workspace_root, &args.path)?;
    if abs.is_dir() {
        return Err(FsError::NotAllowed("path is a directory".into()));
    }
    if let Some(parent) = abs.parent() {
        if !parent.exists() {
            fs::create_dir_all(parent).map_err(FsError::from)?;
        }
    }
    let bytes = BASE64_STANDARD
        .decode(&args.content_base64)
        .map_err(|e| FsError::Io(format!("base64 decode failed: {e}")))?;
    fs::write(&abs, bytes).map_err(FsError::from)?;
    let root = Path::new(&args.workspace_root).canonicalize().map_err(FsError::from)?;
    let rel = abs
        .strip_prefix(&root)
        .map(|p| p.to_string_lossy().replace('\\', "/"))
        .unwrap_or_else(|_| args.path.clone());
    use tauri::Emitter;
    let _ = app.emit(
        crate::workspace_watcher::EVENT_WORKSPACE_FILE_CHANGED,
        crate::workspace_watcher::WorkspaceFileChangedPayload {
            path: rel,
            kind: crate::workspace_watcher::FileChangeKind::Create,
        },
    );
    Ok(abs.to_string_lossy().into_owned())
}
