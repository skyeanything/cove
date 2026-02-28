//! Server 模式：管理 `officellm serve --stdio` 进程，JSON-RPC 通信。
//!
//! 并发安全设计：session 始终留在全局 SESSION 中，仅 I/O 句柄 (SessionIO)
//! 被临时取出执行阻塞读写。close() 可随时 kill 子进程，has_session() 始终准确。

use std::io::{BufRead, BufReader, Read, Write};
use std::process::{Child, ChildStdin, ChildStdout, Command, Stdio};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Mutex;
use std::time::{Duration, Instant};

use super::types::{CommandResult, JsonRpcRequest, SessionInfo};

mod parsing;
use parsing::{format_exit_status, parse_response};

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

/// 从子进程 stderr 读取所有已缓冲内容
fn drain_stderr(child: &mut Child) -> String {
    let mut msg = String::new();
    if let Some(mut err) = child.stderr.take() {
        let _ = err.read_to_string(&mut msg);
    }
    msg
}

/// 打开文档并启动 Server 会话
pub fn open(path: &str) -> Result<(), String> {
    let mut guard = SESSION.lock().map_err(|e| format!("锁获取失败: {e}"))?;
    if guard.is_some() {
        return Err("已有活跃会话，请先调用 close() 关闭".to_string());
    }

    let bin = super::detect::bin_path()?;
    let home = super::resolve::external_home()
        .ok_or("无法获取用户 home 目录")?;

    log::info!("[officellm-server] opening: {path}");

    let mut cmd = Command::new(&bin);
    cmd.args(["serve", "--transport", "stdio"])
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    super::env::apply_env(&mut cmd, &home);

    let mut child = cmd
        .spawn()
        .map_err(|e| format!("启动 officellm serve 失败: {e}"))?;

    // 等待 500ms 后检查进程是否已提前退出（如文件不存在、权限错误等）
    std::thread::sleep(Duration::from_millis(500));
    match child.try_wait() {
        Ok(Some(status)) => {
            let msg = drain_stderr(&mut child);
            let exit_info = format_exit_status(&status);
            return Err(format!(
                "officellm serve 启动后立即退出 ({exit_info}){}",
                if msg.is_empty() {
                    String::new()
                } else {
                    format!(": {msg}")
                }
            ));
        }
        Ok(None) => {
            // 进程仍存活，后台 drain stderr 防止缓冲区满阻塞子进程
            if let Some(stderr) = child.stderr.take() {
                std::thread::spawn(move || {
                    let _ = BufReader::new(stderr).read_to_end(&mut Vec::new());
                });
            }
        }
        Err(e) => return Err(format!("检查进程状态失败: {e}")),
    }

    let stdin = child.stdin.take().ok_or("stdin pipe 不可用")?;
    let stdout = child.stdout.take().ok_or("stdout pipe 不可用")?;

    // 发送 JSON-RPC open 请求，在服务进程中打开文档
    let io = SessionIO {
        stdin,
        reader: BufReader::new(stdout),
    };
    let io = send_open_request(io, path).map_err(|e| {
        let _ = child.kill();
        let _ = child.wait();
        e
    })?;

    *guard = Some(ServerSession {
        child,
        io: Some(io),
        document_path: path.to_string(),
        started_at: Instant::now(),
        next_id: AtomicU64::new(2), // id=1 已用于 open 请求
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

/// 发送 JSON-RPC open 请求，打开文档（10s 超时）
fn send_open_request(io: SessionIO, path: &str) -> Result<SessionIO, String> {
    let SessionIO { mut stdin, mut reader } = io;
    let request = JsonRpcRequest {
        jsonrpc: "2.0",
        id: 1,
        method: "open".to_string(),
        params: Some(serde_json::json!({ "path": path })),
    };
    let payload =
        serde_json::to_string(&request).map_err(|e| format!("序列化失败: {e}"))?;
    writeln!(stdin, "{payload}").map_err(|e| format!("发送 open 请求失败: {e}"))?;
    stdin.flush().map_err(|e| format!("flush 失败: {e}"))?;
    let (tx, rx) = std::sync::mpsc::channel();
    std::thread::spawn(move || {
        let mut line = String::new();
        let result = reader.read_line(&mut line);
        let _ = tx.send((reader, line, result));
    });
    let (reader, line, read_result) = rx
        .recv_timeout(Duration::from_secs(10))
        .map_err(|_| "open 响应超时 (10s)".to_string())?;
    read_result.map_err(|e| format!("读取 open 响应失败: {e}"))?;
    let resp: super::types::JsonRpcResponse = serde_json::from_str(&line)
        .map_err(|e| format!("解析 open 响应失败: {e}"))?;
    if let Some(err) = resp.error {
        return Err(format!("open 失败: {}", err.message));
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
