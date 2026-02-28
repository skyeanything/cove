//! Shared TMPDIR setup for officellm subprocesses.

use std::path::PathBuf;
use std::process::Command;
use std::sync::OnceLock;

/// The system temp directory captured *before* we override TMPDIR.
/// On macOS this is typically `/var/folders/<user>/T/`.
static SYSTEM_TEMP_DIR: OnceLock<PathBuf> = OnceLock::new();

/// Returns the original system temp directory (before TMPDIR override).
/// Some runtimes (e.g. .NET) use `confstr(_CS_DARWIN_USER_TEMP_DIR)` or
/// `NSTemporaryDirectory()` which resolve to this path regardless of TMPDIR.
pub fn system_temp_dir() -> &'static PathBuf {
    SYSTEM_TEMP_DIR.get_or_init(|| std::env::temp_dir())
}

/// Returns the dedicated tmp directory for officellm.
/// Priority: `OFFICELLM_TEMP` env var → `~/.officellm/tmp` → `/tmp`.
pub fn tmp_dir() -> PathBuf {
    if let Ok(custom) = std::env::var("OFFICELLM_TEMP") {
        if !custom.is_empty() {
            let path = PathBuf::from(&custom);
            match std::fs::create_dir_all(&path) {
                Ok(_) => return path,
                Err(e) => {
                    log::warn!(
                        "OFFICELLM_TEMP={custom} is not usable ({e}), falling back to ~/.officellm/tmp"
                    );
                }
            }
        }
    }
    let dir = dirs::home_dir()
        .map(|h| h.join(".officellm/tmp"))
        .unwrap_or_else(|| PathBuf::from("/tmp"));
    let _ = std::fs::create_dir_all(&dir);
    dir
}

/// Sets TMPDIR / TEMP / TMP as process-wide env vars.
/// Call only during single-threaded init (no race risk).
pub unsafe fn apply_process_env() {
    // Capture original system temp dir before overriding TMPDIR
    let _ = system_temp_dir();
    let dir = tmp_dir();
    std::env::set_var("TMPDIR", &dir);
    std::env::set_var("TEMP", &dir);
    std::env::set_var("TMP", &dir);
}

/// Returns paths that must be writable in the sandbox for temp access.
/// Includes both the officellm tmp dir and the original system temp dir
/// (with canonical form for macOS `/var` → `/private/var` symlink).
pub fn sandbox_temp_whitelist() -> Vec<String> {
    let mut paths = vec![tmp_dir().to_string_lossy().into_owned()];
    let sys = system_temp_dir();
    paths.push(sys.to_string_lossy().into_owned());
    if let Ok(canon) = sys.canonicalize() {
        if canon != *sys {
            paths.push(canon.to_string_lossy().into_owned());
        }
    }
    paths
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

    #[test]
    fn tmp_dir_respects_officellm_temp() {
        with_home(|home| {
            let custom = home.join("my-custom-tmp");
            let prev = std::env::var_os("OFFICELLM_TEMP");
            unsafe { std::env::set_var("OFFICELLM_TEMP", &custom); }
            let dir = tmp_dir();
            // restore
            match prev {
                Some(v) => unsafe { std::env::set_var("OFFICELLM_TEMP", v) },
                None => unsafe { std::env::remove_var("OFFICELLM_TEMP") },
            }
            assert_eq!(dir, custom);
            assert!(custom.exists());
        });
    }

    #[test]
    fn tmp_dir_fallback_on_invalid_officellm_temp() {
        with_home(|home| {
            let prev = std::env::var_os("OFFICELLM_TEMP");
            unsafe { std::env::set_var("OFFICELLM_TEMP", "/proc/nonexistent/dir"); }
            let dir = tmp_dir();
            // restore
            match prev {
                Some(v) => unsafe { std::env::set_var("OFFICELLM_TEMP", v) },
                None => unsafe { std::env::remove_var("OFFICELLM_TEMP") },
            }
            assert!(dir.starts_with(home));
            assert!(dir.ends_with(".officellm/tmp"));
        });
    }
}
