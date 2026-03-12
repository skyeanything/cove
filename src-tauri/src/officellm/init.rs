//! Initialization: run `officellm init` to keep skills in sync with the binary.
//!
//! Provides an init barrier so that other officellm operations (CLI spawn,
//! server spawn, docx preview) wait until init completes before executing
//! the binary. This prevents concurrent binary access during macOS
//! Gatekeeper verification (which causes transient EACCES / os error 13).

use std::path::Path;
use std::process::Command;
use std::sync::{Condvar, Mutex};
use std::time::Duration;

// ── Init barrier ─────────────────────────────────────────────────────────────

#[derive(Clone, Copy, PartialEq)]
enum InitState {
    /// `officellm_init` has not been called yet.
    NotStarted,
    /// `officellm_init` is currently running.
    InProgress,
    /// `officellm_init` has completed (success or failure).
    Done,
}

static INIT_STATE: (Mutex<InitState>, Condvar) =
    (Mutex::new(InitState::NotStarted), Condvar::new());
/// Stores the result of the last init attempt so concurrent waiters can
/// retrieve it after being woken.
static INIT_RESULT: Mutex<Option<Result<(), String>>> = Mutex::new(None);

/// Maximum time to wait for init to complete before proceeding anyway.
const INIT_WAIT_TIMEOUT: Duration = Duration::from_secs(10);

/// Try to claim the init slot. Returns `true` if this caller should run
/// init (first to transition `NotStarted → InProgress`). Returns `false`
/// if init is already in progress or done — caller should `wait_for_init`.
pub(crate) fn mark_init_started() -> bool {
    let (lock, _) = &INIT_STATE;
    if let Ok(mut state) = lock.lock() {
        if *state == InitState::NotStarted {
            *state = InitState::InProgress;
            return true;
        }
    }
    false
}

/// Mark init as done and wake all waiters. On success, state moves to
/// `Done` (no further init attempts). On failure, state resets to
/// `NotStarted` so the next caller can retry.
pub(crate) fn mark_init_done(result: &Result<(), String>) {
    if let Ok(mut stored) = INIT_RESULT.lock() {
        *stored = Some(result.clone());
    }
    let (lock, cvar) = &INIT_STATE;
    if let Ok(mut state) = lock.lock() {
        *state = if result.is_ok() { InitState::Done } else { InitState::NotStarted };
        cvar.notify_all();
    }
}

/// Retrieve the result of the last init attempt. Returns `Ok(())` if
/// init has never run (e.g. timeout or `NotStarted`).
pub(crate) fn init_result() -> Result<(), String> {
    INIT_RESULT.lock().ok().and_then(|r| r.clone()).unwrap_or(Ok(()))
}

/// Block until init has completed. If init is `InProgress`, wait up to
/// `INIT_WAIT_TIMEOUT`. If init is `NotStarted` or `Done`, return
/// immediately (binary may already be initialized from a previous run).
pub(crate) fn wait_for_init() {
    let (lock, cvar) = &INIT_STATE;
    let guard = match lock.lock() {
        Ok(g) => g,
        Err(_) => return,
    };
    if *guard != InitState::InProgress {
        return;
    }
    let (_guard, timeout) = cvar
        .wait_timeout_while(guard, INIT_WAIT_TIMEOUT, |s| *s == InitState::InProgress)
        .unwrap_or_else(|e| e.into_inner());
    if timeout.timed_out() {
        log::warn!("[officellm] init wait timed out after {}s, proceeding", INIT_WAIT_TIMEOUT.as_secs());
    }
}

/// Ensure the officellm home directory is initialized and up-to-date.
///
/// Always runs `bin init --force` with `OFFICELLM_HOME=home` so that
/// bundled skills stay in sync when the binary is upgraded. The
/// `--force` flag overwrites existing files (the CLI skips them by
/// default), while config.json is preserved.
pub(crate) fn ensure_initialized(bin: &Path, home: &Path) -> Result<(), String> {
    let output = Command::new(bin)
        .args(["init", "--force"])
        .env("OFFICELLM_HOME", home)
        .output()
        .map_err(|e| format!("failed to spawn officellm init: {e}"))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!(
            "officellm init exited with {}: {}",
            output.status,
            stderr.trim()
        ));
    }

    if !home.join("config.json").exists() {
        return Err("officellm init succeeded but config.json was not created".into());
    }

    Ok(())
}

#[cfg(test)]
/// Reset barrier state for test isolation.
pub(crate) fn reset_init_state() {
    let (lock, _) = &INIT_STATE;
    if let Ok(mut state) = lock.lock() {
        *state = InitState::NotStarted;
    }
    if let Ok(mut stored) = INIT_RESULT.lock() {
        *stored = None;
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Serialize barrier tests that mutate the global INIT_STATE.
    static BARRIER_LOCK: Mutex<()> = Mutex::new(());

    #[test]
    fn wait_returns_immediately_when_not_started() {
        let _g = BARRIER_LOCK.lock().unwrap();
        reset_init_state();
        let start = std::time::Instant::now();
        wait_for_init();
        assert!(start.elapsed() < Duration::from_millis(50));
    }

    #[test]
    fn wait_returns_immediately_when_done() {
        let _g = BARRIER_LOCK.lock().unwrap();
        reset_init_state();
        mark_init_started();
        mark_init_done(&Ok(()));
        let start = std::time::Instant::now();
        wait_for_init();
        assert!(start.elapsed() < Duration::from_millis(50));
    }

    #[test]
    fn wait_blocks_until_done() {
        let _g = BARRIER_LOCK.lock().unwrap();
        reset_init_state();
        assert!(mark_init_started());
        let handle = std::thread::spawn(|| {
            let start = std::time::Instant::now();
            wait_for_init();
            start.elapsed()
        });
        std::thread::sleep(Duration::from_millis(100));
        mark_init_done(&Ok(()));
        let elapsed = handle.join().unwrap();
        assert!(elapsed >= Duration::from_millis(80));
        assert!(elapsed < Duration::from_secs(2));
    }

    #[test]
    fn single_flight_success_prevents_retry() {
        let _g = BARRIER_LOCK.lock().unwrap();
        reset_init_state();
        assert!(mark_init_started());
        mark_init_done(&Ok(()));
        assert!(!mark_init_started(), "after success, no retry");
        assert!(init_result().is_ok());
    }

    #[test]
    fn failure_allows_retry() {
        let _g = BARRIER_LOCK.lock().unwrap();
        reset_init_state();
        assert!(mark_init_started());
        mark_init_done(&Err("boom".into()));
        assert!(init_result().is_err());
        // State reset to NotStarted — retry is possible
        assert!(mark_init_started(), "after failure, retry allowed");
        mark_init_done(&Ok(()));
        assert!(init_result().is_ok());
    }

    #[cfg(unix)]
    #[test]
    fn runs_init_on_fresh_home() {
        let dir = tempfile::TempDir::new().unwrap();
        let home = dir.path();

        // Fake binary that creates config.json at OFFICELLM_HOME.
        let bin = dir.path().join("fake-officellm");
        std::fs::write(
            &bin,
            "#!/bin/sh\ntouch \"$OFFICELLM_HOME/config.json\"\n",
        )
        .unwrap();
        #[allow(clippy::permissions_set_readonly_false)]
        std::fs::set_permissions(&bin, std::os::unix::fs::PermissionsExt::from_mode(0o755))
            .unwrap();

        assert!(ensure_initialized(&bin, home).is_ok());
        assert!(home.join("config.json").exists());
    }

    #[cfg(unix)]
    #[test]
    fn runs_init_even_when_config_exists() {
        let dir = tempfile::TempDir::new().unwrap();
        let home = dir.path();
        // Pre-create config.json to simulate a previous init.
        std::fs::write(home.join("config.json"), "{}").unwrap();

        // Binary that creates a marker file proving it was invoked.
        let bin = dir.path().join("tracking-officellm");
        std::fs::write(
            &bin,
            "#!/bin/sh\ntouch \"$OFFICELLM_HOME/init-was-called\"\n",
        )
        .unwrap();
        std::fs::set_permissions(&bin, std::os::unix::fs::PermissionsExt::from_mode(0o755))
            .unwrap();

        assert!(ensure_initialized(&bin, home).is_ok());
        assert!(home.join("init-was-called").exists(), "init must run even when config.json exists");
    }

    #[cfg(unix)]
    #[test]
    fn fails_on_nonzero_exit() {
        let dir = tempfile::TempDir::new().unwrap();
        let home = dir.path();

        let bin = dir.path().join("bad-officellm");
        std::fs::write(&bin, "#!/bin/sh\nexit 1\n").unwrap();
        std::fs::set_permissions(&bin, std::os::unix::fs::PermissionsExt::from_mode(0o755))
            .unwrap();

        let err = ensure_initialized(&bin, home).unwrap_err();
        assert!(err.contains("exited with"), "unexpected error: {err}");
    }

    #[cfg(unix)]
    #[test]
    fn fails_when_marker_not_created() {
        let dir = tempfile::TempDir::new().unwrap();
        let home = dir.path();

        // Exits 0 but does NOT create config.json.
        let bin = dir.path().join("noop-officellm");
        std::fs::write(&bin, "#!/bin/sh\nexit 0\n").unwrap();
        std::fs::set_permissions(&bin, std::os::unix::fs::PermissionsExt::from_mode(0o755))
            .unwrap();

        let err = ensure_initialized(&bin, home).unwrap_err();
        assert!(
            err.contains("config.json was not created"),
            "unexpected error: {err}"
        );
    }
}
