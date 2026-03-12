//! 文件树自定义排序：存储在 app_data_dir/file-orders/{base64(workspace_root)}.json
//!
//! JSON 格式：{ [folderRelPath: string]: string[] }
//! 根目录用空字符串 "" 作为 key。

use std::fs;
use std::path::PathBuf;

use base64::engine::general_purpose::URL_SAFE_NO_PAD;
use base64::Engine;
use tauri::Manager;

fn order_file(app: &tauri::AppHandle, workspace_root: &str) -> Result<PathBuf, String> {
    let data_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("app_data_dir: {e}"))?;
    let key = URL_SAFE_NO_PAD.encode(workspace_root.as_bytes());
    Ok(data_dir.join("file-orders").join(format!("{key}.json")))
}

/// 读取指定 workspace 的排序数据，文件不存在时返回 "{}"。
#[tauri::command]
pub fn read_file_order(app: tauri::AppHandle, workspace_root: String) -> Result<String, String> {
    let path = order_file(&app, &workspace_root)?;
    if !path.exists() {
        return Ok("{}".to_string());
    }
    fs::read_to_string(&path).map_err(|e| format!("read file-order: {e}"))
}

/// 保存指定 workspace 的排序数据（覆盖写入）。
#[tauri::command]
pub fn save_file_order(
    app: tauri::AppHandle,
    workspace_root: String,
    content: String,
) -> Result<(), String> {
    let path = order_file(&app, &workspace_root)?;
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| format!("create dir: {e}"))?;
    }
    fs::write(&path, content).map_err(|e| format!("write file-order: {e}"))
}
