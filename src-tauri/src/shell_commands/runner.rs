//! Core execution: spawn, poll, kill, drain for shell commands.

use std::io::Read;
use std::process::{Command, Stdio};
use std::sync::mpsc;
use std::thread;
use std::time::Duration;

use crate::fs_commands::ensure_inside_workspace_exists;
use crate::sandbox;

use super::cancel::CancelToken;
use super::RunCommandArgs;
use super::RunCommandResult;

const DRAIN_TIMEOUT: Duration = Duration::from_secs(3);

/// Execute a shell command with timeout and cancel support.
pub fn execute(args: &RunCommandArgs, cancel: Option<CancelToken>) -> Result<RunCommandResult, String> {
    let workdir = args.workdir.as_deref().unwrap_or(".");
    let abs = ensure_inside_workspace_exists(&args.workspace_root, workdir)
        .map_err(|e| format!("{:?}", e))?;
    let workdir_path = abs.to_string_lossy().to_string();

    let timeout_ms = args.timeout_ms.unwrap_or(120_000).min(600_000);
    let timeout = Duration::from_millis(timeout_ms);

    let path_env = build_path_env();

    let mut policy = sandbox::load_policy();
    policy.allow_write.extend(crate::officellm::env::sandbox_temp_whitelist());
    let sandbox_cmd = sandbox::build_sandbox_command(&args.command, &args.workspace_root, &policy);

    let (mut child, sandboxed) = if let Some((program, sb_args)) = sandbox_cmd {
        match spawn_command_with_pgid(&program, &sb_args, &workdir_path, &path_env) {
            Ok(c) => (c, true),
            Err(_) => {
                let c = spawn_plain_command(&args.command, &workdir_path, &path_env)
                    .map_err(|e| e.to_string())?;
                (c, false)
            }
        }
    } else {
        let c = spawn_plain_command(&args.command, &workdir_path, &path_env)
            .map_err(|e| e.to_string())?;
        (c, false)
    };

    let pid = child.id();
    let stdout = child.stdout.take().ok_or("stdout pipe")?;
    let stderr = child.stderr.take().ok_or("stderr pipe")?;

    // Timeout timer
    let (tx, rx) = mpsc::channel();
    thread::spawn(move || {
        thread::sleep(timeout);
        let _ = tx.send(());
    });

    // Poll loop: check exit, timeout, and cancel
    let mut cancelled = false;
    loop {
        if let Ok(Some(status)) = child.try_wait() {
            let (out, err) = drain_pipes_with_timeout(stdout, stderr);
            return Ok(RunCommandResult {
                stdout: out,
                stderr: err,
                exit_code: status.code().unwrap_or(-1),
                timed_out: false,
                cancelled: false,
                sandboxed,
            });
        }
        if rx.try_recv().is_ok() {
            break;
        }
        if let Some(ref ct) = cancel {
            if ct.is_cancelled() {
                cancelled = true;
                break;
            }
        }
        thread::sleep(Duration::from_millis(50));
    }

    // Kill the entire process group, then the child directly as fallback
    kill_process_group(pid);
    let _ = child.kill();
    let _ = child.wait();

    let (out, err) = drain_pipes_with_timeout(stdout, stderr);
    Ok(RunCommandResult {
        stdout: out,
        stderr: err,
        exit_code: -1,
        timed_out: !cancelled,
        cancelled,
        sandboxed,
    })
}

/// Build PATH with ~/.local/bin prepended.
fn build_path_env() -> String {
    let extra_paths: Vec<std::path::PathBuf> = dirs::home_dir()
        .into_iter()
        .flat_map(|home| [home.join(".local/bin")])
        .filter(|p| p.is_dir())
        .collect();
    if extra_paths.is_empty() {
        std::env::var("PATH").unwrap_or_default()
    } else {
        let extra: Vec<String> = extra_paths.iter().map(|p| p.to_string_lossy().into_owned()).collect();
        let current = std::env::var("PATH").unwrap_or_default();
        format!("{}:{current}", extra.join(":"))
    }
}

/// Spawn a plain shell command in its own process group (Unix).
fn spawn_plain_command(
    cmd: &str,
    workdir: &str,
    path_env: &str,
) -> std::io::Result<std::process::Child> {
    #[cfg(unix)]
    let (shell, shell_arg) = ("sh", "-c");
    #[cfg(windows)]
    let (shell, shell_arg) = ("cmd", "/c");

    let mut command = Command::new(shell);
    command
        .arg(shell_arg)
        .arg(cmd)
        .current_dir(workdir)
        .env("PATH", path_env)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .stdin(Stdio::null());

    #[cfg(unix)]
    {
        use std::os::unix::process::CommandExt;
        unsafe {
            command.pre_exec(|| {
                libc::setsid();
                Ok(())
            });
        }
    }

    command.spawn()
}

/// Spawn a sandboxed command in its own process group (Unix).
fn spawn_command_with_pgid(
    program: &str,
    sb_args: &[String],
    workdir: &str,
    path_env: &str,
) -> std::io::Result<std::process::Child> {
    let mut command = Command::new(program);
    command
        .args(sb_args)
        .current_dir(workdir)
        .env("PATH", path_env)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .stdin(Stdio::null());

    #[cfg(unix)]
    {
        use std::os::unix::process::CommandExt;
        unsafe {
            command.pre_exec(|| {
                libc::setsid();
                Ok(())
            });
        }
    }

    command.spawn()
}

/// Kill an entire process group via SIGKILL (Unix).
#[cfg(unix)]
fn kill_process_group(pid: u32) {
    unsafe {
        libc::killpg(pid as libc::pid_t, libc::SIGKILL);
    }
}

#[cfg(not(unix))]
fn kill_process_group(_pid: u32) {
    // On non-Unix platforms, rely on child.kill() fallback.
}

/// Drain stdout/stderr pipes with a timeout to avoid blocking forever.
fn drain_pipes_with_timeout(
    mut stdout: impl Read + Send + 'static,
    mut stderr: impl Read + Send + 'static,
) -> (String, String) {
    let (tx_out, rx_out) = mpsc::channel();
    let (tx_err, rx_err) = mpsc::channel();

    thread::spawn(move || {
        let mut buf = String::new();
        let _ = stdout.read_to_string(&mut buf);
        let _ = tx_out.send(buf);
    });

    thread::spawn(move || {
        let mut buf = String::new();
        let _ = stderr.read_to_string(&mut buf);
        let _ = tx_err.send(buf);
    });

    let out = rx_out.recv_timeout(DRAIN_TIMEOUT).unwrap_or_default();
    let err = rx_err.recv_timeout(DRAIN_TIMEOUT).unwrap_or_default();
    (out, err)
}
