//! Generic sidecar binary resolution.
//!
//! All bundled CLI tools (officellm, pdftoppm, pdftotext, quarto, lua) live next
//! to the main executable. This module provides helpers to locate them and to
//! build a PATH that includes the sidecar directory.

use std::path::PathBuf;

/// Target triple baked in at compile time (e.g. `aarch64-apple-darwin`).
const TARGET_TRIPLE: &str = env!("TARGET");

/// Directory containing the main executable (and all sidecar binaries).
pub fn sidecar_dir() -> Option<PathBuf> {
    std::env::current_exe().ok()?.parent().map(|p| p.to_path_buf())
}

/// Resolve a sidecar binary by name.
///
/// Search order:
/// 1. `{exe_dir}/{name}-{triple}` (Tauri dev mode)
/// 2. `{exe_dir}/{name}` (bundled .app)
/// 3. `src-tauri/binaries/{name}-{triple}` (dev fallback, debug only)
pub fn resolve(name: &str) -> Option<PathBuf> {
    let exe_dir = std::env::current_exe().ok()?.parent()?.to_path_buf();

    // Dev / unbundled: name-aarch64-apple-darwin
    let with_triple = exe_dir.join(format!("{name}-{TARGET_TRIPLE}"));
    if with_triple.exists() {
        return Some(with_triple);
    }

    // Bundled .app: plain name
    let plain = exe_dir.join(name);
    if plain.exists() {
        return Some(plain);
    }

    // Dev fallback: src-tauri/binaries/
    #[cfg(debug_assertions)]
    {
        let dev_bin = std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
            .join("binaries")
            .join(format!("{name}-{TARGET_TRIPLE}"));
        if dev_bin.exists() {
            return Some(dev_bin);
        }
    }

    None
}

/// Build a PATH string with sidecar directories prepended.
///
/// Used when spawning subprocesses that need to find bundled tools
/// (e.g. officellm needs pdftoppm/pdftotext on its PATH).
///
/// In production the exe dir contains all sidecar binaries. In dev mode
/// (`tauri dev`), Tauri does not copy externalBin to `target/debug/`, so
/// we also include `src-tauri/binaries/` as a fallback.
pub fn tools_path() -> String {
    let mut dirs: Vec<String> = Vec::new();

    if let Some(dir) = sidecar_dir() {
        dirs.push(dir.to_string_lossy().into_owned());
    }

    // Dev fallback: src-tauri/binaries/ (where pull scripts place binaries)
    #[cfg(debug_assertions)]
    {
        let dev_bin = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("binaries");
        if dev_bin.is_dir() {
            dirs.push(dev_bin.to_string_lossy().into_owned());
        }
    }

    let current = std::env::var("PATH").unwrap_or_default();
    if dirs.is_empty() {
        current
    } else {
        format!("{}:{current}", dirs.join(":"))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn target_triple_not_empty() {
        assert!(!TARGET_TRIPLE.is_empty());
    }

    #[test]
    fn sidecar_dir_returns_some() {
        // In test environment, current_exe() should always succeed.
        assert!(sidecar_dir().is_some());
    }

    #[test]
    fn tools_path_contains_current_path() {
        let path = tools_path();
        let current = std::env::var("PATH").unwrap_or_default();
        assert!(path.contains(&current));
    }

    #[test]
    fn tools_path_prepends_sidecar_dir() {
        let path = tools_path();
        if let Some(dir) = sidecar_dir() {
            assert!(path.starts_with(&dir.to_string_lossy().to_string()));
        }
    }

    #[test]
    fn resolve_returns_none_for_nonexistent() {
        assert!(resolve("nonexistent-binary-12345").is_none());
    }

    #[test]
    fn tools_path_includes_dev_binaries_dir() {
        let path = tools_path();
        let dev_bin = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("binaries");
        if dev_bin.is_dir() {
            assert!(
                path.contains(&dev_bin.to_string_lossy().to_string()),
                "tools_path should include src-tauri/binaries/ in debug builds"
            );
        }
    }
}
