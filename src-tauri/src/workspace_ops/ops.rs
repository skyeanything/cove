// FILE_SIZE_EXCEPTION: 11 workspace ops with security validation
use crate::fs_commands::{
    ensure_inside_workspace_exists, ensure_inside_workspace_may_not_exist,
    is_binary_content, path_has_binary_extension,
};

pub fn ws_read_file(workspace_root: &str, path: &str) -> Result<String, String> {
    let abs = ensure_inside_workspace_exists(workspace_root, path)
        .map_err(|_| "path outside workspace".to_string())?;
    std::fs::read_to_string(&abs).map_err(|e| e.to_string())
}

pub fn ws_write_file(workspace_root: &str, path: &str, content: &str) -> Result<(), String> {
    let abs = ensure_inside_workspace_may_not_exist(workspace_root, path)
        .map_err(|_| "path outside workspace".to_string())?;
    if let Some(parent) = abs.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    std::fs::write(&abs, content).map_err(|e| e.to_string())
}

pub fn ws_append_file(workspace_root: &str, path: &str, content: &str) -> Result<(), String> {
    use std::io::Write;
    let abs = ensure_inside_workspace_may_not_exist(workspace_root, path)
        .map_err(|_| "path outside workspace".to_string())?;
    if let Some(parent) = abs.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let mut file = std::fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(&abs)
        .map_err(|e| e.to_string())?;
    file.write_all(content.as_bytes()).map_err(|e| e.to_string())
}

pub fn ws_list_dir(workspace_root: &str, path: &str) -> Result<Vec<String>, String> {
    let abs = ensure_inside_workspace_exists(workspace_root, path)
        .map_err(|_| "path outside workspace".to_string())?;
    let entries = std::fs::read_dir(&abs).map_err(|e| e.to_string())?;
    Ok(entries
        .filter_map(|e| e.ok())
        .map(|e| e.file_name().to_string_lossy().into_owned())
        .collect())
}

pub fn ws_exists(workspace_root: &str, path: &str) -> Result<bool, String> {
    let abs = match ensure_inside_workspace_may_not_exist(workspace_root, path) {
        Ok(p) => p,
        Err(_) => return Ok(false),
    };
    Ok(abs.exists())
}

/// Stat result with all fields needed by interpreters.
pub struct StatResult {
    pub size: u64,
    pub mtime: u64,
    pub is_dir: bool,
    pub is_binary: bool,
}

pub fn ws_stat(workspace_root: &str, path: &str) -> Result<StatResult, String> {
    let abs = ensure_inside_workspace_exists(workspace_root, path)
        .map_err(|_| "path outside workspace or not found".to_string())?;
    let meta = std::fs::metadata(&abs).map_err(|e| e.to_string())?;
    let is_dir = meta.is_dir();
    let size = meta.len();
    let mtime = meta
        .modified()
        .ok()
        .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
        .map(|d| d.as_secs())
        .unwrap_or(0);
    let is_binary = if is_dir {
        false
    } else if path_has_binary_extension(&abs) {
        true
    } else {
        std::fs::File::open(&abs)
            .ok()
            .and_then(|f| is_binary_content(f).ok())
            .unwrap_or(false)
    };
    Ok(StatResult { size, mtime, is_dir, is_binary })
}

pub fn ws_copy_file(workspace_root: &str, src: &str, dst: &str) -> Result<(), String> {
    let abs_src = ensure_inside_workspace_exists(workspace_root, src)
        .map_err(|_| "source path outside workspace or not found".to_string())?;
    let abs_dst = ensure_inside_workspace_may_not_exist(workspace_root, dst)
        .map_err(|_| "destination path outside workspace".to_string())?;
    if let Some(parent) = abs_dst.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    std::fs::copy(&abs_src, &abs_dst).map_err(|e| e.to_string())?;
    Ok(())
}

pub fn ws_move_file(workspace_root: &str, src: &str, dst: &str) -> Result<(), String> {
    let abs_src = ensure_inside_workspace_exists(workspace_root, src)
        .map_err(|_| "source path outside workspace or not found".to_string())?;
    let abs_dst = ensure_inside_workspace_may_not_exist(workspace_root, dst)
        .map_err(|_| "destination path outside workspace".to_string())?;
    if let Some(parent) = abs_dst.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    std::fs::rename(&abs_src, &abs_dst).map_err(|e| e.to_string())
}

pub fn ws_remove(workspace_root: &str, path: &str) -> Result<(), String> {
    let abs = ensure_inside_workspace_exists(workspace_root, path)
        .map_err(|_| "path outside workspace or not found".to_string())?;
    let meta = std::fs::metadata(&abs).map_err(|e| e.to_string())?;
    if meta.is_dir() {
        std::fs::remove_dir(&abs).map_err(|e| e.to_string())
    } else {
        std::fs::remove_file(&abs).map_err(|e| e.to_string())
    }
}

pub fn ws_create_dir(workspace_root: &str, path: &str) -> Result<(), String> {
    let abs = ensure_inside_workspace_may_not_exist(workspace_root, path)
        .map_err(|_| "path outside workspace".to_string())?;
    std::fs::create_dir_all(&abs).map_err(|e| e.to_string())
}

