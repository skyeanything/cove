//! 检测 officellm 二进制是否存在及其版本信息。

use std::process::Command;

use super::types::DetectResult;

/// 返回 officellm 二进制的默认路径
pub fn default_bin_path() -> Option<std::path::PathBuf> {
    dirs::home_dir().map(|h| h.join(".officellm/bin/officellm"))
}

/// 检测 officellm 是否已安装、版本号、路径
pub fn detect() -> DetectResult {
    let Some(bin) = default_bin_path() else {
        return DetectResult { available: false, version: None, path: None };
    };

    if !bin.exists() {
        return DetectResult { available: false, version: None, path: None };
    }

    let path_str = bin.to_string_lossy().into_owned();
    let version = Command::new(&bin)
        .arg("--version")
        .output()
        .ok()
        .and_then(|o| {
            if o.status.success() {
                let out = String::from_utf8_lossy(&o.stdout).trim().to_string();
                if out.is_empty() { None } else { Some(out) }
            } else {
                None
            }
        });

    DetectResult {
        available: true,
        version,
        path: Some(path_str),
    }
}
