//! 跨平台沙箱：限制 shell 命令的文件/网络访问。
//!
//! - macOS: sandbox-exec + Seatbelt profile（内核级）
//! - Linux: Landlock（内核 5.13+）
//! - Windows / 其他: 不可用，fallback 到 permission 系统

#[cfg(target_os = "macos")]
mod macos;
#[cfg(target_os = "linux")]
mod linux;

use serde::{Deserialize, Serialize};
use std::path::PathBuf;

/// 沙箱策略：描述允许/拒绝的文件路径与网络访问。
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SandboxPolicy {
    pub enabled: bool,
    /// 拒绝读取的路径列表（支持 ~ 表示 $HOME）
    pub deny_read: Vec<String>,
    /// 允许写入的路径列表
    pub allow_write: Vec<String>,
    /// 拒绝写入的路径列表（优先级高于 allow_write）
    pub deny_write: Vec<String>,
    /// 是否允许网络访问
    pub allow_network: bool,
}

impl Default for SandboxPolicy {
    fn default() -> Self {
        Self {
            enabled: true,
            deny_read: vec![
                "~/.ssh".into(),
                "~/.aws".into(),
                "~/.gnupg".into(),
                "~/.config/gcloud".into(),
            ],
            allow_write: vec![], // workspace + /tmp 由运行时自动添加
            deny_write: vec![],
            allow_network: false,
        }
    }
}

/// 当前平台是否支持 OS 级沙箱
pub fn is_sandbox_supported() -> bool {
    #[cfg(target_os = "macos")]
    { macos::is_supported() }
    #[cfg(target_os = "linux")]
    { linux::is_supported() }
    #[cfg(not(any(target_os = "macos", target_os = "linux")))]
    { false }
}

/// 构建沙箱化的命令。返回 (program, args)，若平台不支持则返回 None。
pub fn build_sandbox_command(
    cmd: &str,
    workspace_root: &str,
    policy: &SandboxPolicy,
) -> Option<(String, Vec<String>)> {
    if !policy.enabled {
        return None;
    }
    #[cfg(target_os = "macos")]
    { macos::build_command(cmd, workspace_root, policy) }
    #[cfg(target_os = "linux")]
    { linux::build_command(cmd, workspace_root, policy) }
    #[cfg(not(any(target_os = "macos", target_os = "linux")))]
    {
        let _ = (cmd, workspace_root, policy);
        None
    }
}

/// 从 ~/.officellm/sandbox-policy.json 加载策略，不存在则返回默认值。
pub fn load_policy() -> SandboxPolicy {
    let path = policy_path();
    match std::fs::read_to_string(&path) {
        Ok(json) => serde_json::from_str(&json).unwrap_or_default(),
        Err(_) => SandboxPolicy::default(),
    }
}

/// 将策略保存到 ~/.officellm/sandbox-policy.json
pub fn save_policy(policy: &SandboxPolicy) -> Result<(), String> {
    let path = policy_path();
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let json = serde_json::to_string_pretty(policy).map_err(|e| e.to_string())?;
    std::fs::write(&path, json).map_err(|e| e.to_string())
}

fn policy_path() -> PathBuf {
    dirs::home_dir()
        .unwrap_or_else(|| PathBuf::from("/tmp"))
        .join(".officellm")
        .join("sandbox-policy.json")
}

/// 展开 ~ 为用户 home 目录
pub(crate) fn expand_tilde(path: &str) -> String {
    if path.starts_with("~/") || path == "~" {
        if let Some(home) = dirs::home_dir() {
            return path.replacen('~', &home.to_string_lossy(), 1);
        }
    }
    path.to_string()
}

// -- Tauri commands --

#[tauri::command]
pub fn check_sandbox_supported() -> bool {
    is_sandbox_supported()
}

#[tauri::command]
pub fn get_sandbox_policy() -> SandboxPolicy {
    load_policy()
}

#[tauri::command]
pub fn set_sandbox_policy(policy: SandboxPolicy) -> Result<(), String> {
    save_policy(&policy)
}
