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
