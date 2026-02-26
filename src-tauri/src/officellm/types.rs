//! officellm 共享类型：命令结果、会话信息等。

use serde::{Deserialize, Serialize};

/// officellm CLI / Server 命令执行结果
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CommandResult {
    /// "success" | "error"
    pub status: String,
    /// 命令输出数据（JSON value）
    #[serde(default)]
    pub data: serde_json::Value,
    /// 错误信息（仅 status == "error" 时有值）
    #[serde(default)]
    pub error: Option<String>,
    /// 性能指标（可选）
    #[serde(default)]
    pub metrics: Option<serde_json::Value>,
}

/// officellm 二进制检测结果
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DetectResult {
    pub available: bool,
    pub version: Option<String>,
    pub path: Option<String>,
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
