//! 在工作区内执行 shell 命令，供 bash 前端工具调用。

use std::io::Read;
use std::process::{Command, Stdio};
use std::thread;
use std::time::Duration;

use serde::{Deserialize, Serialize};

use crate::fs_commands::ensure_inside_workspace_exists;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RunCommandResult {
    pub stdout: String,
    pub stderr: String,
    pub exit_code: i32,
    pub timed_out: bool,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RunCommandArgs {
    pub workspace_root: String,
    pub command: String,
    #[serde(default)]
    pub workdir: Option<String>,
    #[serde(default)]
    pub timeout_ms: Option<u64>,
}

#[tauri::command]
pub fn run_command(args: RunCommandArgs) -> Result<RunCommandResult, String> {
    let workdir = args.workdir.as_deref().unwrap_or(".");
    let abs = ensure_inside_workspace_exists(&args.workspace_root, workdir).map_err(|e| format!("{:?}", e))?;
    let workdir_path = abs.to_string_lossy().to_string();

    let timeout_ms = args.timeout_ms.unwrap_or(120_000).min(600_000);
    let timeout = Duration::from_millis(timeout_ms);

    #[cfg(unix)]
    let (shell, shell_arg) = ("sh", "-c");
    #[cfg(windows)]
    let (shell, shell_arg) = ("cmd", "/c");

    let mut child = Command::new(shell)
        .arg(shell_arg)
        .arg(&args.command)
        .current_dir(&workdir_path)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .stdin(Stdio::null())
        .spawn()
        .map_err(|e| e.to_string())?;

    let mut stdout = child.stdout.take().ok_or("stdout pipe")?;
    let mut stderr = child.stderr.take().ok_or("stderr pipe")?;

    let (tx, rx) = std::sync::mpsc::channel();
    thread::spawn(move || {
        thread::sleep(timeout);
        let _ = tx.send(());
    });

    loop {
        if let Ok(Some(status)) = child.try_wait() {
            let mut stdout_str = String::new();
            let _ = stdout.read_to_string(&mut stdout_str);
            let mut stderr_str = String::new();
            let _ = stderr.read_to_string(&mut stderr_str);
            let exit_code = status.code().unwrap_or(-1);
            return Ok(RunCommandResult {
                stdout: stdout_str,
                stderr: stderr_str,
                exit_code,
                timed_out: false,
            });
        }
        if rx.try_recv().is_ok() {
            break;
        }
        thread::sleep(Duration::from_millis(50));
    }

    let _ = child.kill();
    let _ = child.wait();
    let mut out = String::new();
    let _ = stdout.read_to_string(&mut out);
    let mut err = String::new();
    let _ = stderr.read_to_string(&mut err);
    Ok(RunCommandResult {
        stdout: out,
        stderr: err,
        exit_code: -1,
        timed_out: true,
    })
}
