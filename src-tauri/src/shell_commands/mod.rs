//! Shell command execution with cancel support for the bash frontend tool.

mod cancel;
mod runner;

pub use cancel::CancelRegistry;

use std::sync::Arc;
use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RunCommandResult {
    pub stdout: String,
    pub stderr: String,
    pub exit_code: i32,
    pub timed_out: bool,
    pub cancelled: bool,
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
    #[serde(default)]
    pub cancel_token: Option<String>,
}

#[tauri::command]
pub async fn run_command(
    args: RunCommandArgs,
    state: tauri::State<'_, Arc<CancelRegistry>>,
) -> Result<RunCommandResult, String> {
    let token = args.cancel_token.as_deref().map(|key| state.register(key));
    let token_key = args.cancel_token.clone();
    let registry = Arc::clone(&state);

    let result = tauri::async_runtime::spawn_blocking(move || {
        runner::execute(&args, token)
    })
    .await
    .map_err(|e| format!("task join error: {e}"))?;

    if let Some(key) = token_key {
        registry.remove(&key);
    }
    result
}

#[tauri::command]
pub fn cancel_command(
    token: String,
    state: tauri::State<'_, Arc<CancelRegistry>>,
) -> bool {
    state.cancel(&token)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn args_deserialize_camel_case() {
        let json = r#"{"workspaceRoot":"/tmp","command":"echo hi","workdir":"sub","timeoutMs":5000}"#;
        let args: RunCommandArgs = serde_json::from_str(json).unwrap();
        assert_eq!(args.workspace_root, "/tmp");
        assert_eq!(args.command, "echo hi");
        assert_eq!(args.workdir.as_deref(), Some("sub"));
        assert_eq!(args.timeout_ms, Some(5000));
        assert!(args.cancel_token.is_none());
    }

    #[test]
    fn args_defaults_for_optional_fields() {
        let json = r#"{"workspaceRoot":"/tmp","command":"echo"}"#;
        let args: RunCommandArgs = serde_json::from_str(json).unwrap();
        assert!(args.workdir.is_none());
        assert!(args.timeout_ms.is_none());
        assert!(args.cancel_token.is_none());
    }

    #[test]
    fn args_with_cancel_token() {
        let json = r#"{"workspaceRoot":"/tmp","command":"sleep 60","cancelToken":"abc-123"}"#;
        let args: RunCommandArgs = serde_json::from_str(json).unwrap();
        assert_eq!(args.cancel_token.as_deref(), Some("abc-123"));
    }

    #[test]
    fn result_serializes_camel_case() {
        let r = RunCommandResult {
            stdout: String::new(),
            stderr: String::new(),
            exit_code: 0,
            timed_out: false,
            cancelled: false,
            sandboxed: true,
        };
        let json = serde_json::to_string(&r).unwrap();
        assert!(json.contains("exitCode"));
        assert!(json.contains("timedOut"));
        assert!(json.contains("cancelled"));
        assert!(json.contains("sandboxed"));
        assert!(!json.contains("exit_code"));
        assert!(!json.contains("timed_out"));
    }

    #[test]
    fn cancel_registry_register_and_cancel() {
        let reg = CancelRegistry::new();
        let token = reg.register("test-1");
        assert!(!token.is_cancelled());
        assert!(reg.cancel("test-1"));
        assert!(token.is_cancelled());
    }

    #[test]
    fn cancel_registry_missing_key_returns_false() {
        let reg = CancelRegistry::new();
        assert!(!reg.cancel("nonexistent"));
    }

    #[test]
    fn cancel_registry_remove() {
        let reg = CancelRegistry::new();
        let _token = reg.register("rm-1");
        reg.remove("rm-1");
        assert!(!reg.cancel("rm-1"));
    }

    // ── Integration tests (Unix only) ──────────────────────────────

    #[cfg(unix)]
    mod integration {
        use super::super::*;
        use crate::test_util::with_home;

        fn run(args: RunCommandArgs) -> Result<RunCommandResult, String> {
            runner::execute(&args, None)
        }

        #[test]
        fn echo_captures_stdout() {
            with_home(|_| {
                let dir = tempfile::tempdir().unwrap();
                let root = dir.path().canonicalize().unwrap();
                let r = run(RunCommandArgs {
                    workspace_root: root.to_str().unwrap().to_string(),
                    command: "echo hello".into(),
                    workdir: None,
                    timeout_ms: Some(10_000),
                    cancel_token: None,
                }).unwrap();
                assert_eq!(r.exit_code, 0);
                assert_eq!(r.stdout.trim(), "hello");
                assert!(!r.timed_out);
                assert!(!r.cancelled);
            });
        }

        #[test]
        fn stderr_captured() {
            with_home(|_| {
                let dir = tempfile::tempdir().unwrap();
                let root = dir.path().canonicalize().unwrap();
                let r = run(RunCommandArgs {
                    workspace_root: root.to_str().unwrap().to_string(),
                    command: "echo err >&2".into(),
                    workdir: None,
                    timeout_ms: Some(10_000),
                    cancel_token: None,
                }).unwrap();
                assert!(r.stderr.contains("err"));
            });
        }

        #[test]
        fn exit_code_nonzero() {
            with_home(|_| {
                let dir = tempfile::tempdir().unwrap();
                let root = dir.path().canonicalize().unwrap();
                let r = run(RunCommandArgs {
                    workspace_root: root.to_str().unwrap().to_string(),
                    command: "exit 42".into(),
                    workdir: None,
                    timeout_ms: Some(10_000),
                    cancel_token: None,
                }).unwrap();
                assert_eq!(r.exit_code, 42);
            });
        }

        #[test]
        fn timeout_kills_long_command() {
            with_home(|_| {
                let dir = tempfile::tempdir().unwrap();
                let root = dir.path().canonicalize().unwrap();
                let r = run(RunCommandArgs {
                    workspace_root: root.to_str().unwrap().to_string(),
                    command: "sleep 60".into(),
                    workdir: None,
                    timeout_ms: Some(500),
                    cancel_token: None,
                }).unwrap();
                assert!(r.timed_out);
                assert!(!r.cancelled);
                assert_eq!(r.exit_code, -1);
            });
        }

        #[test]
        fn workdir_outside_workspace_rejected() {
            with_home(|_| {
                let dir = tempfile::tempdir().unwrap();
                let root = dir.path().canonicalize().unwrap();
                let r = run(RunCommandArgs {
                    workspace_root: root.to_str().unwrap().to_string(),
                    command: "pwd".into(),
                    workdir: Some("/tmp".into()),
                    timeout_ms: Some(5_000),
                    cancel_token: None,
                });
                assert!(r.is_err());
            });
        }

        #[test]
        fn default_workdir_is_workspace_root() {
            with_home(|_| {
                let dir = tempfile::tempdir().unwrap();
                let root = dir.path().canonicalize().unwrap();
                let r = run(RunCommandArgs {
                    workspace_root: root.to_str().unwrap().to_string(),
                    command: "pwd".into(),
                    workdir: None,
                    timeout_ms: Some(10_000),
                    cancel_token: None,
                }).unwrap();
                assert_eq!(r.stdout.trim(), root.to_str().unwrap());
            });
        }

        #[test]
        fn cancel_stops_running_command() {
            with_home(|_| {
                let dir = tempfile::tempdir().unwrap();
                let root = dir.path().canonicalize().unwrap();
                let token = cancel::CancelToken::new();
                let token_clone = token.clone();
                std::thread::spawn(move || {
                    std::thread::sleep(std::time::Duration::from_millis(200));
                    token_clone.cancel();
                });
                let r = runner::execute(&RunCommandArgs {
                    workspace_root: root.to_str().unwrap().to_string(),
                    command: "sleep 60".into(),
                    workdir: None,
                    timeout_ms: Some(30_000),
                    cancel_token: None,
                }, Some(token)).unwrap();
                assert!(r.cancelled);
                assert!(!r.timed_out);
                assert_eq!(r.exit_code, -1);
            });
        }

        /// Regression: orphan process holding pipe FD must not block execute().
        /// drain_pipes_with_timeout closes FDs after 3s, so total time < 7s.
        #[test]
        fn orphan_holding_pipe_does_not_block_drain() {
            with_home(|_| {
                let dir = tempfile::tempdir().unwrap();
                let root = dir.path().canonicalize().unwrap();
                let start = std::time::Instant::now();
                // Orphan `sleep 300` inherits pipe FD, keeping it open after
                // the parent shell exits. execute() must still return promptly.
                let r = run(RunCommandArgs {
                    workspace_root: root.to_str().unwrap().to_string(),
                    command: "echo ok; (sleep 300 &)".into(),
                    workdir: None,
                    timeout_ms: Some(10_000),
                    cancel_token: None,
                }).unwrap();
                let elapsed = start.elapsed();
                assert_eq!(r.exit_code, 0);
                assert!(!r.timed_out);
                // Must return well before the 10s timeout — drain closes FDs after 3s.
                assert!(elapsed.as_secs() < 7, "took {:?}, expected < 7s", elapsed);
            });
        }
    }
}
