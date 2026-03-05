use std::fs;
use std::path::Path;

use base64::engine::general_purpose::STANDARD as BASE64_STANDARD;
use base64::Engine;

use super::file_utils::{read_image_preview_data_url, safe_file_name, unique_file_name};
use super::{
    SaveAttachmentToWorkspaceArgs, SaveAttachmentToWorkspaceFromBase64Args,
    SaveAttachmentToWorkspaceResult,
};

#[tauri::command]
pub fn save_attachment_to_workspace(
    args: SaveAttachmentToWorkspaceArgs,
) -> Result<SaveAttachmentToWorkspaceResult, String> {
    let src_path = Path::new(&args.source_path);
    if !src_path.exists() {
        return Err("Source file does not exist".to_string());
    }
    let src_meta =
        fs::metadata(src_path).map_err(|e| format!("Failed to read source file: {}", e))?;
    if !src_meta.is_file() {
        return Err("Only files can be uploaded".to_string());
    }

    let workspace_root = Path::new(&args.workspace_root);
    if !workspace_root.is_dir() {
        return Err("Workspace root does not exist".to_string());
    }

    let origin_name = src_path
        .file_name()
        .and_then(|n| n.to_str())
        .map(safe_file_name)
        .unwrap_or_else(|| "attachment".to_string());
    let final_name = unique_file_name(&origin_name);
    let dest_path = workspace_root.join(&final_name);

    fs::copy(src_path, &dest_path).map_err(|e| format!("Failed to save attachment: {}", e))?;
    let size = fs::metadata(&dest_path)
        .map_err(|e| format!("Failed to read file info: {}", e))?
        .len();
    let preview_data_url = read_image_preview_data_url(&dest_path, &origin_name);

    Ok(SaveAttachmentToWorkspaceResult {
        path: dest_path.to_string_lossy().to_string(),
        name: origin_name,
        size,
        relative_path: final_name,
        preview_data_url,
    })
}

#[tauri::command]
pub fn save_attachment_to_workspace_from_base64(
    args: SaveAttachmentToWorkspaceFromBase64Args,
) -> Result<SaveAttachmentToWorkspaceResult, String> {
    let workspace_root = Path::new(&args.workspace_root);
    if !workspace_root.is_dir() {
        return Err("Workspace root does not exist".to_string());
    }

    let bytes = BASE64_STANDARD
        .decode(&args.content_base64)
        .map_err(|e| format!("Base64 decode failed: {}", e))?;
    let origin_name = safe_file_name(&args.name);
    let final_name = unique_file_name(&origin_name);
    let dest_path = workspace_root.join(&final_name);

    fs::write(&dest_path, &bytes).map_err(|e| format!("Failed to save attachment: {}", e))?;
    let size = bytes.len() as u64;
    let preview_data_url = read_image_preview_data_url(&dest_path, &origin_name);

    Ok(SaveAttachmentToWorkspaceResult {
        path: dest_path.to_string_lossy().to_string(),
        name: origin_name,
        size,
        relative_path: final_name,
        preview_data_url,
    })
}
