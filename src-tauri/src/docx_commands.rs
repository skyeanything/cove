use base64::Engine;
use base64::engine::general_purpose::STANDARD as BASE64;
use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;
use tauri::Manager;

const MAX_CACHE_FILES: usize = 50;

// ── 工具函数 ──────────────────────────────────────────────────────────────────

/// FNV-1a 64 位哈希，用于将文档字节内容映射为缓存文件名
fn fnv1a(data: &[u8]) -> String {
    let mut h: u64 = 14_695_981_039_346_656_037;
    for &b in data {
        h ^= b as u64;
        h = h.wrapping_mul(1_099_511_628_211);
    }
    format!("{h:016x}")
}

/// 获取（并自动创建）PDF 磁盘缓存目录：<app_data_dir>/pdf-cache/
fn get_cache_dir(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("获取 app_data_dir 失败: {e}"))?
        .join("pdf-cache");
    fs::create_dir_all(&dir).map_err(|e| format!("创建缓存目录失败: {e}"))?;
    Ok(dir)
}

/// LRU 驱逐：若目录内 PDF 数量 >= MAX_CACHE_FILES，按 mtime 删除最老的
fn evict_lru(dir: &Path) {
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

/// 生成唯一临时文件前缀（微秒时间戳），避免并发转换时文件名冲突
fn temp_prefix() -> String {
    use std::time::{SystemTime, UNIX_EPOCH};
    let micros = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_micros())
        .unwrap_or(0);
    format!("cove-{micros}")
}

/// 在给定候选 app 列表中找到第一个已安装的（返回 'static str）
fn find_office_app(candidates: &[&'static str]) -> Option<&'static str> {
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
fn convert_to_pdf(
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
    // 关键教训汇总：
    //   • AppleScript `open (POSIX file)` → Keynote 崩溃（沙箱拒绝 /var/folders/T/）
    //   • shell open -j -g → 文件正常打开，但 Keynote documents 集合完全不可用
    //   • 解决方案：shell open 打开文件 + System Events 轮询窗口标题（绕开
    //     Keynote 的 documents API）+ `front document` 导出
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
    // System Events 读取 Keynote 进程的窗口标题，绕开 Keynote 的 documents API。
    // 窗口标题匹配唯一前缀 → 文档已加载 → 对 front document 执行 export。
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
        // 把 AppleScript 日志也带给前端，便于直接看到诊断信息
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

// ── officellm to-pdf 转换（DOCX 专用）────────────────────────────────────────

/// 使用 ~/.officellm/bin/officellm to-pdf 将 DOCX 转为 PDF。
/// 同步阻塞，在 spawn_blocking 线程池中执行。
fn convert_docx_via_officellm(app: tauri::AppHandle, data_url: String) -> Result<String, String> {
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

    // ── 4. 调用 officellm to-pdf ────────────────────────────────────────────────
    let bin = dirs::home_dir()
        .ok_or("无法获取用户 home 目录")?
        .join(".officellm/bin/officellm");

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

// ── Tauri 命令（async：在线程池执行，不阻塞主线程）──────────────────────────

/// 将 DOCX data-URL 通过 officellm to-pdf 转换为 PDF data-URL。
/// 使用 spawn_blocking 在 Tokio 线程池执行，IPC 主线程始终响应。
#[tauri::command]
pub async fn docx_to_pdf(
    app: tauri::AppHandle,
    data_url: String,
) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || {
        convert_docx_via_officellm(app, data_url)
    })
    .await
    .map_err(|e| format!("后台线程错误: {e}"))?
}

/// 将 PPTX data-URL 通过系统 Keynote（或 Pages）静默转换为 PDF data-URL。
/// 优先使用 Keynote（原生支持 PPTX，还原度更高），不存在时回退到 Pages。
#[tauri::command]
pub async fn pptx_to_pdf(
    app: tauri::AppHandle,
    data_url: String,
) -> Result<String, String> {
    let office_app = find_office_app(&["Keynote", "Pages"])
        .ok_or_else(|| "未找到 Keynote 或 Pages，请从 App Store 安装".to_string())?;

    tauri::async_runtime::spawn_blocking(move || {
        convert_to_pdf(app, data_url, "pptx", office_app)
    })
    .await
    .map_err(|e| format!("后台线程错误: {e}"))?
}
