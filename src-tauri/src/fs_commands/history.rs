//! 文件历史版本快照：存储在 app_data_dir/cove/history/{base64(abs_path)}/

use std::fs;
use std::path::PathBuf;
use std::time::{SystemTime, UNIX_EPOCH};

use base64::engine::general_purpose::URL_SAFE_NO_PAD;
use base64::Engine;
use serde::{Deserialize, Serialize};
use tauri::Manager;

const MAX_VERSIONS: usize = 20;

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct VersionEntry {
    pub snapshot_path: String,
    pub timestamp_ms: u64,
    pub size_bytes: u64,
}

fn history_dir(app: &tauri::AppHandle, original_path: &str) -> Result<PathBuf, String> {
    let data_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("app_data_dir: {e}"))?;
    let key = URL_SAFE_NO_PAD.encode(original_path.as_bytes());
    Ok(data_dir.join("history").join(key))
}

fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

/// 清理超出 MAX_VERSIONS 的最旧快照
fn cleanup_old_versions(dir: &PathBuf) {
    let Ok(entries) = fs::read_dir(dir) else { return };
    let mut snaps: Vec<PathBuf> = entries
        .flatten()
        .filter(|e| {
            e.path()
                .extension()
                .map_or(false, |ext| ext == "snap")
        })
        .map(|e| e.path())
        .collect();
    // 文件名是 timestamp_ms.snap，按名称升序 = 时间升序（最旧在前）
    snaps.sort();
    if snaps.len() > MAX_VERSIONS {
        for old in snaps.iter().take(snaps.len() - MAX_VERSIONS) {
            let _ = fs::remove_file(old);
        }
    }
}

#[tauri::command]
pub fn save_file_version(
    app: tauri::AppHandle,
    original_path: String,
    content: String,
) -> Result<String, String> {
    let dir = history_dir(&app, &original_path)?;
    fs::create_dir_all(&dir).map_err(|e| format!("create history dir: {e}"))?;

    let ts = now_ms();
    let snap_path = dir.join(format!("{ts}.snap"));
    fs::write(&snap_path, &content).map_err(|e| format!("write snapshot: {e}"))?;

    cleanup_old_versions(&dir);

    Ok(snap_path.to_string_lossy().into_owned())
}

#[tauri::command]
pub fn list_file_versions(
    app: tauri::AppHandle,
    original_path: String,
) -> Result<Vec<VersionEntry>, String> {
    let dir = history_dir(&app, &original_path)?;
    if !dir.exists() {
        return Ok(vec![]);
    }

    let entries = fs::read_dir(&dir).map_err(|e| format!("read history dir: {e}"))?;
    let mut versions: Vec<VersionEntry> = entries
        .flatten()
        .filter(|e| {
            e.path()
                .extension()
                .map_or(false, |ext| ext == "snap")
        })
        .filter_map(|e| {
            let path = e.path();
            let stem = path.file_stem()?.to_string_lossy().into_owned();
            let ts: u64 = stem.parse().ok()?;
            let size = e.metadata().ok()?.len();
            Some(VersionEntry {
                snapshot_path: path.to_string_lossy().into_owned(),
                timestamp_ms: ts,
                size_bytes: size,
            })
        })
        .collect();

    // 最新在前
    versions.sort_by(|a, b| b.timestamp_ms.cmp(&a.timestamp_ms));
    Ok(versions)
}

#[tauri::command]
pub fn read_file_version(snapshot_path: String) -> Result<String, String> {
    fs::read_to_string(&snapshot_path).map_err(|e| format!("read snapshot: {e}"))
}
