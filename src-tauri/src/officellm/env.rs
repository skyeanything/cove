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
    command
        .env("TMPDIR", &dir)
        .env("TEMP", &dir)
        .env("TMP", &dir)
        .env("OFFICELLM_TEMP", &dir);
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::test_util::with_home;

    #[test]
    fn tmp_dir_returns_path_under_home() {
        with_home(|home| {
            let dir = tmp_dir();
            assert!(dir.starts_with(home));
            assert!(dir.ends_with(".officellm/tmp"));
        });
    }

    #[test]
    fn tmp_dir_creates_directory() {
        with_home(|_home| {
            let dir = tmp_dir();
            assert!(dir.exists());
            assert!(dir.is_dir());
        });
    }

    #[test]
    fn apply_tmp_env_sets_env_vars() {
        with_home(|_home| {
            let mut cmd = Command::new("true");
            apply_tmp_env(&mut cmd);
            let envs: std::collections::HashMap<_, _> =
                cmd.get_envs().filter_map(|(k, v)| Some((k.to_owned(), v?.to_owned()))).collect();
            let expected_keys = ["TMPDIR", "TEMP", "TMP", "OFFICELLM_TEMP"];
            for key in expected_keys {
                assert!(
                    envs.contains_key(std::ffi::OsStr::new(key)),
                    "missing env var: {key}"
                );
            }
        });
    }
}
