//! Legacy SOUL data migration: old flat structure -> new soul/ directory.

use std::fs;
use std::path::PathBuf;

/// Migrate old structure (~/.cove/SOUL.md etc.) to new (~/.cove/soul/).
pub fn migrate_legacy(cove: &PathBuf, soul: &PathBuf) -> Result<(), String> {
    let old_public = cove.join("SOUL.md");
    let old_private = cove.join("SOUL.private.md");
    let old_history = cove.join("soul-history");

    if old_public.exists() && !soul.join("SOUL.md").exists() {
        log::info!("[SOUL] migrating ~/.cove/SOUL.md -> soul/SOUL.md");
        let content = fs::read_to_string(&old_public)
            .map_err(|e| format!("Failed to read old SOUL.md: {e}"))?;
        let migrated = migrate_tendencies_to_disposition(&content);
        fs::write(soul.join("SOUL.md"), &migrated)
            .map_err(|e| format!("Failed to write soul/SOUL.md: {e}"))?;
        let _ = fs::remove_file(&old_public);
    }

    if old_private.exists() {
        let priv_dir = soul.join("private");
        fs::create_dir_all(&priv_dir)
            .map_err(|e| format!("Failed to create soul/private: {e}"))?;
        let obs_path = priv_dir.join("observations.md");
        if !obs_path.exists() {
            log::info!("[SOUL] migrating SOUL.private.md -> soul/private/observations.md");
            let content = fs::read_to_string(&old_private)
                .map_err(|e| format!("Failed to read old SOUL.private.md: {e}"))?;
            let observations = extract_observations_from_legacy(&content);
            if !observations.is_empty() {
                fs::write(&obs_path, &observations)
                    .map_err(|e| format!("Failed to write observations.md: {e}"))?;
            }
        }
        let _ = fs::remove_file(&old_private);
    }

    if old_history.exists() && old_history.is_dir() {
        let snap_dir = soul.join("snapshots");
        fs::create_dir_all(&snap_dir)
            .map_err(|e| format!("Failed to create soul/snapshots: {e}"))?;
        if let Ok(entries) = fs::read_dir(&old_history) {
            for entry in entries.filter_map(|e| e.ok()) {
                let dst = snap_dir.join(entry.file_name());
                if !dst.exists() {
                    let _ = fs::copy(entry.path(), &dst);
                }
            }
        }
        let _ = fs::remove_dir_all(&old_history);
        log::info!("[SOUL] migrated soul-history/ -> soul/snapshots/");
    }

    Ok(())
}

/// Migrate old "## My Tendencies" section to Disposition + Style split.
fn migrate_tendencies_to_disposition(content: &str) -> String {
    if content.contains("## My Disposition") {
        return content.to_string();
    }
    if !content.contains("## My Tendencies") {
        return content.to_string();
    }
    content.replace(
        "## My Tendencies",
        "## My Disposition\n\nHigh inertia. Meditation cannot delete or rewrite entries.\nMeditation can only ADD contextual annotations per entry.\n",
    )
}

/// Extract observation bullet lines from legacy SOUL.private.md format.
fn extract_observations_from_legacy(content: &str) -> String {
    let lines: Vec<&str> = content
        .lines()
        .filter(|l| l.trim().starts_with("- ") || l.trim().starts_with("### "))
        .collect();
    if lines.is_empty() {
        String::new()
    } else {
        lines.join("\n") + "\n"
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::test_util::with_home;
    use crate::soul_commands::read_soul;

    #[test]
    fn migrate_legacy_structure() {
        with_home(|home| {
            let cove = home.join(".cove");
            std::fs::create_dir_all(&cove).unwrap();
            std::fs::write(
                cove.join("SOUL.md"),
                "# Who I Am\n\n## My Tendencies\n- direct\n\n## Where I'm Growing\nLearning",
            )
            .unwrap();
            std::fs::write(
                cove.join("SOUL.private.md"),
                "# Private\n\n## Active Observations\n### 2026-03-04\n- obs 1\n\n## Internalized\n",
            )
            .unwrap();
            let old_hist = cove.join("soul-history");
            std::fs::create_dir_all(&old_hist).unwrap();
            std::fs::write(old_hist.join("SOUL-2026-01-01T00-00-00Z.md"), "old").unwrap();

            let content = read_soul("SOUL.md".into()).unwrap();
            assert!(content.contains("## My Disposition"));
            assert!(!cove.join("SOUL.md").exists());
            assert!(!cove.join("SOUL.private.md").exists());
            assert!(!cove.join("soul-history").exists());

            let snaps_dir = cove.join("soul/snapshots");
            assert!(snaps_dir.exists());
        });
    }

    #[test]
    fn migrate_tendencies_to_disposition_works() {
        let content = "# Soul\n\n## My Tendencies\n- direct\n";
        let result = migrate_tendencies_to_disposition(content);
        assert!(result.contains("## My Disposition"));
        assert!(!result.contains("## My Tendencies"));
    }

    #[test]
    fn migrate_skips_already_migrated() {
        let content = "# Soul\n\n## My Disposition\n- direct\n";
        let result = migrate_tendencies_to_disposition(content);
        assert_eq!(result, content);
    }

    #[test]
    fn extract_observations_from_legacy_works() {
        let content = "# Private\n\n## Active Observations\n### 2026-03-04\n- obs 1\n- obs 2\n\n## Internalized\n- [trace]\n";
        let result = extract_observations_from_legacy(content);
        assert!(result.contains("### 2026-03-04"));
        assert!(result.contains("- obs 1"));
        assert!(result.contains("- [trace]"));
    }
}
