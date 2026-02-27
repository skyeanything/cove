//! Skill CRUD: create / update / delete user skills in ~/.cove/skills/

use std::fs;
use std::path::PathBuf;

/// Validate skill name: lowercase alphanumeric + hyphens only
fn validate_skill_name(name: &str) -> Result<(), String> {
    if name.is_empty() {
        return Err("Skill name cannot be empty".into());
    }
    if name.len() > 64 {
        return Err("Skill name too long (max 64 chars)".into());
    }
    if !name
        .chars()
        .all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == '-')
    {
        return Err(
            "Skill name may only contain lowercase letters, digits, and hyphens".into(),
        );
    }
    if name.starts_with('-') || name.ends_with('-') {
        return Err("Skill name cannot start or end with a hyphen".into());
    }
    Ok(())
}

fn cove_skills_dir() -> Result<PathBuf, String> {
    let home = home_dir().ok_or("Cannot determine home directory")?;
    Ok(home.join(".cove").join("skills"))
}

fn home_dir() -> Option<PathBuf> {
    #[cfg(unix)]
    { return std::env::var_os("HOME").map(PathBuf::from); }
    #[cfg(windows)]
    { return std::env::var_os("USERPROFILE").map(PathBuf::from); }
    #[cfg(not(any(unix, windows)))]
    { None }
}

/// Create or update a skill: writes ~/.cove/skills/{name}/SKILL.md
#[tauri::command]
pub fn write_skill(name: String, content: String) -> Result<String, String> {
    validate_skill_name(&name)?;
    let skills_dir = cove_skills_dir()?;
    let skill_dir = skills_dir.join(&name);
    fs::create_dir_all(&skill_dir)
        .map_err(|e| format!("Failed to create skill directory: {e}"))?;

    // Safety: ensure the resolved path is actually inside ~/.cove/skills/
    let canonical = skill_dir
        .canonicalize()
        .map_err(|e| format!("Failed to resolve path: {e}"))?;
    let canonical_base = skills_dir
        .canonicalize()
        .map_err(|e| format!("Failed to resolve base path: {e}"))?;
    if !canonical.starts_with(&canonical_base) {
        return Err("Path traversal detected".into());
    }

    let skill_path = canonical.join("SKILL.md");
    fs::write(&skill_path, &content)
        .map_err(|e| format!("Failed to write SKILL.md: {e}"))?;

    Ok(skill_path.to_string_lossy().into_owned())
}

/// Delete a skill directory: removes ~/.cove/skills/{name}/
#[tauri::command]
pub fn delete_skill(name: String) -> Result<(), String> {
    validate_skill_name(&name)?;
    let skills_dir = cove_skills_dir()?;
    let skill_dir = skills_dir.join(&name);

    if !skill_dir.is_dir() {
        return Err(format!("Skill directory not found: {}", skill_dir.display()));
    }

    // Safety: ensure the path is actually inside ~/.cove/skills/
    let canonical = skill_dir
        .canonicalize()
        .map_err(|e| format!("Failed to resolve path: {e}"))?;
    let canonical_base = skills_dir
        .canonicalize()
        .map_err(|e| format!("Failed to resolve base path: {e}"))?;
    if !canonical.starts_with(&canonical_base) {
        return Err("Path traversal detected".into());
    }

    fs::remove_dir_all(&skill_dir)
        .map_err(|e| format!("Failed to delete skill: {e}"))?;
    Ok(())
}

/// Read a single skill file content by name from ~/.cove/skills/{name}/SKILL.md
#[tauri::command]
pub fn read_skill(name: String) -> Result<String, String> {
    validate_skill_name(&name)?;
    let skills_dir = cove_skills_dir()?;
    let skill_path = skills_dir.join(&name).join("SKILL.md");

    if !skill_path.is_file() {
        return Err(format!("Skill not found: {}", skill_path.display()));
    }

    fs::read_to_string(&skill_path)
        .map_err(|e| format!("Failed to read SKILL.md: {e}"))
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::Path;
    use std::sync::Mutex;

    static SERIAL: Mutex<()> = Mutex::new(());

    /// Set $HOME to a canonicalized tempdir, run `f`, then restore.
    fn with_home<F: FnOnce(&Path)>(f: F) {
        let _lock = SERIAL.lock().unwrap();
        let td = tempfile::TempDir::new().unwrap();
        let canon = td.path().canonicalize().unwrap();
        let prev = std::env::var_os("HOME");
        unsafe { std::env::set_var("HOME", &canon) };
        f(&canon);
        match prev {
            Some(v) => unsafe { std::env::set_var("HOME", v) },
            None => unsafe { std::env::remove_var("HOME") },
        }
    }

    // --- validate_skill_name ---

    #[test]
    fn validate_accepts_valid_names() {
        assert!(validate_skill_name("my-skill").is_ok());
        assert!(validate_skill_name("a").is_ok());
        assert!(validate_skill_name("abc123").is_ok());
        assert!(validate_skill_name(&"a".repeat(64)).is_ok());
    }

    #[test]
    fn validate_rejects_empty() {
        assert!(validate_skill_name("").is_err());
    }

    #[test]
    fn validate_rejects_too_long() {
        assert!(validate_skill_name(&"a".repeat(65)).is_err());
    }

    #[test]
    fn validate_rejects_uppercase() {
        assert!(validate_skill_name("MySkill").is_err());
    }

    #[test]
    fn validate_rejects_special_chars() {
        for name in ["../foo", "a_b", "a b", "a/b"] {
            assert!(validate_skill_name(name).is_err(), "should reject {name}");
        }
    }

    #[test]
    fn validate_rejects_leading_trailing_hyphen() {
        assert!(validate_skill_name("-foo").is_err());
        assert!(validate_skill_name("foo-").is_err());
        assert!(validate_skill_name("-").is_err());
    }

    // --- CRUD ---

    #[test]
    fn write_read_roundtrip() {
        with_home(|_| {
            let content = "---\nname: hello\n---\nHello world";
            write_skill("hello".into(), content.into()).unwrap();
            let read = read_skill("hello".into()).unwrap();
            assert_eq!(read, content);
        });
    }

    #[test]
    fn write_creates_directory_structure() {
        with_home(|home| {
            write_skill("test-skill".into(), "content".into()).unwrap();
            let md = home.join(".cove/skills/test-skill/SKILL.md");
            assert!(md.is_file());
        });
    }

    #[test]
    fn write_overwrites_existing() {
        with_home(|_| {
            write_skill("over".into(), "v1".into()).unwrap();
            write_skill("over".into(), "v2".into()).unwrap();
            assert_eq!(read_skill("over".into()).unwrap(), "v2");
        });
    }

    #[test]
    fn delete_removes_skill_dir() {
        with_home(|home| {
            write_skill("del-me".into(), "x".into()).unwrap();
            delete_skill("del-me".into()).unwrap();
            assert!(!home.join(".cove/skills/del-me").is_dir());
        });
    }

    #[test]
    fn delete_nonexistent_returns_error() {
        with_home(|_| {
            let err = delete_skill("no-exist".into()).unwrap_err();
            assert!(err.to_lowercase().contains("not found"), "got: {err}");
        });
    }

    #[test]
    fn read_nonexistent_returns_error() {
        with_home(|_| {
            assert!(read_skill("no-exist".into()).is_err());
        });
    }

    #[test]
    fn crud_rejects_invalid_name() {
        for name in ["../bad", "BAD", ""] {
            let n = name.to_string();
            assert!(write_skill(n.clone(), "x".into()).is_err());
            assert!(read_skill(n.clone()).is_err());
            assert!(delete_skill(n).is_err());
        }
    }
}
