//! CLI 模式：spawn officellm 进程，传 --result-schema v2 --strict，解析 JSON 返回。

use std::process::Command;
use std::time::Duration;

use super::detect::default_bin_path;
use super::types::CommandResult;

/// 默认 CLI 命令超时（秒）
const DEFAULT_TIMEOUT_SECS: u64 = 120;

/// CLI 模式执行 officellm 命令。
///
/// 等价于：`officellm <cmd> --result-schema v2 --strict [--key value ...]`
/// 解析 stdout JSON 并返回 `CommandResult`。
pub fn call(cmd: &str, args: &[String]) -> Result<CommandResult, String> {
    let bin = default_bin_path().ok_or("无法获取用户 home 目录")?;
    if !bin.exists() {
        return Err(format!(
            "未找到 officellm，请先安装：{}\n可访问 https://github.com/nicepkg/officellm 了解详情",
            bin.display()
        ));
    }

    let mut command = Command::new(&bin);
    command.arg(cmd);
    command.args(["--result-schema", "v2", "--strict"]);

    for arg in args {
        command.arg(arg);
    }

    let tmp_dir = dirs::home_dir()
        .map(|h| h.join(".officellm/tmp"))
        .unwrap_or_else(|| std::path::PathBuf::from("/tmp"));
    let _ = std::fs::create_dir_all(&tmp_dir);
    command.env("TMPDIR", &tmp_dir)
           .env("TEMP", &tmp_dir)
           .env("TMP", &tmp_dir);

    command.stdout(std::process::Stdio::piped());
    command.stderr(std::process::Stdio::piped());
    command.stdin(std::process::Stdio::null());

    log::info!("[officellm-cli] running: {cmd} with {} args", args.len());

    let mut child = command.spawn().map_err(|e| format!("启动 officellm 失败: {e}"))?;

    // 超时处理
    let timeout = Duration::from_secs(DEFAULT_TIMEOUT_SECS);
    let (tx, rx) = std::sync::mpsc::channel();
    std::thread::spawn(move || {
        std::thread::sleep(timeout);
        let _ = tx.send(());
    });

    loop {
        if let Ok(Some(status)) = child.try_wait() {
            return parse_output(&mut child, status.success());
        }
        if rx.try_recv().is_ok() {
            let _ = child.kill();
            let _ = child.wait();
            return Err("officellm 命令执行超时（120 秒）".to_string());
        }
        std::thread::sleep(Duration::from_millis(50));
    }
}

/// 解析子进程输出为 CommandResult
fn parse_output(child: &mut std::process::Child, success: bool) -> Result<CommandResult, String> {
    use std::io::Read;

    let mut stdout = String::new();
    if let Some(ref mut out) = child.stdout {
        let _ = out.read_to_string(&mut stdout);
    }
    let mut stderr = String::new();
    if let Some(ref mut err) = child.stderr {
        let _ = err.read_to_string(&mut stderr);
    }

    if !success {
        return Ok(CommandResult {
            status: "error".to_string(),
            data: serde_json::Value::Null,
            error: Some(if stderr.is_empty() { stdout } else { stderr }),
            metrics: None,
        });
    }

    // 尝试解析 V2 JSON 结果
    match serde_json::from_str::<CommandResult>(&stdout) {
        Ok(result) => Ok(result),
        Err(_) => {
            // 非 JSON 输出时包装为纯文本
            Ok(CommandResult {
                status: "success".to_string(),
                data: serde_json::Value::String(stdout),
                error: None,
                metrics: None,
            })
        }
    }
}
