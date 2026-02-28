//! First-use initialization: run `officellm init` when no config exists yet.

use std::path::Path;
use std::process::Command;

/// Marker file created by `officellm init`.
const MARKER: &str = "config.json";

/// Ensure the officellm home directory has been initialized.
///
/// If `home/config.json` already exists the call is a no-op (idempotent).
/// Otherwise it spawns `bin init` with `OFFICELLM_HOME=home`, checks the
/// exit status, and verifies the marker file was created.
pub fn ensure_initialized(bin: &Path, home: &Path) -> Result<(), String> {
    let marker = home.join(MARKER);
    if marker.exists() {
        return Ok(());
    }

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

    if !marker.exists() {
        return Err("officellm init succeeded but config.json was not created".into());
    }

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;

    #[test]
    fn skips_when_marker_exists() {
        let dir = tempfile::TempDir::new().unwrap();
        let home = dir.path();
        std::fs::write(home.join(MARKER), "{}").unwrap();

        // Binary doesn't need to exist — we never invoke it.
        let fake_bin = PathBuf::from("/nonexistent/officellm");
        assert!(ensure_initialized(&fake_bin, home).is_ok());
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
        assert!(home.join(MARKER).exists());
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
