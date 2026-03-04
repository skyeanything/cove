//! SOUL file management: read, write, snapshot for ~/.cove/SOUL*.md

use std::fs;
use std::path::PathBuf;

use crate::soul_defaults::{DEFAULT_SOUL, DEFAULT_SOUL_PRIVATE};

const ALLOWED_FILES: [&str; 2] = ["SOUL.md", "SOUL.private.md"];
const MAX_SNAPSHOTS: usize = 20;

fn home_dir() -> Option<PathBuf> {
    #[cfg(unix)]
    { return std::env::var_os("HOME").map(PathBuf::from); }
    #[cfg(windows)]
    { return std::env::var_os("USERPROFILE").map(PathBuf::from); }
    #[cfg(not(any(unix, windows)))]
    { None }
}

fn cove_dir() -> Result<PathBuf, String> {
    let home = home_dir().ok_or("Cannot determine home directory")?;
    Ok(home.join(".cove"))
}

fn validate_file_name(name: &str) -> Result<(), String> {
    if !ALLOWED_FILES.contains(&name) {
        return Err(format!(
            "Invalid SOUL file name: {name}. Allowed: {}",
            ALLOWED_FILES.join(", ")
        ));
    }
    Ok(())
}

fn ensure_soul_files(cove: &PathBuf) -> Result<(), String> {
    fs::create_dir_all(cove)
        .map_err(|e| format!("Failed to create ~/.cove: {e}"))?;

    let soul = cove.join("SOUL.md");
    if !soul.exists() {
        log::info!("[SOUL] initializing SOUL.md (first run)");
        fs::write(&soul, DEFAULT_SOUL)
            .map_err(|e| format!("Failed to initialize SOUL.md: {e}"))?;
    }
    let private = cove.join("SOUL.private.md");
    if !private.exists() {
        log::info!("[SOUL] initializing SOUL.private.md (first run)");
        fs::write(&private, DEFAULT_SOUL_PRIVATE)
            .map_err(|e| format!("Failed to initialize SOUL.private.md: {e}"))?;
    }
    Ok(())
}

/// Read a SOUL file. Initializes defaults on first run.
#[tauri::command]
pub fn read_soul(file_name: String) -> Result<String, String> {
    validate_file_name(&file_name)?;
    let cove = cove_dir()?;
    ensure_soul_files(&cove)?;

    let path = cove.join(&file_name);
    log::info!("[SOUL] read: {file_name}");
    fs::read_to_string(&path)
        .map_err(|e| format!("Failed to read {file_name}: {e}"))
}

/// Write content to a SOUL file.
#[tauri::command]
pub fn write_soul(file_name: String, content: String) -> Result<(), String> {
    validate_file_name(&file_name)?;
    let cove = cove_dir()?;
    fs::create_dir_all(&cove)
        .map_err(|e| format!("Failed to create ~/.cove: {e}"))?;

    let path = cove.join(&file_name);
    log::info!("[SOUL] write: {file_name} ({} bytes)", content.len());
    fs::write(&path, &content)
        .map_err(|e| format!("Failed to write {file_name}: {e}"))
}

/// Snapshot current SOUL files to soul-history/, prune to MAX_SNAPSHOTS.
/// Returns the snapshot timestamp used.
#[tauri::command]
pub fn snapshot_soul() -> Result<String, String> {
    let cove = cove_dir()?;
    ensure_soul_files(&cove)?;

    let history = cove.join("soul-history");
    fs::create_dir_all(&history)
        .map_err(|e| format!("Failed to create soul-history: {e}"))?;

    let ts = chrono::Utc::now().format("%Y-%m-%dT%H-%M-%SZ").to_string();

    for name in &ALLOWED_FILES {
        let src = cove.join(name);
        if src.exists() {
            let stem = name.trim_end_matches(".md");
            let dst = history.join(format!("{stem}-{ts}.md"));
            fs::copy(&src, &dst)
                .map_err(|e| format!("Failed to snapshot {name}: {e}"))?;
        }
    }

    log::info!("[SOUL] snapshot saved: {ts}");
    prune_snapshots(&history)?;
    Ok(ts)
}

fn prune_snapshots(history: &PathBuf) -> Result<(), String> {
    let mut entries: Vec<_> = fs::read_dir(history)
        .map_err(|e| format!("Failed to read soul-history: {e}"))?
        .filter_map(|e| e.ok())
        .filter(|e| e.path().extension().map_or(false, |ext| ext == "md"))
        .collect();

    if entries.len() <= MAX_SNAPSHOTS {
        return Ok(());
    }

    entries.sort_by(|a, b| {
        let ta = a.metadata().and_then(|m| m.modified()).unwrap_or(std::time::SystemTime::UNIX_EPOCH);
        let tb = b.metadata().and_then(|m| m.modified()).unwrap_or(std::time::SystemTime::UNIX_EPOCH);
        tb.cmp(&ta)
    });

    for entry in entries.iter().skip(MAX_SNAPSHOTS) {
        let _ = fs::remove_file(entry.path());
    }
    log::info!("[SOUL] pruned snapshots to {MAX_SNAPSHOTS}");
    Ok(())
}

/// Extract the "## My DNA" section from SOUL.md content.
pub fn extract_dna_section(content: &str) -> &str {
    let start = match content.find("## My DNA") {
        Some(s) => s,
        None => return "",
    };
    let rest = &content[start..];
    let end = rest[9..] // skip "## My DNA"
        .find("\n## ")
        .map(|i| start + 9 + i)
        .unwrap_or(content.len());
    &content[start..end]
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::test_util::with_home;

    #[test]
    fn validate_allows_soul_files() {
        assert!(validate_file_name("SOUL.md").is_ok());
        assert!(validate_file_name("SOUL.private.md").is_ok());
    }

    #[test]
    fn validate_rejects_other_files() {
        assert!(validate_file_name("other.md").is_err());
        assert!(validate_file_name("../SOUL.md").is_err());
        assert!(validate_file_name("").is_err());
    }

    #[test]
    fn first_run_initializes_defaults() {
        with_home(|home| {
            let content = read_soul("SOUL.md".into()).unwrap();
            assert!(content.contains("# Who I Am"));
            assert!(content.contains("## My DNA"));

            let private = read_soul("SOUL.private.md".into()).unwrap();
            assert!(private.contains("# Private"));

            assert!(home.join(".cove/SOUL.md").is_file());
            assert!(home.join(".cove/SOUL.private.md").is_file());
        });
    }

    #[test]
    fn write_then_read_roundtrip() {
        with_home(|_| {
            let content = "# Custom SOUL\n\nModified content.";
            write_soul("SOUL.md".into(), content.into()).unwrap();
            assert_eq!(read_soul("SOUL.md".into()).unwrap(), content);
        });
    }

    #[test]
    fn write_private_roundtrip() {
        with_home(|_| {
            let content = "# Private\n\nNew observations.";
            write_soul("SOUL.private.md".into(), content.into()).unwrap();
            assert_eq!(read_soul("SOUL.private.md".into()).unwrap(), content);
        });
    }

    #[test]
    fn snapshot_creates_history_files() {
        with_home(|home| {
            read_soul("SOUL.md".into()).unwrap();
            let ts = snapshot_soul().unwrap();
            let history = home.join(".cove/soul-history");
            assert!(history.is_dir());

            let names: Vec<String> = fs::read_dir(&history)
                .unwrap()
                .filter_map(|e| e.ok())
                .map(|f| f.file_name().to_string_lossy().into_owned())
                .collect();
            assert!(names.len() >= 2);
            assert!(names.iter().any(|n| n.contains(&ts)));
        });
    }

    #[test]
    fn snapshot_prunes_old_entries() {
        with_home(|home| {
            read_soul("SOUL.md".into()).unwrap();
            let history = home.join(".cove/soul-history");
            fs::create_dir_all(&history).unwrap();

            for i in 0..25 {
                let name = format!("SOUL-2026-01-{:02}T00-00-00Z.md", i + 1);
                fs::write(history.join(&name), "snapshot").unwrap();
            }
            prune_snapshots(&history).unwrap();

            let count = fs::read_dir(&history).unwrap().filter_map(|e| e.ok()).count();
            assert!(count <= MAX_SNAPSHOTS, "expected <= {MAX_SNAPSHOTS}, got {count}");
        });
    }

    #[test]
    fn extract_dna_section_works() {
        let dna = extract_dna_section(DEFAULT_SOUL);
        assert!(dna.starts_with("## My DNA"));
        assert!(dna.contains("I pursue understanding"));
        assert!(!dna.contains("## My Tendencies"));
    }

    #[test]
    fn extract_dna_returns_empty_for_missing() {
        assert_eq!(extract_dna_section("no dna here"), "");
    }

    #[test]
    fn write_rejects_invalid_file_name() {
        with_home(|_| {
            assert!(write_soul("bad.md".into(), "x".into()).is_err());
            assert!(read_soul("bad.md".into()).is_err());
        });
    }
}
