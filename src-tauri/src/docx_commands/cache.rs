use std::fs;
use std::path::{Path, PathBuf};

pub(super) const MAX_CACHE_FILES: usize = 50;

/// FNV-1a 64 位哈希，用于将文档字节内容映射为缓存文件名
pub(super) fn fnv1a(data: &[u8]) -> String {
    let mut h: u64 = 14_695_981_039_346_656_037;
    for &b in data {
        h ^= b as u64;
        h = h.wrapping_mul(1_099_511_628_211);
    }
    format!("{h:016x}")
}

/// 获取（并自动创建）PDF 磁盘缓存目录：<app_data_dir>/pdf-cache/
pub(super) fn get_cache_dir(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    use tauri::Manager;
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("获取 app_data_dir 失败: {e}"))?
        .join("pdf-cache");
    fs::create_dir_all(&dir).map_err(|e| format!("创建缓存目录失败: {e}"))?;
    Ok(dir)
}

/// LRU 驱逐：若目录内 PDF 数量 >= MAX_CACHE_FILES，按 mtime 删除最老的
pub(super) fn evict_lru(dir: &Path) {
    let Ok(entries) = fs::read_dir(dir) else {
        return;
    };
    let mut files: Vec<(PathBuf, std::time::SystemTime)> = entries
        .filter_map(|e| e.ok())
        .filter(|e| e.path().extension().map_or(false, |x| x == "pdf"))
        .filter_map(|e| {
            let mtime = e.metadata().ok()?.modified().ok()?;
            Some((e.path(), mtime))
        })
        .collect();

    if files.len() < MAX_CACHE_FILES {
        return;
    }
    files.sort_by_key(|(_, t)| *t);
    let to_remove = files.len() - MAX_CACHE_FILES + 1;
    for (path, _) in files.iter().take(to_remove) {
        let _ = fs::remove_file(path);
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs::File;
    use std::io::Write;
    use std::time::{Duration, SystemTime};
    use tempfile::tempdir;

    // ── fnv1a ────────────────────────────────────────────────────────────────

    #[test]
    fn fnv1a_empty_input() {
        // FNV-1a offset basis = 0xcbf29ce484222325
        assert_eq!(fnv1a(b""), "cbf29ce484222325");
    }

    #[test]
    fn fnv1a_known_value() {
        // Well-known FNV-1a 64-bit hash of "hello"
        assert_eq!(fnv1a(b"hello"), "a430d84680aabd0b");
    }

    #[test]
    fn fnv1a_output_is_16_char_hex() {
        let h = fnv1a(b"test data");
        assert_eq!(h.len(), 16);
        assert!(h.chars().all(|c| c.is_ascii_hexdigit()));
    }

    #[test]
    fn fnv1a_deterministic() {
        let input = b"determinism check";
        assert_eq!(fnv1a(input), fnv1a(input));
    }

    #[test]
    fn fnv1a_different_inputs_differ() {
        assert_ne!(fnv1a(b"alpha"), fnv1a(b"beta"));
    }

    // ── evict_lru ────────────────────────────────────────────────────────────

    #[test]
    fn evict_lru_no_eviction_below_threshold() {
        let dir = tempdir().unwrap();
        for i in 0..5 {
            File::create(dir.path().join(format!("{i}.pdf"))).unwrap();
        }
        evict_lru(dir.path());
        let count = fs::read_dir(dir.path())
            .unwrap()
            .filter_map(|e| e.ok())
            .count();
        assert_eq!(count, 5);
    }

    #[test]
    fn evict_lru_removes_oldest_at_threshold() {
        let dir = tempdir().unwrap();
        let base = SystemTime::UNIX_EPOCH + Duration::from_secs(1_000_000);
        // Create MAX_CACHE_FILES PDFs with staggered mtimes
        for i in 0..MAX_CACHE_FILES {
            let path = dir.path().join(format!("{i:04}.pdf"));
            let mut f = File::create(&path).unwrap();
            f.write_all(b"pdf").unwrap();
            let mtime = base + Duration::from_secs(i as u64);
            let times = fs::FileTimes::new().set_modified(mtime);
            f.set_times(times).unwrap();
        }
        evict_lru(dir.path());
        // Should have removed 1 file (the oldest)
        let remaining: Vec<_> = fs::read_dir(dir.path())
            .unwrap()
            .filter_map(|e| e.ok())
            .collect();
        assert_eq!(remaining.len(), MAX_CACHE_FILES - 1);
        // The oldest file (0000.pdf) should be gone
        assert!(!dir.path().join("0000.pdf").exists());
    }

    #[test]
    fn evict_lru_ignores_non_pdf_files() {
        let dir = tempdir().unwrap();
        for i in 0..MAX_CACHE_FILES {
            File::create(dir.path().join(format!("{i}.txt"))).unwrap();
        }
        evict_lru(dir.path());
        let count = fs::read_dir(dir.path())
            .unwrap()
            .filter_map(|e| e.ok())
            .count();
        assert_eq!(count, MAX_CACHE_FILES);
    }

    #[test]
    fn evict_lru_handles_nonexistent_directory() {
        let dir = tempdir().unwrap();
        let bad_path = dir.path().join("does-not-exist");
        evict_lru(&bad_path); // should not panic
    }
}
