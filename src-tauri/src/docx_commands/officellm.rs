use std::fs;
use std::process::Command;

use base64::engine::general_purpose::STANDARD as BASE64;
use base64::Engine;

use super::cache::{evict_lru, fnv1a, get_cache_dir};
use super::conversion::temp_prefix;
use crate::officellm::detect::default_bin_path;

// ── officellm to-pdf 转换（DOCX 专用）────────────────────────────────────────

/// 使用 ~/.officellm/bin/officellm to-pdf 将 DOCX 转为 PDF。
/// 同步阻塞，在 spawn_blocking 线程池中执行。
pub(super) fn convert_docx_via_officellm(app: tauri::AppHandle, data_url: String) -> Result<String, String> {
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
        let pdf = fs::read(&cached_path).map_err(|e| format!("读取磁盘缓存失败: {e}"))?;
        // 写回刷新 mtime，标记为"最近使用"
        let _ = fs::write(&cached_path, &pdf);
        log::info!("[office-preview] docx L2 cache hit: {hash}");
        return Ok(format!("data:application/pdf;base64,{}", BASE64.encode(&pdf)));
    }

    // ── 3. 写临时 DOCX 文件 ─────────────────────────────────────────────────────
    let prefix = temp_prefix();
    let tmp = std::env::temp_dir();
    let input_path = tmp.join(format!("{prefix}-input.docx"));
    let output_path = tmp.join(format!("{prefix}-output.pdf"));

    fs::write(&input_path, &bytes).map_err(|e| format!("写入临时文件失败: {e}"))?;

    // ── 4. 调用 officellm to-pdf（通过统一的 detect 模块获取路径）──────────────
    let bin = default_bin_path().ok_or("无法获取用户 home 目录")?;

    if !bin.exists() {
        let _ = fs::remove_file(&input_path);
        return Err(format!(
            "未找到 officellm，请先安装：{}\n可访问 https://github.com/nicepkg/officellm 了解详情",
            bin.display()
        ));
    }

    let input_str = input_path.to_string_lossy().into_owned();
    let output_str = output_path.to_string_lossy().into_owned();

    log::info!("[office-preview] officellm to-pdf -i {input_str} -o {output_str}");
    let result = Command::new(&bin)
        .args(["to-pdf", "-i", &input_str, "-o", &output_str])
        .output();

    // 立即清理临时输入文件
    let _ = fs::remove_file(&input_path);

    let out = result.map_err(|e| format!("调用 officellm 失败: {e}"))?;

    if !out.status.success() {
        let _ = fs::remove_file(&output_path);
        let stderr = String::from_utf8_lossy(&out.stderr);
        return Err(format!("officellm to-pdf 转换失败:\n{stderr}"));
    }

    // ── 5. 写入磁盘缓存（LRU 驱逐后再写）──────────────────────────────────────
    evict_lru(&cache_dir);
    let pdf_bytes =
        fs::read(&output_path).map_err(|e| format!("读取生成的 PDF 失败: {e}"))?;
    let _ = fs::remove_file(&output_path);
    let _ = fs::write(&cached_path, &pdf_bytes);

    log::info!("[office-preview] docx converted via officellm, cached as {hash}");
    Ok(format!(
        "data:application/pdf;base64,{}",
        BASE64.encode(&pdf_bytes)
    ))
}
