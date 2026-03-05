mod commands;
mod file_utils;
mod parsers;
mod preprocess;
mod workspace_save;

pub use commands::*;
pub use preprocess::*;
pub use workspace_save::*;

use serde::{Deserialize, Serialize};

// ---------------------------------------------------------------------------
// Shared argument / result types (existing)
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

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SaveAttachmentFromBase64Args {
    pub name: String,
    pub content_base64: String,
    #[serde(default)]
    #[allow(dead_code)]
    pub mime_type: Option<String>,
}

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

// ---------------------------------------------------------------------------
// Workspace save types (SI-2)
// ---------------------------------------------------------------------------

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SaveAttachmentToWorkspaceArgs {
    pub source_path: String,
    pub workspace_root: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SaveAttachmentToWorkspaceFromBase64Args {
    pub name: String,
    pub content_base64: String,
    pub workspace_root: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SaveAttachmentToWorkspaceResult {
    pub path: String,
    pub name: String,
    pub size: u64,
    pub relative_path: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub preview_data_url: Option<String>,
}

// ---------------------------------------------------------------------------
// Preprocess types (SI-3)
// ---------------------------------------------------------------------------

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PreprocessAttachmentArgs {
    pub path: String,
    #[serde(default)]
    pub max_chars: Option<usize>,
}

#[derive(Debug, Serialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct AttachmentMetadata {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub page_count: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub sheet_names: Option<Vec<String>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub slide_count: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub line_count: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub image_dimensions: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PreprocessAttachmentResult {
    pub file_type: String,
    pub content: String,
    pub summary: String,
    pub char_count: usize,
    pub truncated: bool,
    pub warnings: Vec<String>,
    pub metadata: AttachmentMetadata,
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

    #[test]
    fn serde_workspace_save_args() {
        let json = r#"{"sourcePath":"/tmp/file.pdf","workspaceRoot":"/project"}"#;
        let args: SaveAttachmentToWorkspaceArgs = serde_json::from_str(json).unwrap();
        assert_eq!(args.source_path, "/tmp/file.pdf");
        assert_eq!(args.workspace_root, "/project");
    }

    #[test]
    fn serde_preprocess_args() {
        let json = r#"{"path":"/project/file.txt","maxChars":1000}"#;
        let args: PreprocessAttachmentArgs = serde_json::from_str(json).unwrap();
        assert_eq!(args.path, "/project/file.txt");
        assert_eq!(args.max_chars, Some(1000));
    }

    #[test]
    fn serde_preprocess_result() {
        let result = PreprocessAttachmentResult {
            file_type: "text".to_string(),
            content: "hello".to_string(),
            summary: "hello".to_string(),
            char_count: 5,
            truncated: false,
            warnings: vec![],
            metadata: AttachmentMetadata {
                line_count: Some(1),
                ..Default::default()
            },
        };
        let json = serde_json::to_string(&result).unwrap();
        assert!(json.contains("\"fileType\""));
        assert!(json.contains("\"charCount\""));
        assert!(json.contains("\"lineCount\""));
        // Optional None fields should be skipped
        assert!(!json.contains("\"pageCount\""));
    }
}
