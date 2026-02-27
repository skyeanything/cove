//! Shared TMPDIR setup for officellm subprocesses.

use std::path::PathBuf;
use std::process::Command;

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
