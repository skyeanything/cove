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
    use tempfile::tempdir;

    // --- fnv1a ---

    #[test]
    fn fnv1a_empty_returns_offset_basis() {
        // FNV-1a 64-bit offset basis = 14695981039346656037 = 0xcbf29ce484222325
        assert_eq!(fnv1a(b""), "cbf29ce484222325");
    }

    #[test]
    fn fnv1a_known_input() {
        let h = fnv1a(b"hello");
        assert_eq!(h.len(), 16, "output must be 16 hex chars");
        // Determinism: same input always gives same output
        assert_eq!(h, fnv1a(b"hello"));
    }

    #[test]
    fn fnv1a_different_inputs_differ() {
        assert_ne!(fnv1a(b"hello"), fnv1a(b"world"));
    }

    #[test]
    fn fnv1a_output_is_hex() {
        let h = fnv1a(b"test data");
        assert!(h.chars().all(|c| c.is_ascii_hexdigit()));
        assert_eq!(h.len(), 16);
    }

    // --- evict_lru ---

    #[test]
    fn evict_lru_under_limit_keeps_all() {
        let dir = tempdir().unwrap();
        for i in 0..10 {
            File::create(dir.path().join(format!("{i}.pdf"))).unwrap();
        }
        evict_lru(dir.path());
        let count = fs::read_dir(dir.path())
            .unwrap()
            .filter_map(|e| e.ok())
            .count();
        assert_eq!(count, 10);
    }

    #[test]
    fn evict_lru_at_limit_removes_oldest() {
        let dir = tempdir().unwrap();
        // Create exactly MAX_CACHE_FILES PDFs
        for i in 0..MAX_CACHE_FILES {
            let p = dir.path().join(format!("{i:04}.pdf"));
            let mut f = File::create(&p).unwrap();
            writeln!(f, "pdf {i}").unwrap();
            // Small sleep to ensure distinct mtimes
            std::thread::sleep(std::time::Duration::from_millis(10));
        }
        evict_lru(dir.path());
        let remaining: Vec<_> = fs::read_dir(dir.path())
            .unwrap()
            .filter_map(|e| e.ok())
            .collect();
        assert!(remaining.len() < MAX_CACHE_FILES);
    }

    #[test]
    fn evict_lru_ignores_non_pdf() {
        let dir = tempdir().unwrap();
        for i in 0..MAX_CACHE_FILES {
            File::create(dir.path().join(format!("{i}.pdf"))).unwrap();
        }
        // Add non-PDF files — should not count toward limit
        File::create(dir.path().join("readme.txt")).unwrap();
        File::create(dir.path().join("data.docx")).unwrap();
        evict_lru(dir.path());
        // Non-PDF files must survive
        assert!(dir.path().join("readme.txt").exists());
        assert!(dir.path().join("data.docx").exists());
    }

    #[test]
    fn evict_lru_nonexistent_dir_no_panic() {
        let dir = tempdir().unwrap();
        let bogus = dir.path().join("does-not-exist");
        evict_lru(&bogus); // should not panic
    }
}
