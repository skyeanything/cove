use std::fs;
use std::path::Path;
use std::process::Command;

use base64::engine::general_purpose::STANDARD as BASE64;
use base64::Engine;

use super::cache::{evict_lru, fnv1a, get_cache_dir};

/// 生成唯一临时文件前缀（微秒时间戳），避免并发转换时文件名冲突
pub(super) fn temp_prefix() -> String {
    use std::time::{SystemTime, UNIX_EPOCH};
    let micros = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_micros())
        .unwrap_or(0);
    format!("cove-{micros}")
}

/// 在给定候选 app 列表中找到第一个已安装的（返回 'static str）
pub(super) fn find_office_app(candidates: &[&'static str]) -> Option<&'static str> {
    for &app in candidates {
        let installed = [
            format!("/Applications/{app}.app"),
            format!("/System/Applications/{app}.app"),
        ]
        .iter()
        .any(|p| Path::new(p).exists());
        if installed {
            return Some(app);
        }
    }
    None
}

// ── 核心转换逻辑（同步阻塞，在 spawn_blocking 线程池中执行）─────────────────
//
// Pages 打开策略：用 `open -j -g -a <App> <file>` 走 NSWorkspace，
// 系统会正确授予沙箱文件访问权限；直接用 AppleScript open 会因
// 沙箱限制无法访问 /var/folders/.../T/ 中的文件（error -600）。
pub(super) fn convert_to_pdf(
    app: tauri::AppHandle,
    data_url: String,
    ext: &str,        // "docx" | "pptx"
    office_app: &str, // "Pages" | "Keynote"
) -> Result<String, String> {
    // ── 1. 解码文档 ───────────────────────────────────────────────────────────
    let b64 = data_url
        .splitn(2, ',')
        .nth(1)
        .ok_or("无效的 data URL")?;
    let bytes = BASE64
        .decode(b64)
        .map_err(|e| format!("Base64 解码失败: {e}"))?;

    // ── 2. L2 磁盘缓存命中检查 ────────────────────────────────────────────────
    let hash = fnv1a(&bytes);
    let cache_dir = get_cache_dir(&app)?;
    let cached_path = cache_dir.join(format!("{hash}.pdf"));

    if cached_path.exists() {
        let pdf = fs::read(&cached_path).map_err(|e| format!("读取磁盘缓存失败: {e}"))?;
        // 写回刷新 mtime，标记为"最近使用"
        let _ = fs::write(&cached_path, &pdf);
        return Ok(format!("data:application/pdf;base64,{}", BASE64.encode(&pdf)));
    }

    // ── 3. 写临时文件（唯一前缀避免并发冲突）────────────────────────────────
    let prefix = temp_prefix();
    let tmp = std::env::temp_dir();
    let input_path = tmp.join(format!("{prefix}-input.{ext}"));
    let output_path = tmp.join(format!("{prefix}-output.pdf"));
    let script_path = tmp.join(format!("{prefix}.applescript"));

    fs::write(&input_path, &bytes).map_err(|e| format!("写入临时文件失败: {e}"))?;

    let input_str = input_path.to_string_lossy().into_owned();
    let output_str = output_path.to_string_lossy().into_owned();

    // ── 4. 检查 App 是否已在运行（决定转换后是否退出）────────────────────────
    let was_running = Command::new("pgrep")
        .args(["-x", office_app])
        .output()
        .map(|o| o.status.success())
        .unwrap_or(true);
    log::info!("[office-preview] {office_app} was_running={was_running}");

    // ── 5. open -j -g：走 NSWorkspace，沙箱权限正确授予 ─────────────────────
    log::info!("[office-preview] open -j -g -a {office_app} {input_str}");
    let open_out = Command::new("open")
        .args(["-j", "-g", "-a", office_app, &input_str])
        .output()
        .map_err(|e| format!("调用 open 命令失败: {e}"))?;

    if !open_out.status.success() {
        let _ = fs::remove_file(&input_path);
        return Err(format!(
            "{office_app} 无法打开文件: {}",
            String::from_utf8_lossy(&open_out.stderr)
        ));
    }

    // ── 6. AppleScript：System Events 轮询窗口 → front document 导出 ─────────
    let script = format!(
        r#"log "[as] waiting for {office_app} window: {prefix}-input"
set docReady to false
set pollCount to 0
repeat 120 times
    set pollCount to pollCount + 1
    try
        tell application "System Events"
            tell process "{office_app}"
                set winNames to name of every window
            end tell
        end tell
        repeat with wn in winNames
            if wn contains "{prefix}" then
                set docReady to true
                exit repeat
            end if
        end repeat
    on error errMsg
        if pollCount mod 20 = 1 then
            log "[as] se_poll=" & pollCount & " error: " & errMsg
        end if
    end try
    if docReady then exit repeat
    delay 0.5
end repeat

if not docReady then
    error "等待 {office_app} 加载文档超时（60 秒），前缀: {prefix}"
end if

log "[as] window found (poll=" & pollCount & "), exporting front document..."
tell application "{office_app}"
    export front document to (POSIX file "{output_str}") as PDF
    close front document saving no
end tell
log "[as] export done"
"#
    );

    log::info!("[office-preview] running osascript ({office_app}, {ext})");
    fs::write(&script_path, script.as_bytes()).map_err(|e| format!("写入脚本失败: {e}"))?;

    let result = Command::new("osascript").arg(&script_path).output();

    // 立即清理临时输入文件和脚本
    let _ = fs::remove_file(&input_path);
    let _ = fs::remove_file(&script_path);

    let out = result.map_err(|e| format!("osascript 执行失败: {e}"))?;

    // AppleScript log 语句输出到 stderr，无论成败都打印到 Rust 日志
    let as_log = String::from_utf8_lossy(&out.stderr);
    let as_out = String::from_utf8_lossy(&out.stdout);
    if !as_out.trim().is_empty() {
        log::info!("[office-preview] osascript stdout: {}", as_out.trim());
    }
    if !as_log.trim().is_empty() {
        log::info!("[office-preview] osascript log:\n{}", as_log.trim());
    }

    // 若本次转换启动了 App，无论成败均在此退出，避免残留
    if !was_running {
        log::info!("[office-preview] quitting {office_app} (we launched it)");
        let _ = Command::new("osascript")
            .args(["-e", &format!("tell application \"{office_app}\" to quit")])
            .output();
    }

    if !out.status.success() {
        let _ = fs::remove_file(&output_path);
        return Err(format!("{office_app} 导出失败:\n{as_log}"));
    }

    // ── 7. 写入磁盘缓存（LRU 驱逐后再写）────────────────────────────────────
    evict_lru(&cache_dir);
    let pdf_bytes =
        fs::read(&output_path).map_err(|e| format!("读取生成的 PDF 失败: {e}"))?;
    let _ = fs::remove_file(&output_path);
    let _ = fs::write(&cached_path, &pdf_bytes);

    Ok(format!(
        "data:application/pdf;base64,{}",
        BASE64.encode(&pdf_bytes)
    ))
}
