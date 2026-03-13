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

async fn call_cli_in_home(
    app: tauri::AppHandle,
    cmd: &str,
    args: Vec<String>,
) -> Result<CommandResult, String> {
    let home = compute_home(&app)?;
    let cmd = cmd.to_string();
    tauri::async_runtime::spawn_blocking(move || cli::call(&cmd, &args, &home, &home))
        .await
        .map_err(|e| format!("后台线程错误: {e}"))?
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
    workdir: String,
) -> Result<CommandResult, String> {
    let home = compute_home(&app)?;
    let wd = std::path::PathBuf::from(&workdir);
    tauri::async_runtime::spawn_blocking(move || {
        if server::has_session() {
            server::call(&cmd, &args)
        } else {
            cli::call(&cmd, &args, &home, &wd)
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

/// Server 模式：创建内存文档
#[tauri::command]
pub async fn officellm_create(
    app: tauri::AppHandle,
    params: serde_json::Value,
    workdir: String,
) -> Result<(), String> {
    let home = compute_home(&app)?;
    let wd = std::path::PathBuf::from(&workdir);
    tauri::async_runtime::spawn_blocking(move || server::create(&params, &home, &wd))
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
    let home_str = compute_home(&app)?.to_string_lossy().to_string();
    let mut result = call_cli_in_home(app, "doctor", Vec::new()).await?;

    // 注入 home 路径到 data 对象
    if let serde_json::Value::Object(ref mut map) = result.data {
        map.insert("home".into(), serde_json::Value::String(home_str));
    }
    Ok(result)
}

/// 列出所有可用 officellm CLI 命令（强制 CLI 模式，不依赖 workspace）
#[tauri::command]
pub async fn officellm_list_commands(
    app: tauri::AppHandle,
    category: Option<String>,
) -> Result<CommandResult, String> {
    let mut args = Vec::new();
    if let Some(category) = category {
        args.push("--category".to_string());
        args.push(category);
    }
    call_cli_in_home(app, "list-commands", args).await
}

/// 获取单个 officellm CLI 命令 schema（强制 CLI 模式，不依赖 workspace）
#[tauri::command]
pub async fn officellm_get_command_schema(
    app: tauri::AppHandle,
    command: String,
) -> Result<CommandResult, String> {
    call_cli_in_home(
        app,
        "get-command-schema",
        vec!["--command".to_string(), command],
    )
    .await
}

/// 首次使用时初始化 officellm home 目录。
///
/// 其他 officellm 操作（CLI spawn、server spawn、docx preview）会等待
/// 此命令完成后再执行二进制文件，避免 Gatekeeper 并发验证导致 EACCES。
#[tauri::command]
pub async fn officellm_init(app: tauri::AppHandle) -> Result<(), String> {
    if !init::mark_init_started() {
        init::wait_for_init();
        return init::init_result();
    }
    let result = async {
        let (bin, _) = resolve::resolve_bin().ok_or("officellm binary not found")?;
        let home = resolve::officellm_home(&app)?;
        tauri::async_runtime::spawn_blocking(move || init::ensure_initialized(&bin, &home))
            .await
            .map_err(|e| format!("后台线程错误: {e}"))?
    }
    .await;
    init::mark_init_done(&result);
    result
}
