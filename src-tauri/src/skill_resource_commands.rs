//! Read resource files from external skill directories with path validation.

use std::fs;
use std::path::PathBuf;

const RESOURCE_ALLOWED_EXTENSIONS: &[&str] = &["md", "json", "js", "txt", "yaml", "yml"];
const MAX_RESOURCE_BYTES: u64 = 512 * 1024;

/// Read a resource file from an external skill directory.
/// `skill_dir` is the absolute path to the skill directory.
/// `resource_path` is a relative path like "resources/GUIDE.md".
#[tauri::command]
pub fn read_skill_resource(
    skill_dir: String,
    resource_path: String,
) -> Result<String, String> {
    if resource_path.contains("..") {
        return Err("Path traversal not allowed".into());
    }

    let base = PathBuf::from(&skill_dir);
    if !base.is_dir() {
        return Err(format!("Skill directory not found: {skill_dir}"));
    }

    let target = base.join(&resource_path);

    let ext = target
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("");
    if !RESOURCE_ALLOWED_EXTENSIONS.contains(&ext) {
        return Err(format!("File type .{ext} not allowed for skill resources"));
    }

    if !target.is_file() {
        return Err(format!("Resource not found: {resource_path}"));
    }

    let canonical_base = base
        .canonicalize()
        .map_err(|e| format!("Failed to resolve skill dir: {e}"))?;
    let canonical_target = target
        .canonicalize()
        .map_err(|e| format!("Failed to resolve resource path: {e}"))?;
    if !canonical_target.starts_with(&canonical_base) {
        return Err("Path traversal detected".into());
    }

    let meta = fs::metadata(&canonical_target)
        .map_err(|e| format!("Failed to stat resource: {e}"))?;
    if meta.len() > MAX_RESOURCE_BYTES {
        return Err(format!(
            "Resource too large ({} bytes, max {})",
            meta.len(),
            MAX_RESOURCE_BYTES
        ));
    }

    fs::read_to_string(&canonical_target)
        .map_err(|e| format!("Failed to read resource: {e}"))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn read_skill_resource_success() {
        let td = tempfile::TempDir::new().unwrap();
        let res_dir = td.path().join("resources");
        fs::create_dir_all(&res_dir).unwrap();
        fs::write(res_dir.join("GUIDE.md"), "guide content").unwrap();

        let result = read_skill_resource(
            td.path().to_string_lossy().into_owned(),
            "resources/GUIDE.md".into(),
        );
        assert_eq!(result.unwrap(), "guide content");
    }

    #[test]
    fn read_skill_resource_path_traversal() {
        let td = tempfile::TempDir::new().unwrap();
        let result = read_skill_resource(
            td.path().to_string_lossy().into_owned(),
            "../../../etc/passwd".into(),
        );
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("traversal"));
    }

    #[test]
    fn read_skill_resource_not_found() {
        let td = tempfile::TempDir::new().unwrap();
        let result = read_skill_resource(
            td.path().to_string_lossy().into_owned(),
            "resources/MISSING.md".into(),
        );
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("not found"));
    }

    #[test]
    fn read_skill_resource_bad_extension() {
        let td = tempfile::TempDir::new().unwrap();
        let res_dir = td.path().join("resources");
        fs::create_dir_all(&res_dir).unwrap();
        fs::write(res_dir.join("image.png"), "fake png").unwrap();

        let result = read_skill_resource(
            td.path().to_string_lossy().into_owned(),
            "resources/image.png".into(),
        );
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("not allowed"));
    }
}
