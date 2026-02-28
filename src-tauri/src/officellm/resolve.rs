//! Resolve the officellm binary path.
//!
//! Priority: bundled sidecar > external install (~/.officellm/bin/officellm).

use std::path::PathBuf;

use super::detect;

/// Target triple baked in at compile time (e.g. `aarch64-apple-darwin`).
const TARGET_TRIPLE: &str = env!("TARGET");

/// Resolve the officellm binary.
///
/// Returns `(path, is_bundled)` where `is_bundled` is `true` when the binary
/// was found next to the application executable (sidecar), and `false` when
/// it was found at the default external install location.
pub fn resolve_bin() -> Option<(PathBuf, bool)> {
    // 1. Bundled sidecar: <exe_dir>/officellm-<TARGET_TRIPLE>
    if let Some(path) = sidecar_path() {
        if path.exists() {
            return Some((path, true));
        }
    }

    // 2. External install fallback
    let ext = detect::default_bin_path()?;
    if ext.exists() {
        return Some((ext, false));
    }

    None
}

/// Return the expected sidecar binary path based on the current executable.
fn sidecar_path() -> Option<PathBuf> {
    let exe_dir = std::env::current_exe().ok()?.parent()?.to_path_buf();
    Some(exe_dir.join(format!("officellm-{TARGET_TRIPLE}")))
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
    fn sidecar_path_format() {
        let p = sidecar_path().expect("sidecar_path should return Some");
        let name = p.file_name().unwrap().to_string_lossy();
        assert!(
            name.starts_with("officellm-"),
            "expected officellm-<triple>, got {name}"
        );
        assert!(
            name.contains(TARGET_TRIPLE),
            "expected triple {TARGET_TRIPLE} in {name}"
        );
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
