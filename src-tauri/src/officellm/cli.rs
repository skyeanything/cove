//! CLI 模式：spawn officellm 进程，传 --result-schema v2 --strict，解析 JSON 返回。

use std::path::Path;
use std::process::Command;
use std::time::Duration;

use super::types::CommandResult;

/// 默认 CLI 命令超时（秒）
const DEFAULT_TIMEOUT_SECS: u64 = 120;

/// CLI 模式执行 officellm 命令。
///
/// `home` 应由调用方根据 bundled/external 模式通过 `resolve::resolve_home()` 计算。
/// 等价于：`officellm <cmd> --result-schema v2 --strict [--key value ...]`
/// 解析 stdout JSON 并返回 `CommandResult`。
pub fn call(
    cmd: &str,
    args: &[String],
    home: &Path,
    workdir: &Path,
) -> Result<CommandResult, String> {
    super::init::wait_for_init();

    let bin = super::detect::bin_path()?;

    let mut command = Command::new(&bin);
    command.arg(cmd);
    command.args(["--result-schema", "v2", "--strict"]);

    for arg in args {
        command.arg(arg);
    }

    super::env::apply_env(&mut command, home);
    command.current_dir(workdir);

    command.stdout(std::process::Stdio::piped());
    command.stderr(std::process::Stdio::piped());
    command.stdin(std::process::Stdio::null());

    log::info!("[officellm-cli] running: {cmd} with {} args", args.len());

    let mut child = command
        .spawn()
        .map_err(|e| format!("启动 officellm 失败: {e}"))?;

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

    if let Some(result) = parse_result_json(&stdout).or_else(|| parse_result_json(&stderr)) {
        return Ok(result);
    }

    if !success {
        let error = if stderr.trim().is_empty() {
            stdout.trim().to_string()
        } else {
            stderr.trim().to_string()
        };
        return Ok(CommandResult::from_error_message(error));
    }

    Ok(CommandResult::from_plain_text(stdout))
}

fn parse_result_json(raw: &str) -> Option<CommandResult> {
    let trimmed = raw.trim();
    if trimmed.is_empty() {
        return None;
    }
    serde_json::from_str::<CommandResult>(trimmed)
        .ok()
        .map(CommandResult::with_error_fallback)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::test_util::with_home_and_path_cleared;

    #[test]
    fn call_errors_when_binary_not_found() {
        with_home_and_path_cleared(|home| {
            let err = call("test", &[], home, home).unwrap_err();
            assert!(
                err.contains("未找到 officellm"),
                "expected '未找到 officellm' in error, got: {err}"
            );
        });
    }

    #[cfg(unix)]
    #[test]
    fn parse_output_json_success() {
        let mut child = std::process::Command::new("sh")
            .args(["-c", r#"echo '{"status":"success","data":"ok"}'"#])
            .stdout(std::process::Stdio::piped())
            .stderr(std::process::Stdio::piped())
            .spawn()
            .unwrap();
        let _ = child.wait();
        let r = parse_output(&mut child, true).unwrap();
        assert_eq!(r.status, "success");
        assert_eq!(r.data, serde_json::json!("ok"));
    }

    #[cfg(unix)]
    #[test]
    fn parse_output_plain_text_wrapped() {
        let mut child = std::process::Command::new("sh")
            .args(["-c", "echo 'plain text'"])
            .stdout(std::process::Stdio::piped())
            .stderr(std::process::Stdio::piped())
            .spawn()
            .unwrap();
        let _ = child.wait();
        let r = parse_output(&mut child, true).unwrap();
        assert_eq!(r.status, "success");
        assert!(r.data.is_string());
        assert!(r.data.as_str().unwrap().contains("plain text"));
    }

    #[cfg(unix)]
    #[test]
    fn parse_output_failure_json_is_preserved() {
        let mut child = std::process::Command::new("sh")
            .args([
                "-c",
                r#"echo '{"status":"failure","code":"COMMAND_NOT_FOUND","message":"missing","errors":[{"message":"missing","suggestions":["list-commands"]}]}' ; exit 1"#,
            ])
            .stdout(std::process::Stdio::piped())
            .stderr(std::process::Stdio::piped())
            .spawn()
            .unwrap();
        let _ = child.wait();
        let r = parse_output(&mut child, false).unwrap();
        assert_eq!(r.status, "failure");
        assert_eq!(r.code.as_deref(), Some("COMMAND_NOT_FOUND"));
        assert_eq!(r.message.as_deref(), Some("missing"));
        assert_eq!(r.error.as_deref(), Some("missing"));
        assert_eq!(r.errors[0].suggestions, vec!["list-commands"]);
    }

    #[cfg(unix)]
    #[test]
    fn parse_output_failure_prefers_stderr() {
        let mut child = std::process::Command::new("sh")
            .args(["-c", "echo err >&2; exit 1"])
            .stdout(std::process::Stdio::piped())
            .stderr(std::process::Stdio::piped())
            .spawn()
            .unwrap();
        let _ = child.wait();
        let r = parse_output(&mut child, false).unwrap();
        assert_eq!(r.status, "error");
        assert!(r.error.as_deref().unwrap().contains("err"));
    }

    #[cfg(unix)]
    #[test]
    fn parse_output_failure_falls_back_to_stdout() {
        let mut child = std::process::Command::new("sh")
            .args(["-c", "echo out; exit 1"])
            .stdout(std::process::Stdio::piped())
            .stderr(std::process::Stdio::piped())
            .spawn()
            .unwrap();
        let _ = child.wait();
        let r = parse_output(&mut child, false).unwrap();
        assert_eq!(r.status, "error");
        assert!(r.error.as_deref().unwrap().contains("out"));
    }
}
