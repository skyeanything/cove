//! SOUL file management: read, write, snapshot for ~/.cove/soul/

use std::fs;
use std::path::PathBuf;
use crate::soul_defaults::DEFAULT_SOUL;
use crate::soul_migrate;

const MAX_SNAPSHOTS: usize = 20;

fn home_dir() -> Option<PathBuf> {
    #[cfg(unix)]
    { return std::env::var_os("HOME").map(PathBuf::from); }
    #[cfg(windows)]
    { return std::env::var_os("USERPROFILE").map(PathBuf::from); }
    #[cfg(not(any(unix, windows)))]
    { None }
}

pub(crate) fn cove_dir() -> Result<PathBuf, String> {
    home_dir().map(|h| h.join(".cove")).ok_or_else(|| "Cannot determine home directory".into())
}

fn soul_dir() -> Result<PathBuf, String> { Ok(cove_dir()?.join("soul")) }
fn private_dir() -> Result<PathBuf, String> { Ok(soul_dir()?.join("private")) }

fn validate_safe_name(name: &str) -> Result<(), String> {
    if name.is_empty() || name.contains('/') || name.contains('\\')
        || name.contains("..") || name.starts_with('.') || !name.ends_with(".md") {
        return Err(format!("Invalid file name: {name} (must be *.md, no path traversal)"));
    }
    Ok(())
}

pub(crate) fn ensure_soul_files(cove: &PathBuf) -> Result<(), String> {
    let soul = cove.join("soul");
    fs::create_dir_all(&soul).map_err(|e| format!("Failed to create soul: {e}"))?;
    fs::create_dir_all(soul.join("private")).map_err(|e| format!("Failed to create soul/private: {e}"))?;
    soul_migrate::migrate_legacy(cove, &soul)?;
    let soul_md = soul.join("SOUL.md");
    if !soul_md.exists() {
        log::info!("[SOUL] initializing SOUL.md (first run)");
        fs::write(&soul_md, DEFAULT_SOUL).map_err(|e| format!("Failed to init SOUL.md: {e}"))?;
    }
    Ok(())
}

#[tauri::command]
pub fn read_soul(file_name: String) -> Result<String, String> {
    if file_name != "SOUL.md" { return Err(format!("Invalid SOUL file name: {file_name}")); }
    let cove = cove_dir()?;
    ensure_soul_files(&cove)?;
    log::info!("[SOUL] read: SOUL.md");
    fs::read_to_string(cove.join("soul/SOUL.md")).map_err(|e| format!("Failed to read SOUL.md: {e}"))
}

#[tauri::command]
pub fn write_soul(file_name: String, content: String) -> Result<(), String> {
    if file_name != "SOUL.md" { return Err(format!("Invalid SOUL file name: {file_name}")); }
    let soul = soul_dir()?;
    fs::create_dir_all(&soul).map_err(|e| format!("Failed to create soul dir: {e}"))?;
    log::info!("[SOUL] write: SOUL.md ({} bytes)", content.len());
    fs::write(soul.join("SOUL.md"), &content).map_err(|e| format!("Failed to write SOUL.md: {e}"))
}

#[tauri::command]
pub fn read_soul_private() -> Result<Vec<(String, String)>, String> {
    let dir = private_dir()?;
    if !dir.exists() { return Ok(Vec::new()); }
    let mut files: Vec<(String, String)> = Vec::new();
    for entry in fs::read_dir(&dir).map_err(|e| format!("Failed to read soul/private: {e}"))?.filter_map(|e| e.ok()) {
        let path = entry.path();
        if path.extension().map_or(false, |ext| ext == "md") {
            let name = entry.file_name().to_string_lossy().into_owned();
            let content = fs::read_to_string(&path).map_err(|e| format!("Failed to read {name}: {e}"))?;
            files.push((name, content));
        }
    }
    files.sort_by(|a, b| a.0.cmp(&b.0));
    log::info!("[SOUL] read_private: {} files", files.len());
    Ok(files)
}

#[tauri::command]
pub fn write_soul_private(file_name: String, content: String) -> Result<(), String> {
    validate_safe_name(&file_name)?;
    let dir = private_dir()?;
    fs::create_dir_all(&dir).map_err(|e| format!("Failed to create soul/private: {e}"))?;
    log::info!("[SOUL] write_private: {file_name} ({} bytes)", content.len());
    fs::write(dir.join(&file_name), &content).map_err(|e| format!("Failed to write {file_name}: {e}"))
}

#[tauri::command]
pub fn delete_soul_private(file_name: String) -> Result<(), String> {
    validate_safe_name(&file_name)?;
    let path = private_dir()?.join(&file_name);
    if path.exists() {
        log::info!("[SOUL] delete_private: {file_name}");
        fs::remove_file(&path).map_err(|e| format!("Failed to delete {file_name}: {e}"))?;
    }
    Ok(())
}

#[tauri::command]
pub fn snapshot_soul() -> Result<String, String> {
    let cove = cove_dir()?;
    ensure_soul_files(&cove)?;
    let soul = cove.join("soul");
    let snaps = soul.join("snapshots");
    fs::create_dir_all(&snaps).map_err(|e| format!("Failed to create snapshots: {e}"))?;

    let ts = chrono::Utc::now().format("%Y-%m-%dT%H-%M-%SZ").to_string();
    let snap_dir = snaps.join(&ts);
    fs::create_dir_all(&snap_dir).map_err(|e| format!("Failed to create snapshot dir: {e}"))?;

    let soul_md = soul.join("SOUL.md");
    if soul_md.exists() {
        fs::copy(&soul_md, snap_dir.join("SOUL.md")).map_err(|e| format!("Snapshot SOUL.md: {e}"))?;
    }
    let priv_dir = soul.join("private");
    if priv_dir.exists() {
        let snap_priv = snap_dir.join("private");
        fs::create_dir_all(&snap_priv).map_err(|e| format!("Snapshot private: {e}"))?;
        if let Ok(entries) = fs::read_dir(&priv_dir) {
            for entry in entries.filter_map(|e| e.ok()) {
                let _ = fs::copy(entry.path(), snap_priv.join(entry.file_name()));
            }
        }
    }
    log::info!("[SOUL] snapshot saved: {ts}");
    prune_snapshots(&snaps)?;
    Ok(ts)
}

fn prune_snapshots(snaps: &PathBuf) -> Result<(), String> {
    let mut entries: Vec<_> = fs::read_dir(snaps)
        .map_err(|e| format!("Failed to read snapshots: {e}"))?
        .filter_map(|e| e.ok()).filter(|e| e.path().is_dir()).collect();
    if entries.len() <= MAX_SNAPSHOTS { return Ok(()); }
    entries.sort_by(|a, b| {
        let t = |x: &fs::DirEntry| x.metadata().and_then(|m| m.modified()).unwrap_or(std::time::SystemTime::UNIX_EPOCH);
        t(b).cmp(&t(a))
    });
    for entry in entries.iter().skip(MAX_SNAPSHOTS) { let _ = fs::remove_dir_all(entry.path()); }
    log::info!("[SOUL] pruned snapshots to {MAX_SNAPSHOTS}");
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::test_util::with_home;

    #[test]
    fn first_run_creates_soul_directory() {
        with_home(|home| {
            let content = read_soul("SOUL.md".into()).unwrap();
            assert!(content.contains("# Who I Am") && content.contains("## My DNA"));
            assert!(home.join(".cove/soul/SOUL.md").is_file());
            assert!(home.join(".cove/soul/private").is_dir());
        });
    }

    #[test]
    fn write_then_read_roundtrip() {
        with_home(|_| {
            read_soul("SOUL.md".into()).unwrap();
            write_soul("SOUL.md".into(), "# Custom".into()).unwrap();
            assert_eq!(read_soul("SOUL.md".into()).unwrap(), "# Custom");
        });
    }

    #[test]
    fn read_soul_rejects_invalid_name() {
        with_home(|_| {
            assert!(read_soul("bad.md".into()).is_err());
            assert!(read_soul("SOUL.private.md".into()).is_err());
        });
    }

    #[test]
    fn private_file_crud() {
        with_home(|_| {
            read_soul("SOUL.md".into()).unwrap();
            write_soul_private("observations.md".into(), "- obs 1\n".into()).unwrap();
            assert_eq!(read_soul_private().unwrap().len(), 1);
            write_soul_private("patterns.md".into(), "# P\n".into()).unwrap();
            assert_eq!(read_soul_private().unwrap().len(), 2);
            delete_soul_private("patterns.md".into()).unwrap();
            assert_eq!(read_soul_private().unwrap().len(), 1);
        });
    }

    #[test]
    fn private_rejects_invalid_names() {
        with_home(|_| {
            assert!(write_soul_private("../evil.md".into(), "x".into()).is_err());
            assert!(write_soul_private(".hidden".into(), "x".into()).is_err());
            assert!(write_soul_private("a/b.md".into(), "x".into()).is_err());
            assert!(write_soul_private("notes.txt".into(), "x".into()).is_err());
            assert!(write_soul_private("data.json".into(), "x".into()).is_err());
        });
    }

    #[test]
    fn snapshot_creates_directory_snapshot() {
        with_home(|home| {
            read_soul("SOUL.md".into()).unwrap();
            write_soul_private("observations.md".into(), "- test\n".into()).unwrap();
            let ts = snapshot_soul().unwrap();
            let snap = home.join(".cove/soul/snapshots").join(&ts);
            assert!(snap.join("SOUL.md").is_file());
            assert!(snap.join("private/observations.md").is_file());
        });
    }

    #[test]
    fn snapshot_prunes_old_entries() {
        with_home(|home| {
            read_soul("SOUL.md".into()).unwrap();
            let snaps = home.join(".cove/soul/snapshots");
            fs::create_dir_all(&snaps).unwrap();
            for i in 0..25 {
                let d = snaps.join(format!("2026-01-{:02}T00-00-00Z", i + 1));
                fs::create_dir_all(&d).unwrap();
                fs::write(d.join("SOUL.md"), "s").unwrap();
            }
            prune_snapshots(&snaps).unwrap();
            let c = fs::read_dir(&snaps).unwrap().filter_map(|e| e.ok()).filter(|e| e.path().is_dir()).count();
            assert!(c <= MAX_SNAPSHOTS);
        });
    }

}
