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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn serde_save_file_args() {
        let json = r#"{"sourcePath":"/tmp/file.pdf"}"#;
        let args: SaveAttachmentFileArgs = serde_json::from_str(json).unwrap();
        assert_eq!(args.source_path, "/tmp/file.pdf");
    }

    #[test]
    fn serde_read_text_args_full() {
        let json = r#"{"path":"/tmp/doc.pdf","maxBytes":1024,"pageRange":"1-3"}"#;
        let args: ReadAttachmentTextArgs = serde_json::from_str(json).unwrap();
        assert_eq!(args.path, "/tmp/doc.pdf");
        assert_eq!(args.max_bytes, Some(1024));
        assert_eq!(args.page_range, Some("1-3".to_string()));
    }

    #[test]
    fn serde_read_text_args_optional_defaults() {
        let json = r#"{"path":"/tmp/doc.txt"}"#;
        let args: ReadAttachmentTextArgs = serde_json::from_str(json).unwrap();
        assert_eq!(args.path, "/tmp/doc.txt");
        assert_eq!(args.max_bytes, None);
        assert_eq!(args.page_range, None);
    }

    #[test]
    fn serde_result_serializes_camel_case() {
        let result = ParseDocumentTextResult {
            file_type: "pdf".to_string(),
            content: "hello".to_string(),
            truncated: false,
            warnings: vec![],
        };
        let json = serde_json::to_string(&result).unwrap();
        assert!(json.contains("\"fileType\""));
        assert!(json.contains("\"truncated\""));
        assert!(!json.contains("file_type"));
    }
}
