use std::fs;
use std::io::Read;

use serde::{Deserialize, Serialize};

use super::detection::{
    is_binary_content, mime_from_extension, mime_from_magic, path_has_binary_extension,
    LINE_MAX_CHARS, READ_DATA_URL_MAX_BYTES, READ_MAX_BYTES,
};
use super::validation::ensure_inside_workspace_exists;
use super::FsError;

// ---------------------------------------------------------------------------
// read_file
// ---------------------------------------------------------------------------

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ReadFileArgs {
    pub workspace_root: String,
    pub path: String,
    #[serde(default)]
    pub offset: Option<u64>,
    #[serde(default)]
    pub limit: Option<u64>,
}

#[tauri::command]
pub fn read_file(args: ReadFileArgs) -> Result<String, FsError> {
    let abs = ensure_inside_workspace_exists(&args.workspace_root, &args.path)?;
    let meta = fs::metadata(&abs).map_err(FsError::from)?;
    if meta.is_dir() {
        return Err(FsError::NotAllowed("is a directory".into()));
    }
    if meta.len() > READ_MAX_BYTES {
        return Err(FsError::TooLarge);
    }
    if path_has_binary_extension(&abs) {
        return Err(FsError::BinaryFile);
    }
    let mut f = fs::File::open(&abs).map_err(FsError::from)?;
    if is_binary_content(&mut f).map_err(FsError::from)? {
        return Err(FsError::BinaryFile);
    }
    f = fs::File::open(&abs).map_err(FsError::from)?;
    let mut content = String::new();
    f.read_to_string(&mut content).map_err(FsError::from)?;

    let offset = args.offset.unwrap_or(0) as usize;
    let limit = args.limit.unwrap_or(2000) as usize;

    let lines: Vec<&str> = content.lines().collect();
    let total = lines.len();
    let from = offset.min(total);
    let to = (from + limit).min(total);
    let selected = &lines[from..to];

    let mut out = String::new();
    for (i, line) in selected.iter().enumerate() {
        let line_no = from + i + 1;
        let prefix = format!("{:05}| ", line_no);
        let trimmed = if line.chars().count() > LINE_MAX_CHARS {
            let s: String = line.chars().take(LINE_MAX_CHARS).collect();
            format!("{}[... truncated {} chars]", s, line.chars().count() - LINE_MAX_CHARS)
        } else {
            line.to_string()
        };
        out.push_str(&prefix);
        out.push_str(&trimmed);
        out.push('\n');
    }
    Ok(out)
}

// ---------------------------------------------------------------------------
// read_file_raw
// ---------------------------------------------------------------------------

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ReadFileRawArgs {
    pub workspace_root: String,
    pub path: String,
}

#[tauri::command]
pub fn read_file_raw(args: ReadFileRawArgs) -> Result<String, FsError> {
    let abs = ensure_inside_workspace_exists(&args.workspace_root, &args.path)?;
    let meta = fs::metadata(&abs).map_err(FsError::from)?;
    if meta.is_dir() {
        return Err(FsError::NotAllowed("is a directory".into()));
    }
    if meta.len() > READ_MAX_BYTES {
        return Err(FsError::TooLarge);
    }
    if path_has_binary_extension(&abs) {
        return Err(FsError::BinaryFile);
    }
    let mut f = fs::File::open(&abs).map_err(FsError::from)?;
    if is_binary_content(&mut f).map_err(FsError::from)? {
        return Err(FsError::BinaryFile);
    }
    f = fs::File::open(&abs).map_err(FsError::from)?;
    let mut content = String::new();
    f.read_to_string(&mut content).map_err(FsError::from)?;
    Ok(content)
}

// ---------------------------------------------------------------------------
// read_file_as_data_url
// ---------------------------------------------------------------------------

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ReadFileAsDataUrlArgs {
    pub workspace_root: String,
    pub path: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ReadFileAsDataUrlResult {
    pub data_url: String,
}

#[tauri::command]
pub fn read_file_as_data_url(args: ReadFileAsDataUrlArgs) -> Result<ReadFileAsDataUrlResult, FsError> {
    let abs = ensure_inside_workspace_exists(&args.workspace_root, &args.path)?;
    let meta = fs::metadata(&abs).map_err(FsError::from)?;
    if meta.is_dir() {
        return Err(FsError::NotAllowed("is a directory".into()));
    }
    if meta.len() > READ_DATA_URL_MAX_BYTES {
        return Err(FsError::TooLarge);
    }
    let bytes = fs::read(&abs).map_err(FsError::from)?;
    let mime = mime_from_magic(&bytes).unwrap_or_else(|| mime_from_extension(&abs));
    use base64::engine::general_purpose::STANDARD as BASE64;
    use base64::Engine;
    let b64 = BASE64.encode(&bytes);
    let data_url = format!("data:{};base64,{}", mime, b64);
    Ok(ReadFileAsDataUrlResult { data_url })
}
