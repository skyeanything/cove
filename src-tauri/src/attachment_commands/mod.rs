mod commands;
mod file_utils;
mod parsers;

pub use commands::*;

use serde::{Deserialize, Serialize};

// ---------------------------------------------------------------------------
// Shared argument / result types
// ---------------------------------------------------------------------------

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SaveAttachmentFileArgs {
    pub source_path: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SaveAttachmentFileResult {
    pub path: String,
    pub name: String,
    pub size: u64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub preview_data_url: Option<String>,
}

/// 从前端拖放/粘贴保存附件：无本地路径时用 base64 写入 AppData
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SaveAttachmentFromBase64Args {
    pub name: String,
    pub content_base64: String,
    #[serde(default)]
    pub mime_type: Option<String>,
}

/// 读取附件为 data URL，用于原生 PDF 等发送（有大小上限）
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ReadAttachmentDataUrlArgs {
    pub path: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ReadAttachmentDataUrlResult {
    pub data_url: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ReadAttachmentTextArgs {
    pub path: String,
    #[serde(default)]
    pub max_bytes: Option<u64>,
    #[serde(default)]
    pub page_range: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ParseDocumentTextResult {
    pub file_type: String,
    pub content: String,
    pub truncated: bool,
    pub warnings: Vec<String>,
}
