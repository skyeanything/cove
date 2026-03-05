//! Config file I/O: read/write JSON config files in ~/.cove/config/

use std::fs;
use std::path::PathBuf;

fn home_dir() -> Option<PathBuf> {
    #[cfg(unix)]
    { return std::env::var_os("HOME").map(PathBuf::from); }
    #[cfg(windows)]
    { return std::env::var_os("USERPROFILE").map(PathBuf::from); }
    #[cfg(not(any(unix, windows)))]
    { None }
}

fn config_dir() -> Result<PathBuf, String> {
    home_dir()
        .map(|h| h.join(".cove").join("config"))
        .ok_or_else(|| "Cannot determine home directory".into())
}

/// Validate config name: only lowercase letters and hyphens, no path traversal
fn validate_config_name(name: &str) -> Result<(), String> {
    if name.is_empty() {
        return Err("Config name cannot be empty".into());
    }
    if !name
        .chars()
        .all(|c| c.is_ascii_lowercase() || c == '-')
    {
        return Err(
            "Config name may only contain lowercase letters and hyphens".into(),
        );
    }
    if name.starts_with('-') || name.ends_with('-') {
        return Err("Config name cannot start or end with a hyphen".into());
    }
    Ok(())
}

/// Read ~/.cove/config/{name}.json, return content or "{}" if not found
#[tauri::command]
pub fn read_config(name: String) -> Result<String, String> {
    validate_config_name(&name)?;
    let dir = config_dir()?;
    let path = dir.join(format!("{name}.json"));
    if !path.exists() {
        return Ok("{}".into());
    }
    fs::read_to_string(&path)
        .map_err(|e| format!("Failed to read config {name}: {e}"))
}

/// Write ~/.cove/config/{name}.json, creating directory if needed
#[tauri::command]
pub fn write_config(name: String, content: String) -> Result<(), String> {
    validate_config_name(&name)?;
    let dir = config_dir()?;
    fs::create_dir_all(&dir)
        .map_err(|e| format!("Failed to create config dir: {e}"))?;
    let path = dir.join(format!("{name}.json"));
    fs::write(&path, &content)
        .map_err(|e| format!("Failed to write config {name}: {e}"))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::test_util::with_home;

    #[test]
    fn validate_accepts_valid_names() {
        assert!(validate_config_name("appearance").is_ok());
        assert!(validate_config_name("layout").is_ok());
        assert!(validate_config_name("my-config").is_ok());
    }

    #[test]
    fn validate_rejects_invalid_names() {
        assert!(validate_config_name("").is_err());
        assert!(validate_config_name("../bad").is_err());
        assert!(validate_config_name("BAD").is_err());
        assert!(validate_config_name("a_b").is_err());
        assert!(validate_config_name("-foo").is_err());
        assert!(validate_config_name("foo-").is_err());
    }

    #[test]
    fn read_missing_returns_empty_object() {
        with_home(|_| {
            let content = read_config("appearance".into()).unwrap();
            assert_eq!(content, "{}");
        });
    }

    #[test]
    fn write_then_read_roundtrip() {
        with_home(|home| {
            let data = r#"{"theme":"dark"}"#;
            write_config("appearance".into(), data.into()).unwrap();
            let read = read_config("appearance".into()).unwrap();
            assert_eq!(read, data);
            assert!(home.join(".cove/config/appearance.json").is_file());
        });
    }

    #[test]
    fn write_creates_directory() {
        with_home(|home| {
            write_config("layout".into(), "{}".into()).unwrap();
            assert!(home.join(".cove/config").is_dir());
        });
    }

    #[test]
    fn crud_rejects_invalid_name() {
        for name in ["../bad", "BAD", ""] {
            let n = name.to_string();
            assert!(read_config(n.clone()).is_err());
            assert!(write_config(n, "{}".into()).is_err());
        }
    }
}
