//! Initialization: run `officellm init` to keep skills in sync with the binary.

use std::path::Path;
use std::process::Command;

/// Ensure the officellm home directory is initialized and up-to-date.
///
/// Always runs `bin init` with `OFFICELLM_HOME=home` so that bundled
/// skills stay in sync when the binary is upgraded. The init command
/// itself is idempotent — it overwrites stale assets and no-ops for
/// config that already exists.
pub(crate) fn ensure_initialized(bin: &Path, home: &Path) -> Result<(), String> {
    let output = Command::new(bin)
        .arg("init")
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
mod tests {
    use super::*;

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
