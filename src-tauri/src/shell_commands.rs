//! 在工作区内执行 shell 命令，供 bash 前端工具调用。

use std::io::Read;
use std::process::{Command, Stdio};
use std::thread;
use std::time::Duration;

use serde::{Deserialize, Serialize};

use crate::fs_commands::ensure_inside_workspace_exists;
use crate::sandbox;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RunCommandResult {
    pub stdout: String,
    pub stderr: String,
    pub exit_code: i32,
    pub timed_out: bool,
    pub sandboxed: bool,
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

    // 将 ~/.local/bin 等常用工具目录追加到 PATH，
    // 因为 sh -c 不加载用户 shell profile。
    // 注：officellm 现通过专属 officellm 模块调用，不再注入 PATH。
    let extra_paths: Vec<std::path::PathBuf> = dirs::home_dir()
        .into_iter()
        .flat_map(|home| [home.join(".local/bin")])
        .filter(|p| p.is_dir())
        .collect();
    let path_env = if extra_paths.is_empty() {
        std::env::var("PATH").unwrap_or_default()
    } else {
        let extra: Vec<String> = extra_paths.iter().map(|p| p.to_string_lossy().into_owned()).collect();
        let current = std::env::var("PATH").unwrap_or_default();
        format!("{}:{current}", extra.join(":"))
    };

    // 尝试沙箱化执行
    let mut policy = sandbox::load_policy();
    // officellm tmp dir 始终加入白名单，由 cove 内部管理
    policy.allow_write.push(
        crate::officellm::env::tmp_dir().to_string_lossy().into_owned(),
    );
    let sandbox_cmd = sandbox::build_sandbox_command(&args.command, &args.workspace_root, &policy);

    let (mut child, sandboxed) = if let Some((program, sb_args)) = sandbox_cmd {
        match Command::new(&program)
            .args(&sb_args)
            .current_dir(&workdir_path)
            .env("PATH", &path_env)
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .stdin(Stdio::null())
            .spawn()
        {
            Ok(c) => (c, true),
            Err(_) => {
                // 沙箱命令执行失败（如 sandbox-exec 不可用），fallback 到非沙箱
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
                sandboxed,
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
        sandboxed,
    })
}

fn spawn_plain_command(
    cmd: &str,
    workdir: &str,
    path_env: &str,
) -> std::io::Result<std::process::Child> {
    #[cfg(unix)]
    let (shell, shell_arg) = ("sh", "-c");
    #[cfg(windows)]
    let (shell, shell_arg) = ("cmd", "/c");

    Command::new(shell)
        .arg(shell_arg)
        .arg(cmd)
        .current_dir(workdir)
        .env("PATH", path_env)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .stdin(Stdio::null())
        .spawn()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::test_util::with_home;

    #[test]
    fn args_deserialize_camel_case() {
        let json = r#"{"workspaceRoot":"/tmp","command":"echo hi","workdir":"sub","timeoutMs":5000}"#;
        let args: RunCommandArgs = serde_json::from_str(json).unwrap();
        assert_eq!(args.workspace_root, "/tmp");
        assert_eq!(args.command, "echo hi");
        assert_eq!(args.workdir.as_deref(), Some("sub"));
        assert_eq!(args.timeout_ms, Some(5000));
    }

    #[test]
    fn args_defaults_for_optional_fields() {
        let json = r#"{"workspaceRoot":"/tmp","command":"echo"}"#;
        let args: RunCommandArgs = serde_json::from_str(json).unwrap();
        assert!(args.workdir.is_none());
        assert!(args.timeout_ms.is_none());
    }

    #[test]
    fn result_serializes_camel_case() {
        let r = RunCommandResult {
            stdout: String::new(),
            stderr: String::new(),
            exit_code: 0,
            timed_out: false,
            sandboxed: true,
        };
        let json = serde_json::to_string(&r).unwrap();
        assert!(json.contains("exitCode"));
        assert!(json.contains("timedOut"));
        assert!(json.contains("sandboxed"));
        assert!(!json.contains("exit_code"));
        assert!(!json.contains("timed_out"));
    }

    #[cfg(unix)]
    #[test]
    fn echo_captures_stdout() {
        with_home(|_| {
            let dir = tempfile::tempdir().unwrap();
            let root = dir.path().canonicalize().unwrap();
            let r = run_command(RunCommandArgs {
                workspace_root: root.to_str().unwrap().to_string(),
                command: "echo hello".into(),
                workdir: None,
                timeout_ms: Some(10_000),
            })
            .unwrap();
            assert_eq!(r.exit_code, 0);
            assert_eq!(r.stdout.trim(), "hello");
            assert!(!r.timed_out);
        });
    }

    #[cfg(unix)]
    #[test]
    fn stderr_captured() {
        with_home(|_| {
            let dir = tempfile::tempdir().unwrap();
            let root = dir.path().canonicalize().unwrap();
            let r = run_command(RunCommandArgs {
                workspace_root: root.to_str().unwrap().to_string(),
                command: "echo err >&2".into(),
                workdir: None,
                timeout_ms: Some(10_000),
            })
            .unwrap();
            assert!(r.stderr.contains("err"));
        });
    }

    #[cfg(unix)]
    #[test]
    fn exit_code_nonzero() {
        with_home(|_| {
            let dir = tempfile::tempdir().unwrap();
            let root = dir.path().canonicalize().unwrap();
            let r = run_command(RunCommandArgs {
                workspace_root: root.to_str().unwrap().to_string(),
                command: "exit 42".into(),
                workdir: None,
                timeout_ms: Some(10_000),
            })
            .unwrap();
            assert_eq!(r.exit_code, 42);
        });
    }

    #[cfg(unix)]
    #[test]
    fn timeout_kills_long_command() {
        with_home(|_| {
            let dir = tempfile::tempdir().unwrap();
            let root = dir.path().canonicalize().unwrap();
            let r = run_command(RunCommandArgs {
                workspace_root: root.to_str().unwrap().to_string(),
                command: "sleep 60".into(),
                workdir: None,
                timeout_ms: Some(500),
            })
            .unwrap();
            assert!(r.timed_out);
            assert_eq!(r.exit_code, -1);
        });
    }

    #[cfg(unix)]
    #[test]
    fn workdir_outside_workspace_rejected() {
        with_home(|_| {
            let dir = tempfile::tempdir().unwrap();
            let root = dir.path().canonicalize().unwrap();
            let r = run_command(RunCommandArgs {
                workspace_root: root.to_str().unwrap().to_string(),
                command: "pwd".into(),
                workdir: Some("/tmp".into()),
                timeout_ms: Some(5_000),
            });
            assert!(r.is_err());
        });
    }

    #[cfg(unix)]
    #[test]
    fn default_workdir_is_workspace_root() {
        with_home(|_| {
            let dir = tempfile::tempdir().unwrap();
            let root = dir.path().canonicalize().unwrap();
            let r = run_command(RunCommandArgs {
                workspace_root: root.to_str().unwrap().to_string(),
                command: "pwd".into(),
                workdir: None,
                timeout_ms: Some(10_000),
            })
            .unwrap();
            assert_eq!(r.stdout.trim(), root.to_str().unwrap());
        });
    }
}
