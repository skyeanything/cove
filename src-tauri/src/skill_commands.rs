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
