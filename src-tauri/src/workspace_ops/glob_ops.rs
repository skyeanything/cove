use std::path::Path;

const GLOB_LIMIT: usize = 1000;

pub fn ws_glob(workspace_root: &str, pattern: &str) -> Result<Vec<String>, String> {
    if Path::new(pattern).is_absolute() {
        return Err("absolute glob patterns not allowed".to_string());
    }
    if Path::new(pattern)
        .components()
        .any(|c| matches!(c, std::path::Component::ParentDir))
    {
        return Err("glob pattern must not contain parent traversal".to_string());
    }

    let root = Path::new(workspace_root);
    let full_pattern = root.join(pattern).to_string_lossy().into_owned();
    let paths = glob::glob(&full_pattern).map_err(|e| e.to_string())?;

    let canonical_root = root.canonicalize().map_err(|e| e.to_string())?;

    let mut results = Vec::new();
    for entry in paths {
        let p = entry.map_err(|e| e.to_string())?;
        let canonical = match p.canonicalize() {
            Ok(c) => c,
            Err(_) => continue,
        };
        if !canonical.starts_with(&canonical_root) {
            continue;
        }
        if let Ok(rel) = canonical.strip_prefix(&canonical_root) {
            results.push(rel.to_string_lossy().into_owned());
        }
        if results.len() >= GLOB_LIMIT {
            break;
        }
    }
    Ok(results)
}
