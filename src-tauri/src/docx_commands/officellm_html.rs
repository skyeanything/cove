use std::fs;
use std::process::Command;

use super::cache::{fnv1a, get_cache_dir};
use super::conversion::temp_prefix;
use crate::officellm::{env, resolve};

// ── officellm to-html 转换（DOCX 专用，无需 LibreOffice）────────────────────

/// 使用 officellm to-html 将 DOCX 转为 HTML 字符串。
/// 不依赖 LibreOffice / Quarto / Typst，纯内置转换，速度快。
/// 同步阻塞，在 spawn_blocking 线程池中执行。
pub(super) fn convert_docx_to_html(
    app: tauri::AppHandle,
    data_url: String,
) -> Result<String, String> {
    use base64::engine::general_purpose::STANDARD as BASE64;
    use base64::Engine;

    // ── 1. 解码文档 ─────────────────────────────────────────────────────────
    let b64 = data_url
        .splitn(2, ',')
        .nth(1)
        .ok_or("无效的 data URL")?;
    let bytes = BASE64
        .decode(b64)
        .map_err(|e| format!("Base64 解码失败: {e}"))?;

    // ── 2. L2 磁盘缓存命中检查 ──────────────────────────────────────────────
    let hash = fnv1a(&bytes);
    let cache_dir = get_cache_dir(&app)?;
    let cached_path = cache_dir.join(format!("{hash}.html"));

    if cached_path.exists() {
        let html = fs::read_to_string(&cached_path)
            .map_err(|e| format!("读取磁盘缓存失败: {e}"))?;
        // 刷新 mtime，标记为"最近使用"
        let _ = fs::write(&cached_path, html.as_bytes());
        log::info!("[office-preview] docx HTML L2 cache hit: {hash}");
        return Ok(html);
    }

    // ── 3. 写临时 DOCX 文件 ─────────────────────────────────────────────────
    let prefix = temp_prefix();
    let tmp = std::env::temp_dir();
    let input_path = tmp.join(format!("{prefix}-input.docx"));
    let output_path = tmp.join(format!("{prefix}-output.html"));

    fs::write(&input_path, &bytes).map_err(|e| format!("写入临时文件失败: {e}"))?;

    // ── 4. 调用 officellm to-html ───────────────────────────────────────────
    let (bin, is_bundled) = resolve::resolve_bin().ok_or_else(|| {
        let _ = fs::remove_file(&input_path);
        "未找到 officellm".to_string()
    })?;
    let home = resolve::resolve_home(is_bundled, &app).map_err(|e| {
        let _ = fs::remove_file(&input_path);
        e
    })?;

    let input_str = input_path.to_string_lossy().into_owned();
    let output_str = output_path.to_string_lossy().into_owned();

    log::info!("[office-preview] officellm to-html -i {input_str} -o {output_str}");
    let mut cmd = Command::new(&bin);
    cmd.args(["to-html", "-i", &input_str, "-o", &output_str]);
    crate::officellm::env::apply_env(&mut cmd, &home);
    let result = cmd.output();

    // 立即清理临时输入文件
    let _ = fs::remove_file(&input_path);

    let out = result.map_err(|e| format!("调用 officellm 失败: {e}"))?;

    if !out.status.success() {
        let _ = fs::remove_file(&output_path);
        let stderr = String::from_utf8_lossy(&out.stderr);
        return Err(format!("officellm to-html 转换失败:\n{stderr}"));
    }

    // ── 5. 读取 HTML 输出 ────────────────────────────────────────────────────
    let html =
        fs::read_to_string(&output_path).map_err(|e| format!("读取生成的 HTML 失败: {e}"))?;
    let _ = fs::remove_file(&output_path);

    // ── 6. 写入磁盘缓存（HTML 文件较小，不做 LRU 驱逐）────────────────────
    let _ = fs::write(&cached_path, html.as_bytes());

    log::info!("[office-preview] docx converted to HTML via officellm, cached as {hash}");
    Ok(html)
}
