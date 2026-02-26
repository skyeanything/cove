//! Server 模式：管理 `officellm serve --stdio` 进程，JSON-RPC 通信。

use std::collections::HashMap;
use std::io::{BufRead, BufReader, Write};
use std::process::{Child, Command, Stdio};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Mutex;
use std::time::Instant;

use super::detect::default_bin_path;
use super::types::{CommandResult, JsonRpcRequest, JsonRpcResponse, SessionInfo};

/// 全局 Server 会话管理器（单例）
pub(crate) static SESSION: Mutex<Option<ServerSession>> = Mutex::new(None);

/// 一个活跃的 officellm serve --stdio 会话
pub(crate) struct ServerSession {
    child: Child,
    document_path: String,
    started_at: Instant,
    next_id: AtomicU64,
}

/// 打开文档并启动 Server 会话
pub fn open(path: &str) -> Result<(), String> {
    let mut guard = SESSION.lock().map_err(|e| format!("锁获取失败: {e}"))?;
    if guard.is_some() {
        return Err("已有活跃会话，请先调用 close() 关闭".to_string());
    }

    let bin = default_bin_path().ok_or("无法获取用户 home 目录")?;
    if !bin.exists() {
        return Err(format!(
            "未找到 officellm，请先安装：{}",
            bin.display()
        ));
    }

    log::info!("[officellm-server] opening: {path}");

    let child = Command::new(&bin)
        .args(["serve", "--stdio", "--input", path])
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .spawn()
        .map_err(|e| format!("启动 officellm serve 失败: {e}"))?;

    *guard = Some(ServerSession {
        child,
        document_path: path.to_string(),
        started_at: Instant::now(),
        next_id: AtomicU64::new(1),
    });

    Ok(())
}

/// 在活跃会话中执行命令
pub fn call(cmd: &str, args: &HashMap<String, String>) -> Result<CommandResult, String> {
    let mut guard = SESSION.lock().map_err(|e| format!("锁获取失败: {e}"))?;
    let session = guard.as_mut().ok_or("无活跃会话，请先调用 open()")?;

    let id = session.next_id.fetch_add(1, Ordering::Relaxed);
    let params = serde_json::json!({ "command": cmd, "args": args });

    let request = JsonRpcRequest {
        jsonrpc: "2.0",
        id,
        method: "execute".to_string(),
        params: Some(params),
    };

    send_request(session, &request)
}

/// 保存当前文档
pub fn save(path: Option<&str>) -> Result<CommandResult, String> {
    let mut guard = SESSION.lock().map_err(|e| format!("锁获取失败: {e}"))?;
    let session = guard.as_mut().ok_or("无活跃会话，请先调用 open()")?;

    let id = session.next_id.fetch_add(1, Ordering::Relaxed);
    let params = path.map(|p| serde_json::json!({ "path": p }));

    let request = JsonRpcRequest {
        jsonrpc: "2.0",
        id,
        method: "save".to_string(),
        params,
    };

    send_request(session, &request)
}

/// 关闭当前会话，终止 officellm serve 进程
pub fn close() -> Result<(), String> {
    let mut guard = SESSION.lock().map_err(|e| format!("锁获取失败: {e}"))?;
    let Some(mut session) = guard.take() else {
        return Ok(()); // 无活跃会话，静默返回
    };

    log::info!("[officellm-server] closing session for: {}", session.document_path);
    let _ = session.child.kill();
    let _ = session.child.wait();
    Ok(())
}

/// 查询当前会话状态
pub fn status() -> Result<Option<SessionInfo>, String> {
    let guard = SESSION.lock().map_err(|e| format!("锁获取失败: {e}"))?;
    let Some(session) = guard.as_ref() else {
        return Ok(None);
    };

    Ok(Some(SessionInfo {
        document_path: session.document_path.clone(),
        pid: session.child.id(),
        uptime_secs: session.started_at.elapsed().as_secs(),
    }))
}

/// 发送 JSON-RPC 请求并读取响应
fn send_request(
    session: &mut ServerSession,
    request: &JsonRpcRequest,
) -> Result<CommandResult, String> {
    let stdin = session.child.stdin.as_mut().ok_or("stdin pipe 不可用")?;
    let stdout = session.child.stdout.as_mut().ok_or("stdout pipe 不可用")?;

    let payload = serde_json::to_string(request).map_err(|e| format!("序列化失败: {e}"))?;
    writeln!(stdin, "{payload}").map_err(|e| format!("写入 stdin 失败: {e}"))?;
    stdin.flush().map_err(|e| format!("flush 失败: {e}"))?;

    let mut reader = BufReader::new(stdout);
    let mut line = String::new();
    reader
        .read_line(&mut line)
        .map_err(|e| format!("读取 stdout 失败: {e}"))?;

    let response: JsonRpcResponse =
        serde_json::from_str(&line).map_err(|e| format!("解析 JSON-RPC 响应失败: {e}"))?;

    if let Some(err) = response.error {
        return Ok(CommandResult {
            status: "error".to_string(),
            data: serde_json::Value::Null,
            error: Some(err.message),
            metrics: None,
        });
    }

    Ok(CommandResult {
        status: "success".to_string(),
        data: response.result.unwrap_or(serde_json::Value::Null),
        error: None,
        metrics: None,
    })
}
