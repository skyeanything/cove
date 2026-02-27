//! Pure parsing helpers for JSON-RPC responses.

use std::process::ExitStatus;

use super::super::types::{CommandResult, JsonRpcResponse};

/// 格式化进程退出状态，包含 Unix 信号信息
pub(super) fn format_exit_status(status: &ExitStatus) -> String {
    if let Some(code) = status.code() {
        return format!("exit code {code}");
    }
    #[cfg(unix)]
    {
        use std::os::unix::process::ExitStatusExt;
        if let Some(sig) = status.signal() {
            return format!("killed by signal {sig}");
        }
    }
    "unknown exit status".to_string()
}

/// 解析 JSON-RPC 响应为 CommandResult
pub(super) fn parse_response(line: &str) -> Result<CommandResult, String> {
    let resp: JsonRpcResponse = serde_json::from_str(line)
        .map_err(|e| format!("解析 JSON-RPC 响应失败: {e}"))?;
    if let Some(err) = resp.error {
        return Ok(CommandResult {
            status: "error".to_string(),
            data: serde_json::Value::Null,
            error: Some(err.message),
            metrics: None,
        });
    }
    let result = resp.result.unwrap_or(serde_json::Value::Null);
    let payload = result.get("output").cloned().unwrap_or(result);
    if let Ok(mut r) = serde_json::from_value::<CommandResult>(payload.clone()) {
        if r.status == "failure" {
            r.status = "error".to_string();
        }
        return Ok(r);
    }
    Ok(CommandResult {
        status: "success".to_string(),
        data: payload,
        error: None,
        metrics: None,
    })
}
