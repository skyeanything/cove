//! officellm 文档操作模块：检测、CLI 模式、Server 模式。

pub mod cli;
pub mod detect;
pub mod env;
pub mod init;
pub mod resolve;
pub mod server;
pub mod types;

use types::{CommandResult, DetectResult, SessionInfo};

/// Compute the correct `OFFICELLM_HOME` for the current binary resolution.
fn compute_home(app: &tauri::AppHandle) -> Result<std::path::PathBuf, String> {
    let (_, is_bundled) = resolve::resolve_bin().ok_or("未找到 officellm")?;
    resolve::resolve_home(is_bundled, app)
}

// ── Tauri 命令 ──────────────────────────────────────────────────────────────

/// 检测 officellm 是否已安装
#[tauri::command]
pub fn officellm_detect() -> DetectResult {
    detect::detect()
}

/// 执行 officellm 命令：有活跃 session 时走 Server 模式，否则走 CLI 模式
#[tauri::command]
pub async fn officellm_call(
    app: tauri::AppHandle,
    cmd: String,
    args: Vec<String>,
) -> Result<CommandResult, String> {
    let home = compute_home(&app)?;
    tauri::async_runtime::spawn_blocking(move || {
        if server::has_session() {
            server::call(&cmd, &args)
        } else {
            cli::call(&cmd, &args, &home)
        }
    })
    .await
    .map_err(|e| format!("后台线程错误: {e}"))?
}

/// Server 模式：打开文档
#[tauri::command]
pub async fn officellm_open(app: tauri::AppHandle, path: String) -> Result<(), String> {
    let home = compute_home(&app)?;
    tauri::async_runtime::spawn_blocking(move || server::open(&path, &home))
        .await
        .map_err(|e| format!("后台线程错误: {e}"))?
}

/// Server 模式：保存文档
#[tauri::command]
pub async fn officellm_save(path: Option<String>) -> Result<CommandResult, String> {
    tauri::async_runtime::spawn_blocking(move || server::save(path.as_deref()))
        .await
        .map_err(|e| format!("后台线程错误: {e}"))?
}

/// Server 模式：关闭会话
#[tauri::command]
pub async fn officellm_close() -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(server::close)
        .await
        .map_err(|e| format!("后台线程错误: {e}"))?
}

/// 查询 Server 会话状态
#[tauri::command]
pub fn officellm_status() -> Result<Option<SessionInfo>, String> {
    server::status()
}

/// 诊断外部依赖状态（强制 CLI 模式），并在 data 中注入 home 路径
#[tauri::command]
pub async fn officellm_doctor(app: tauri::AppHandle) -> Result<CommandResult, String> {
    let home = compute_home(&app)?;
    let home_str = home.to_string_lossy().to_string();
    let mut result = tauri::async_runtime::spawn_blocking(move || {
        cli::call("doctor", &[], &home)
    })
    .await
    .map_err(|e| format!("后台线程错误: {e}"))??;

    // 注入 home 路径到 data 对象
    if let serde_json::Value::Object(ref mut map) = result.data {
        map.insert("home".into(), serde_json::Value::String(home_str));
    }
    Ok(result)
}

/// 首次使用时初始化 officellm home 目录
#[tauri::command]
pub async fn officellm_init(app: tauri::AppHandle) -> Result<(), String> {
    let (bin, _) = resolve::resolve_bin()
        .ok_or("officellm binary not found")?;
    let home = resolve::officellm_home(&app)?;
    tauri::async_runtime::spawn_blocking(move || {
        init::ensure_initialized(&bin, &home)
    })
    .await
    .map_err(|e| format!("后台线程错误: {e}"))?
}
