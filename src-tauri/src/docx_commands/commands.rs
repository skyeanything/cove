use super::conversion::{convert_to_pdf, find_office_app};
use super::officellm::convert_docx_via_officellm;
use super::qmd::convert_qmd_via_quarto;

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

/// 将 QMD data-URL 通过 Quarto CLI 转换为 PDF data-URL。
#[tauri::command]
pub async fn qmd_to_pdf(
    app: tauri::AppHandle,
    data_url: String,
) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || {
        convert_qmd_via_quarto(app, data_url)
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
