//! Server 模式：管理 `officellm serve --stdio` 进程，JSON-RPC 通信。
//!
//! 并发安全设计：session 始终留在全局 SESSION 中，仅 I/O 句柄 (SessionIO)
//! 被临时取出执行阻塞读写。close() 可随时 kill 子进程，has_session() 始终准确。

use std::io::{BufRead, BufReader, Write};
use std::process::{Child, ChildStdin, ChildStdout};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Mutex;
use std::time::{Duration, Instant};

use super::types::{CommandResult, JsonRpcRequest, SessionInfo};

mod parsing;
mod spawn;
use parsing::parse_response;

#[cfg(test)]
mod tests;

const IO_TIMEOUT: Duration = Duration::from_secs(60);

/// 全局 Server 会话管理器（单例）
static SESSION: Mutex<Option<ServerSession>> = Mutex::new(None);

/// 一个活跃的 officellm serve --stdio 会话
struct ServerSession {
    child: Child,
    /// I/O 句柄：Idle 时 Some，请求进行中时 None（被临时取出）
    io: Option<SessionIO>,
    document_path: String,
    started_at: Instant,
    next_id: AtomicU64,
}

/// 可独立于 session 进行阻塞 I/O 的句柄
struct SessionIO {
    stdin: ChildStdin,
    reader: BufReader<ChildStdout>,
}

/// 打开文档并启动 Server 会话。
///
/// `home` 应由调用方根据 bundled/external 模式通过 `resolve::resolve_home()` 计算。
pub fn open(path: &str, home: &std::path::Path) -> Result<(), String> {
    let mut guard = SESSION.lock().map_err(|e| format!("锁获取失败: {e}"))?;
    if guard.is_some() {
        return Err("已有活跃会话，请先调用 close() 关闭".to_string());
    }
    log::info!("[officellm-server] opening: {path}");
    let doc_dir = std::path::Path::new(path)
        .parent()
        .unwrap_or(std::path::Path::new("/"));
    let (mut child, io) = spawn::spawn_server(home, doc_dir)?;
    let io = send_init_request(io, "open", serde_json::json!({"path": path}))
        .map_err(|e| { let _ = child.kill(); let _ = child.wait(); e })?;
    *guard = Some(ServerSession {
        child,
        io: Some(io),
        document_path: path.to_string(),
        started_at: Instant::now(),
        next_id: AtomicU64::new(2),
    });
    Ok(())
}

/// 创建内存文档并启动 Server 会话。
///
/// 与 `open()` 的区别：不需要磁盘文件，cwd 设为 workspace root。
/// 支持 `markdown`、`html`、`template` 参数。
pub fn create(
    params: &serde_json::Value,
    home: &std::path::Path,
    workdir: &std::path::Path,
) -> Result<(), String> {
    let mut guard = SESSION.lock().map_err(|e| format!("锁获取失败: {e}"))?;
    if guard.is_some() {
        return Err("已有活跃会话，请先调用 close() 关闭".to_string());
    }
    log::info!("[officellm-server] creating in-memory document");
    let (mut child, io) = spawn::spawn_server(home, workdir)?;
    let io = send_init_request(io, "create", params.clone())
        .map_err(|e| { let _ = child.kill(); let _ = child.wait(); e })?;
    *guard = Some(ServerSession {
        child,
        io: Some(io),
        document_path: String::new(),
        started_at: Instant::now(),
        next_id: AtomicU64::new(2),
    });
    Ok(())
}

/// 短暂持锁：取出 IO 句柄 + 分配请求 ID（session 本身留在全局状态）
fn take_io() -> Result<(SessionIO, u64), String> {
    let mut guard = SESSION.lock().map_err(|e| format!("锁获取失败: {e}"))?;
    let session = guard.as_mut().ok_or("无活跃会话，请先调用 open()")?;
    let io = session
        .io
        .take()
        .ok_or("会话正在处理其他请求，请稍候")?;
    let id = session.next_id.fetch_add(1, Ordering::Relaxed);
    Ok((io, id))
}

/// 短暂持锁：将 IO 句柄放回 session（session 可能已被 close 移除）
fn return_io(io: SessionIO) {
    if let Ok(mut guard) = SESSION.lock() {
        if let Some(session) = guard.as_mut() {
            session.io = Some(io);
        }
    }
}

/// I/O 失败后：kill 子进程并移除 session
fn kill_on_io_error() {
    if let Ok(mut guard) = SESSION.lock() {
        if let Some(mut session) = guard.take() {
            let _ = session.child.kill();
            let _ = session.child.wait();
        }
    }
}

/// 在活跃会话中执行命令
pub fn call(cmd: &str, args: &[String]) -> Result<CommandResult, String> {
    let (io, id) = take_io()?;
    let params = serde_json::json!({ "command": cmd, "args": args });
    let request = JsonRpcRequest {
        jsonrpc: "2.0",
        id,
        method: "call".to_string(),
        params: Some(params),
    };
    match send_request(io, &request) {
        Ok((io, result)) => {
            return_io(io);
            Ok(result)
        }
        Err(e) => {
            kill_on_io_error();
            Err(e)
        }
    }
}

/// 保存当前文档
pub fn save(path: Option<&str>) -> Result<CommandResult, String> {
    let (io, id) = take_io()?;
    let params = path.map(|p| serde_json::json!({ "path": p }));
    let request = JsonRpcRequest {
        jsonrpc: "2.0",
        id,
        method: "save".to_string(),
        params,
    };
    match send_request(io, &request) {
        Ok((io, result)) => {
            return_io(io);
            Ok(result)
        }
        Err(e) => {
            kill_on_io_error();
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
    let Some(mut session) = session else {
        return Ok(());
    };
    log::info!(
        "[officellm-server] closing session for: {}",
        session.document_path
    );
    let _ = session.child.kill();
    let _ = session.child.wait();
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

/// 发送 JSON-RPC 初始化请求（open/create），10s 超时
fn send_init_request(
    io: SessionIO,
    method: &str,
    params: serde_json::Value,
) -> Result<SessionIO, String> {
    let SessionIO { mut stdin, mut reader } = io;
    let request = JsonRpcRequest {
        jsonrpc: "2.0",
        id: 1,
        method: method.to_string(),
        params: Some(params),
    };
    let payload =
        serde_json::to_string(&request).map_err(|e| format!("序列化失败: {e}"))?;
    writeln!(stdin, "{payload}")
        .map_err(|e| format!("发送 {method} 请求失败: {e}"))?;
    stdin.flush().map_err(|e| format!("flush 失败: {e}"))?;
    let (tx, rx) = std::sync::mpsc::channel();
    std::thread::spawn(move || {
        let mut line = String::new();
        let result = reader.read_line(&mut line);
        let _ = tx.send((reader, line, result));
    });
    let (reader, line, read_result) = rx
        .recv_timeout(Duration::from_secs(10))
        .map_err(|_| format!("{method} 响应超时 (10s)"))?;
    read_result.map_err(|e| format!("读取 {method} 响应失败: {e}"))?;
    let resp: super::types::JsonRpcResponse = serde_json::from_str(&line)
        .map_err(|e| format!("解析 {method} 响应失败: {e}"))?;
    if let Some(err) = resp.error {
        return Err(format!("{method} 失败: {}", err.message));
    }
    Ok(SessionIO { stdin, reader })
}

/// 发送 JSON-RPC 请求并读取响应（带 60s 超时）。
/// 拥有 IO 句柄所有权：成功时归还，超时时句柄留在读线程中（由 kill 关闭 pipe 回收）。
fn send_request(
    io: SessionIO, request: &JsonRpcRequest,
) -> Result<(SessionIO, CommandResult), String> {
    let SessionIO { mut stdin, mut reader } = io;
    let payload = serde_json::to_string(request)
        .map_err(|e| format!("序列化失败: {e}"))?;
    writeln!(stdin, "{payload}").map_err(|e| format!("写入 stdin 失败: {e}"))?;
    stdin.flush().map_err(|e| format!("flush 失败: {e}"))?;

    let (tx, rx) = std::sync::mpsc::channel();
    std::thread::spawn(move || {
        let mut line = String::new();
        let result = reader.read_line(&mut line);
        let _ = tx.send((reader, line, result));
    });
    let (reader, line, read_result) = rx
        .recv_timeout(IO_TIMEOUT)
        .map_err(|_| "读取响应超时 (60s)，会话将被关闭".to_string())?;
    let bytes_read = read_result.map_err(|e| format!("读取 stdout 失败: {e}"))?;
    if bytes_read == 0 {
        return Err("officellm 进程已关闭 stdout".to_string());
    }
    let result = parse_response(&line)?;
    Ok((SessionIO { stdin, reader }, result))
}
