use serde::{Deserialize, Serialize};

use super::validation::ensure_inside_workspace_exists;
use super::FsError;
use crate::document_parsers::parsers::{parse_docx, parse_pdf, parse_pptx, parse_xlsx};

const DEFAULT_MAX_CHARS: usize = 500_000;

const READABLE_OFFICE_EXTENSIONS: &[&str] = &["docx", "xlsx", "pptx", "pdf"];

pub fn is_office_extension(ext: &str) -> bool {
    READABLE_OFFICE_EXTENSIONS
        .iter()
        .any(|e| e.eq_ignore_ascii_case(ext))
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ReadOfficeTextArgs {
    pub workspace_root: String,
    pub path: String,
    #[serde(default)]
    pub max_chars: Option<usize>,
    #[serde(default)]
    pub page_range: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ReadOfficeTextResult {
    pub file_type: String,
    pub content: String,
    pub truncated: bool,
    pub warnings: Vec<String>,
}

#[tauri::command]
pub fn read_office_text(args: ReadOfficeTextArgs) -> Result<ReadOfficeTextResult, FsError> {
    let abs = ensure_inside_workspace_exists(&args.workspace_root, &args.path)?;
    let ext = abs
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or_default()
        .to_ascii_lowercase();

    if !is_office_extension(&ext) {
        return Err(FsError::NotAllowed(format!(
            "unsupported office format: .{}",
            ext
        )));
    }

    let max_chars = args.max_chars.unwrap_or(DEFAULT_MAX_CHARS);

    let (content, truncated, warnings) = match ext.as_str() {
        "docx" => parse_docx(&abs, max_chars).map_err(|e| FsError::Io(e))?,
        "xlsx" => parse_xlsx(&abs, max_chars).map_err(|e| FsError::Io(e))?,
        "pptx" => parse_pptx(&abs, max_chars).map_err(|e| FsError::Io(e))?,
        "pdf" => {
            parse_pdf(&abs, max_chars, args.page_range.as_deref()).map_err(|e| FsError::Io(e))?
        }
        _ => {
            return Err(FsError::NotAllowed(format!(
                "unsupported office format: .{}",
                ext
            )));
        }
    };

    Ok(ReadOfficeTextResult {
        file_type: ext,
        content,
        truncated,
        warnings,
    })
}

/// Check if a file path has a writable office extension (docx only for now).
pub(super) fn is_writable_office_extension(ext: &str) -> bool {
    ext.eq_ignore_ascii_case("docx")
}
