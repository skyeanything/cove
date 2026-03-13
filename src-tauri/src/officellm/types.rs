//! officellm 共享类型：命令结果、会话信息等。

use serde::{Deserialize, Serialize};

/// officellm 返回的结构化错误详情
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct CommandErrorDetail {
    #[serde(default)]
    pub code: Option<String>,
    #[serde(default)]
    pub message: Option<String>,
    #[serde(default)]
    pub suggestions: Vec<String>,
    #[serde(default)]
    pub details: Option<serde_json::Value>,
}

/// officellm CLI / Server 命令执行结果
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CommandResult {
    /// "success" | "error" | "failure" | "partial"
    pub status: String,
    /// 结构化状态码（例如 NO_MATCH、COMMAND_NOT_FOUND）
    #[serde(default)]
    pub code: Option<String>,
    /// 顶层消息（OfficeLLM v2 failure payload）
    #[serde(default)]
    pub message: Option<String>,
    /// 命令输出数据（JSON value）
    #[serde(default)]
    pub data: serde_json::Value,
    /// 错误信息（仅 status == "error" 时有值）
    #[serde(default)]
    pub error: Option<String>,
    /// 结构化错误列表（OfficeLLM v2 failure payload）
    #[serde(default)]
    pub errors: Vec<CommandErrorDetail>,
    /// 原始 meta 信息（schema、strict 等）
    #[serde(default)]
    pub meta: Option<serde_json::Value>,
    /// 性能指标（可选）
    #[serde(default)]
    pub metrics: Option<serde_json::Value>,
}

impl CommandResult {
    /// 向后兼容：如果新 payload 只有 message/errors，没有 error，则补齐 error。
    pub fn with_error_fallback(mut self) -> Self {
        if self.error.is_none() {
            self.error = self
                .message
                .as_ref()
                .cloned()
                .or_else(|| self.errors.iter().find_map(|e| e.message.clone()));
        }
        self
    }

    pub fn from_error_message(error: String) -> Self {
        Self {
            status: "error".to_string(),
            code: None,
            message: Some(error.clone()),
            data: serde_json::Value::Null,
            error: Some(error),
            errors: Vec::new(),
            meta: None,
            metrics: None,
        }
    }

    pub fn from_plain_text(text: String) -> Self {
        Self {
            status: "success".to_string(),
            code: None,
            message: None,
            data: serde_json::Value::String(text),
            error: None,
            errors: Vec::new(),
            meta: None,
            metrics: None,
        }
    }
}

/// officellm 二进制检测结果
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DetectResult {
    pub available: bool,
    pub version: Option<String>,
    pub path: Option<String>,
    pub bundled: bool,
}

/// Server 模式会话信息
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionInfo {
    /// 当前打开的文档路径
    pub document_path: String,
    /// 进程 PID
    pub pid: u32,
    /// 会话存活时间（秒）
    pub uptime_secs: u64,
}

/// JSON-RPC 请求（发送给 officellm serve --stdio）
#[derive(Debug, Serialize)]
pub(crate) struct JsonRpcRequest {
    pub jsonrpc: &'static str,
    pub id: u64,
    pub method: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub params: Option<serde_json::Value>,
}

/// JSON-RPC 响应（从 officellm serve --stdio 读取）
#[derive(Debug, Deserialize)]
pub(crate) struct JsonRpcResponse {
    #[allow(dead_code)]
    pub id: u64,
    pub result: Option<serde_json::Value>,
    pub error: Option<JsonRpcError>,
}

/// JSON-RPC 错误
#[derive(Debug, Deserialize)]
pub(crate) struct JsonRpcError {
    #[allow(dead_code)]
    pub code: i64,
    pub message: String,
}
