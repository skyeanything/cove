//! Server 模式：管理 `officellm serve --stdio` 进程，JSON-RPC 通信。

use std::collections::HashMap;
use std::io::{BufRead, BufReader, Write};
use std::process::{Child, ChildStdout, Command, Stdio};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Mutex;
use std::time::{Duration, Instant};

use super::detect::default_bin_path;
use super::types::{CommandResult, JsonRpcRequest, JsonRpcResponse, SessionInfo};

const IO_TIMEOUT: Duration = Duration::from_secs(60);

/// 全局 Server 会话管理器（单例）
static SESSION: Mutex<Option<ServerSession>> = Mutex::new(None);

/// 一个活跃的 officellm serve --stdio 会话
struct ServerSession {
    child: Child,
    reader: Option<BufReader<ChildStdout>>,
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
        return Err(format!("未找到 officellm，请先安装：{}", bin.display()));
    }

    log::info!("[officellm-server] opening: {path}");

    let mut child = Command::new(&bin)
        .args(["serve", "--stdio", "--input", path])
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .spawn()
        .map_err(|e| format!("启动 officellm serve 失败: {e}"))?;

    let stdout = child.stdout.take().ok_or("stdout pipe 不可用")?;

    *guard = Some(ServerSession {
        child,
        reader: Some(BufReader::new(stdout)),
        document_path: path.to_string(),
        started_at: Instant::now(),
        next_id: AtomicU64::new(1),
    });

    Ok(())
}

/// 短暂持锁，从全局 SESSION 中取出 session
fn take_session() -> Result<ServerSession, String> {
    SESSION
        .lock()
        .map_err(|e| format!("锁获取失败: {e}"))?
        .take()
        .ok_or_else(|| "无活跃会话，请先调用 open()".to_string())
}

/// 短暂持锁，将 session 放回全局 SESSION
fn return_session(session: ServerSession) {
    if let Ok(mut guard) = SESSION.lock() {
        *guard = Some(session);
    }
}

/// 在活跃会话中执行命令（take-out 模式：不持锁执行 I/O）
pub fn call(cmd: &str, args: &HashMap<String, String>) -> Result<CommandResult, String> {
    let mut session = take_session()?;

    let id = session.next_id.fetch_add(1, Ordering::Relaxed);
    let params = serde_json::json!({ "command": cmd, "args": args });
    let request = JsonRpcRequest {
        jsonrpc: "2.0",
        id,
        method: "execute".to_string(),
        params: Some(params),
    };

    match send_request(&mut session, &request) {
        Ok(result) => {
            return_session(session);
            Ok(result)
        }
        Err(e) => {
            kill_session(session);
            Err(e)
        }
    }
}

/// 保存当前文档（take-out 模式）
pub fn save(path: Option<&str>) -> Result<CommandResult, String> {
    let mut session = take_session()?;

    let id = session.next_id.fetch_add(1, Ordering::Relaxed);
    let params = path.map(|p| serde_json::json!({ "path": p }));
    let request = JsonRpcRequest {
        jsonrpc: "2.0",
        id,
        method: "save".to_string(),
        params,
    };

    match send_request(&mut session, &request) {
        Ok(result) => {
            return_session(session);
            Ok(result)
        }
        Err(e) => {
            kill_session(session);
            Err(e)
        }
    }
}

/// 关闭当前会话，终止 officellm serve 进程
pub fn close() -> Result<(), String> {
    let session = {
        SESSION
            .lock()
            .map_err(|e| format!("锁获取失败: {e}"))?
            .take()
    };
    let Some(session) = session else {
        return Ok(());
    };

    log::info!(
        "[officellm-server] closing session for: {}",
        session.document_path
    );
    kill_session(session);
    Ok(())
}

/// 是否有活跃会话
pub fn has_session() -> bool {
    SESSION.lock().map(|g| g.is_some()).unwrap_or(false)
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

/// kill 子进程并丢弃 session
fn kill_session(mut session: ServerSession) {
    let _ = session.child.kill();
    let _ = session.child.wait();
}

/// 发送 JSON-RPC 请求并读取响应（带 60s 超时）
fn send_request(
    session: &mut ServerSession,
    request: &JsonRpcRequest,
) -> Result<CommandResult, String> {
    let stdin = session.child.stdin.as_mut().ok_or("stdin pipe 不可用")?;

    let payload =
        serde_json::to_string(request).map_err(|e| format!("序列化失败: {e}"))?;
    writeln!(stdin, "{payload}").map_err(|e| format!("写入 stdin 失败: {e}"))?;
    stdin.flush().map_err(|e| format!("flush 失败: {e}"))?;

    // 将 reader 移入线程执行阻塞读取，通过 channel 带超时接收
    let mut reader = session.reader.take().ok_or("reader 不可用")?;
    let (tx, rx) = std::sync::mpsc::channel();

    std::thread::spawn(move || {
        let mut line = String::new();
        let result = reader.read_line(&mut line);
        let _ = tx.send((reader, line, result));
    });

    let (reader, line, read_result) = rx
        .recv_timeout(IO_TIMEOUT)
        .map_err(|_| "读取响应超时 (60s)，会话将被关闭".to_string())?;

    session.reader = Some(reader);

    let bytes_read =
        read_result.map_err(|e| format!("读取 stdout 失败: {e}"))?;
    if bytes_read == 0 {
        return Err("officellm 进程已关闭 stdout".to_string());
    }

    parse_response(&line)
}

/// 解析 JSON-RPC 响应为 CommandResult
fn parse_response(line: &str) -> Result<CommandResult, String> {
    let response: JsonRpcResponse = serde_json::from_str(line)
        .map_err(|e| format!("解析 JSON-RPC 响应失败: {e}"))?;

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
