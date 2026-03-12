use std::fs;
use std::path::Path;

use serde::Deserialize;

use super::detection::{
    is_binary_content, mime_from_extension, mime_from_magic, path_has_binary_extension,
    path_has_text_extension, READ_DATA_URL_MAX_BYTES, READ_MAX_BYTES,
};
use super::read::ReadFileAsDataUrlResult;
use super::FsError;

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ReadAbsoluteFileArgs {
    pub path: String,
}

fn validate_absolute(path: &str) -> Result<&Path, FsError> {
    let p = Path::new(path);
    if !p.is_absolute() {
        return Err(FsError::NotAllowed("path must be absolute".into()));
    }
    Ok(p)
}

/// Read an absolute file path as raw text. No workspace scoping.
/// Used by the preview window for files outside the workspace (e.g. skills).
#[tauri::command]
pub fn read_absolute_file(args: ReadAbsoluteFileArgs) -> Result<String, FsError> {
    let abs = validate_absolute(&args.path)?;
    let meta = fs::metadata(abs).map_err(FsError::from)?;
    if meta.is_dir() {
        return Err(FsError::NotAllowed("is a directory".into()));
    }
    if meta.len() > READ_MAX_BYTES {
        return Err(FsError::TooLarge);
    }
    let is_known_text = path_has_text_extension(abs);
    if !is_known_text && path_has_binary_extension(abs) {
        return Err(FsError::BinaryFile);
    }
    if !is_known_text {
        let mut f = fs::File::open(abs).map_err(FsError::from)?;
        if is_binary_content(&mut f).map_err(FsError::from)? {
            return Err(FsError::BinaryFile);
        }
    }
    let bytes = fs::read(abs).map_err(FsError::from)?;
    Ok(String::from_utf8_lossy(&bytes).into_owned())
}

/// Read an absolute file path as a data URL. No workspace scoping.
#[tauri::command]
pub fn read_absolute_file_as_data_url(
    args: ReadAbsoluteFileArgs,
) -> Result<ReadFileAsDataUrlResult, FsError> {
    let abs = validate_absolute(&args.path)?;
    let meta = fs::metadata(abs).map_err(FsError::from)?;
    if meta.is_dir() {
        return Err(FsError::NotAllowed("is a directory".into()));
    }
    if meta.len() > READ_DATA_URL_MAX_BYTES {
        return Err(FsError::TooLarge);
    }
    let bytes = fs::read(abs).map_err(FsError::from)?;
    let mime = mime_from_magic(&bytes).unwrap_or_else(|| mime_from_extension(abs));
    use base64::engine::general_purpose::STANDARD as BASE64;
    use base64::Engine;
    let b64 = BASE64.encode(&bytes);
    let data_url = format!("data:{};base64,{}", mime, b64);
    Ok(ReadFileAsDataUrlResult { data_url })
}
