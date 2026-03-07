//! Resolve the officellm binary path.
//!
//! Priority: bundled sidecar > external install (~/.officellm/bin/officellm).
//! On Windows, binary names include `.exe`; on Unix no extension.

use std::path::PathBuf;

/// Target triple baked in at compile time (e.g. `aarch64-apple-darwin`).
const TARGET_TRIPLE: &str = env!("TARGET");

#[cfg(windows)]
const BIN_EXT: &str = ".exe";
#[cfg(not(windows))]
const BIN_EXT: &str = "";

/// Resolve the officellm binary.
///
/// Returns `(path, is_bundled)` where `is_bundled` is `true` when the binary
/// was found next to the application executable (sidecar), and `false` when
/// it was found at the default external install location or in PATH.
pub fn resolve_bin() -> Option<(PathBuf, bool)> {
    // 1. Bundled sidecar (already existence-checked inside sidecar_path)
    if let Some(path) = sidecar_path() {
        return Some((path, true));
    }

    // 2. Default external install (~/.officellm/bin/officellm or ...\officellm.exe)
    if let Some(ext) = external_bin_path() {
        if ext.exists() {
            return Some((ext, false));
        }
    }

    // 3. Search PATH (e.g. npm -g, scoop, chocolatey, or custom install)
    if let Some(path) = find_officellm_in_path() {
        return Some((path, false));
    }

    None
}

/// Return the expected sidecar binary path based on the current executable.
///
/// Tauri uses `officellm-<triple>` during development but strips the suffix
/// to plain `officellm` when bundling. On Windows both names include `.exe`.
fn sidecar_path() -> Option<PathBuf> {
    let exe_dir = std::env::current_exe().ok()?.parent()?.to_path_buf();
    // Dev / unbundled: officellm-aarch64-apple-darwin or officellm-x86_64-pc-windows-msvc.exe
    let with_triple = exe_dir.join(format!("officellm-{TARGET_TRIPLE}{BIN_EXT}"));
    if with_triple.exists() {
        return Some(with_triple);
    }
    // Bundled: officellm or officellm.exe
    let plain = exe_dir.join(format!("officellm{BIN_EXT}"));
    if plain.exists() {
        return Some(plain);
    }
    // Dev fallback: src-tauri/binaries/
    #[cfg(debug_assertions)]
    {
        let dev_bin = std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
            .join("binaries")
            .join(format!("officellm-{TARGET_TRIPLE}{BIN_EXT}"));
        if dev_bin.exists() {
            return Some(dev_bin);
        }
    }
    None
}

/// Return the external install binary path (`~/.officellm/bin/officellm` or `...\officellm.exe` on Windows).
fn external_bin_path() -> Option<PathBuf> {
    dirs::home_dir().map(|h| h.join(".officellm").join("bin").join(format!("officellm{BIN_EXT}")))
}

/// Search PATH for officellm (e.g. npm -g, scoop, chocolatey). Returns first existing path.
fn find_officellm_in_path() -> Option<PathBuf> {
    let path_env = std::env::var_os("PATH")?;
    let separator = if cfg!(windows) { ';' } else { ':' };
    for dir in std::env::split_paths(&path_env) {
        let candidate = dir.join(format!("officellm{BIN_EXT}"));
        if candidate.is_file() {
            return Some(candidate);
        }
    }
    None
}

/// Return the external `OFFICELLM_HOME` directory (`~/.officellm`).
pub fn external_home() -> Option<PathBuf> {
    dirs::home_dir().map(|h| h.join(".officellm"))
}

/// Return the correct `OFFICELLM_HOME` for the resolved binary.
///
/// Bundled mode → `<app_data_dir>/officellm`, external → `~/.officellm`.
pub fn resolve_home(is_bundled: bool, app: &tauri::AppHandle) -> Result<PathBuf, String> {
    if is_bundled {
        officellm_home(app)
    } else {
        external_home().ok_or_else(|| "无法获取用户 home 目录".to_string())
    }
}

/// Return the `OFFICELLM_HOME` directory for bundled mode.
///
/// Path: `<app_data_dir>/officellm`. The directory is created if it does not
/// exist.
pub fn officellm_home(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    use tauri::Manager;

    let base = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("failed to resolve app data dir: {e}"))?;
    let home = base.join("officellm");
    std::fs::create_dir_all(&home)
        .map_err(|e| format!("failed to create officellm home: {e}"))?;
    Ok(home)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn target_triple_is_not_empty() {
        assert!(!TARGET_TRIPLE.is_empty());
    }

    #[test]
    fn sidecar_path_returns_none_when_no_binary() {
        // In the test environment neither sidecar file exists.
        assert!(sidecar_path().is_none());
    }

    #[test]
    fn resolve_bin_does_not_panic() {
        // Just ensure it doesn't panic regardless of the environment.
        let _ = resolve_bin();
    }

    #[cfg(unix)]
    #[test]
    fn resolve_bin_finds_external() {
        use crate::test_util::with_home;
        use std::os::unix::fs::PermissionsExt;

        with_home(|home| {
            let bin = home.join(".officellm/bin/officellm");
            std::fs::create_dir_all(bin.parent().unwrap()).unwrap();
            std::fs::write(&bin, "#!/bin/sh\n").unwrap();
            std::fs::set_permissions(&bin, std::fs::Permissions::from_mode(0o755)).unwrap();

            let result = resolve_bin();
            assert!(result.is_some(), "should find external binary");
            let (path, is_bundled) = result.unwrap();
            assert!(!is_bundled, "should not be bundled");
            assert_eq!(path, bin);
        });
    }
}
