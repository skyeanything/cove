//! Shared server process spawning logic.
//!
//! Extracts the common `officellm serve --stdio` startup sequence
//! used by both `open()` and `create()`.

use std::io::{BufReader, Read};
use std::process::{Child, Command, Stdio};
use std::time::Duration;

use super::parsing::format_exit_status;
use super::SessionIO;

/// Read all buffered content from a child's stderr.
fn drain_stderr(child: &mut Child) -> String {
    let mut msg = String::new();
    if let Some(mut err) = child.stderr.take() {
        let _ = err.read_to_string(&mut msg);
    }
    msg
}

/// Spawn an `officellm serve --stdio` process and return the child + IO handles.
///
/// Waits 500ms after spawn to detect early exits (missing files, permission errors).
/// On success, stderr is drained in a background thread to prevent buffer deadlock.
pub(super) fn spawn_server(
    home: &std::path::Path,
    cwd: &std::path::Path,
) -> Result<(Child, SessionIO), String> {
    crate::officellm::init::wait_for_init();
    let bin = crate::officellm::detect::bin_path()?;

    let mut cmd = Command::new(&bin);
    cmd.args(["serve", "--transport", "stdio"])
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    crate::officellm::env::apply_env(&mut cmd, home);
    cmd.current_dir(cwd);

    let mut child = cmd
        .spawn()
        .map_err(|e| format!("启动 officellm serve 失败: {e}"))?;

    // Wait 500ms then check if process exited early
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
            // Process alive — drain stderr in background to prevent buffer fill
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
    let io = SessionIO {
        stdin,
        reader: BufReader::new(stdout),
    };
    Ok((child, io))
}
