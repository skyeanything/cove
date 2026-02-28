//! 检测 officellm 二进制是否存在及其版本信息。

use std::path::PathBuf;
use std::process::Command;

use super::types::DetectResult;

/// 返回已解析的 officellm 二进制路径（sidecar 优先，外部安装兜底）。
pub fn bin_path() -> Result<PathBuf, String> {
    super::resolve::resolve_bin()
        .map(|(path, _)| path)
        .ok_or_else(|| "未找到 officellm".to_string())
}

/// 检测 officellm 是否已安装、版本号、路径、是否 bundled
pub fn detect() -> DetectResult {
    let Some((bin, is_bundled)) = super::resolve::resolve_bin() else {
        return DetectResult {
            available: false,
            version: None,
            path: None,
            bundled: false,
        };
    };

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
        bundled: is_bundled,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::test_util::with_home;

    #[test]
    fn bin_path_returns_error_when_missing() {
        with_home(|_home| {
            let err = bin_path().unwrap_err();
            assert!(err.contains("未找到 officellm"));
        });
    }

    #[test]
    fn detect_unavailable_when_binary_missing() {
        with_home(|_home| {
            let r = detect();
            assert!(!r.available);
            assert!(!r.bundled);
            assert!(r.version.is_none());
            assert!(r.path.is_none());
        });
    }

    #[cfg(unix)]
    #[test]
    fn detect_available_with_fake_binary() {
        use std::os::unix::fs::PermissionsExt;

        with_home(|home| {
            let bin = home.join(".officellm/bin/officellm");
            std::fs::create_dir_all(bin.parent().unwrap()).unwrap();
            std::fs::write(&bin, "#!/bin/sh\necho '1.2.3'\n").unwrap();
            std::fs::set_permissions(&bin, std::fs::Permissions::from_mode(0o755))
                .unwrap();

            let r = detect();
            assert!(r.available);
            assert!(!r.bundled);
            assert_eq!(r.version.as_deref(), Some("1.2.3"));
            assert!(r.path.is_some());
        });
    }

    #[cfg(unix)]
    #[test]
    fn detect_available_binary_version_empty() {
        use std::os::unix::fs::PermissionsExt;

        with_home(|home| {
            let bin = home.join(".officellm/bin/officellm");
            std::fs::create_dir_all(bin.parent().unwrap()).unwrap();
            std::fs::write(&bin, "#!/bin/sh\n").unwrap();
            std::fs::set_permissions(&bin, std::fs::Permissions::from_mode(0o755))
                .unwrap();

            let r = detect();
            assert!(r.available);
            assert!(!r.bundled);
            assert!(r.version.is_none());
        });
    }

    #[cfg(unix)]
    #[test]
    fn bin_path_finds_external() {
        use std::os::unix::fs::PermissionsExt;

        with_home(|home| {
            let bin = home.join(".officellm/bin/officellm");
            std::fs::create_dir_all(bin.parent().unwrap()).unwrap();
            std::fs::write(&bin, "#!/bin/sh\n").unwrap();
            std::fs::set_permissions(&bin, std::fs::Permissions::from_mode(0o755))
                .unwrap();

            let result = bin_path();
            assert!(result.is_ok());
            assert_eq!(result.unwrap(), bin);
        });
    }
}
