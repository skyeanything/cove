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

#[cfg(test)]
mod tests {
    use super::*;
    use crate::test_util::with_home;

    #[test]
    fn default_bin_path_returns_path_under_home() {
        with_home(|home| {
            let p = default_bin_path().unwrap();
            assert!(p.starts_with(home));
            assert!(p.ends_with(".officellm/bin/officellm"));
        });
    }

    #[test]
    fn detect_unavailable_when_binary_missing() {
        with_home(|_home| {
            let r = detect();
            assert!(!r.available);
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
            // Script outputs nothing
            std::fs::write(&bin, "#!/bin/sh\n").unwrap();
            std::fs::set_permissions(&bin, std::fs::Permissions::from_mode(0o755))
                .unwrap();

            let r = detect();
            assert!(r.available);
            assert!(r.version.is_none());
        });
    }
}
