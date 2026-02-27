use std::fs;
use std::process::Command;

use base64::engine::general_purpose::STANDARD as BASE64;
use base64::Engine;

use super::cache::{evict_lru, fnv1a, get_cache_dir};
use super::conversion::temp_prefix;

/// 查找 quarto CLI 二进制路径
fn find_quarto() -> Option<String> {
    // 优先使用 which 查找 PATH 中的 quarto
    if let Ok(out) = Command::new("which").arg("quarto").output() {
        if out.status.success() {
            let path = String::from_utf8_lossy(&out.stdout).trim().to_string();
            if !path.is_empty() {
                return Some(path);
            }
        }
    }
    // 回退到常见安装路径
    for candidate in ["/usr/local/bin/quarto", "/opt/homebrew/bin/quarto"] {
        if std::path::Path::new(candidate).exists() {
            return Some(candidate.to_string());
        }
    }
    None
}

/// 使用 Quarto CLI 将 QMD 转为 PDF。
/// 同步阻塞，在 spawn_blocking 线程池中执行。
pub(super) fn convert_qmd_via_quarto(
    app: tauri::AppHandle,
    data_url: String,
) -> Result<String, String> {
    // ── 1. 解码文档 ─────────────────────────────────────────────────────────────
    let b64 = data_url
        .splitn(2, ',')
        .nth(1)
        .ok_or("无效的 data URL")?;
    let bytes = BASE64
        .decode(b64)
        .map_err(|e| format!("Base64 解码失败: {e}"))?;

    // ── 2. L2 磁盘缓存命中检查 ──────────────────────────────────────────────────
    let hash = fnv1a(&bytes);
    let cache_dir = get_cache_dir(&app)?;
    let cached_path = cache_dir.join(format!("{hash}.pdf"));

    if cached_path.exists() {
        let pdf = fs::read(&cached_path)
            .map_err(|e| format!("读取磁盘缓存失败: {e}"))?;
        let _ = fs::write(&cached_path, &pdf);
        log::info!("[office-preview] qmd L2 cache hit: {hash}");
        return Ok(format!(
            "data:application/pdf;base64,{}",
            BASE64.encode(&pdf)
        ));
    }

    // ── 3. 写临时 QMD 文件 ─────────────────────────────────────────────────────
    let prefix = temp_prefix();
    let tmp = std::env::temp_dir();
    let input_path = tmp.join(format!("{prefix}-input.qmd"));
    let output_path = tmp.join(format!("{prefix}-input.pdf"));

    fs::write(&input_path, &bytes)
        .map_err(|e| format!("写入临时文件失败: {e}"))?;

    // ── 4. 调用 quarto render ────────────────────────────────────────────────────
    let quarto_bin = find_quarto().ok_or_else(|| {
        "未找到 Quarto CLI，请先安装：https://quarto.org/docs/get-started/".to_string()
    })?;

    let input_str = input_path.to_string_lossy().into_owned();

    // quarto render 默认将输出写到与输入同目录、同名但扩展名为 .pdf 的文件
    // --output 只接受纯文件名（不可含路径），所以这里不指定 --output
    log::info!("[office-preview] quarto render {input_str} --to pdf");
    let result = Command::new(&quarto_bin)
        .args(["render", &input_str, "--to", "pdf"])
        .output();

    let _ = fs::remove_file(&input_path);

    let out = result.map_err(|e| format!("调用 quarto 失败: {e}"))?;

    if !out.status.success() {
        let _ = fs::remove_file(&output_path);
        let stderr = String::from_utf8_lossy(&out.stderr);
        return Err(format!("quarto render 转换失败:\n{stderr}"));
    }

    // ── 5. 写入磁盘缓存 ────────────────────────────────────────────────────────
    evict_lru(&cache_dir);
    let pdf_bytes = fs::read(&output_path)
        .map_err(|e| format!("读取生成的 PDF 失败: {e}"))?;
    let _ = fs::remove_file(&output_path);
    let _ = fs::write(&cached_path, &pdf_bytes);

    log::info!("[office-preview] qmd converted via quarto, cached as {hash}");
    Ok(format!(
        "data:application/pdf;base64,{}",
        BASE64.encode(&pdf_bytes)
    ))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn find_quarto_returns_valid_path_or_none() {
        match find_quarto() {
            Some(path) => {
                assert!(!path.is_empty());
                assert!(std::path::Path::new(&path).exists());
            }
            None => {} // quarto not installed — acceptable
        }
    }
}
