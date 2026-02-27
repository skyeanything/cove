//! Shared TMPDIR setup for officellm subprocesses.

use std::path::PathBuf;
use std::process::Command;
use std::sync::OnceLock;

/// Stores the real system temp dir captured before we override TMPDIR.
static ORIGINAL_TEMP_DIR: OnceLock<PathBuf> = OnceLock::new();

/// Snapshot the real system temp dir **before** any `set_var("TMPDIR", …)`.
/// Must be called once at startup in `lib::run()`.
pub fn init_original_temp_dir() {
    ORIGINAL_TEMP_DIR.get_or_init(|| std::env::temp_dir());
}

/// Returns the real system temp dir captured at startup
/// (e.g. `/var/folders/c1/.../T/`). Falls back to `std::env::temp_dir()`
/// if `init_original_temp_dir()` was never called.
pub fn original_temp_dir() -> PathBuf {
    ORIGINAL_TEMP_DIR
        .get()
        .cloned()
        .unwrap_or_else(|| std::env::temp_dir())
}

/// Returns the dedicated tmp directory for officellm (`~/.officellm/tmp`),
/// creating it if needed. Falls back to `/tmp`.
pub fn tmp_dir() -> PathBuf {
    let dir = dirs::home_dir()
        .map(|h| h.join(".officellm/tmp"))
        .unwrap_or_else(|| PathBuf::from("/tmp"));
    let _ = std::fs::create_dir_all(&dir);
    dir
}

/// Sets TMPDIR / TEMP / TMP environment variables on a `Command` builder
/// so the child process uses a known-writable temp directory.
pub fn apply_tmp_env(command: &mut Command) {
    let dir = tmp_dir();
    command.env("TMPDIR", &dir).env("TEMP", &dir).env("TMP", &dir);
}
