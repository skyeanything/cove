//! Linux Landlock 沙箱实现。
//!
//! 使用 `landlock` crate 在内核层面限制文件访问。
//! 要求内核 5.13+，不满足时 fallback（返回 None）。

use super::{expand_tilde, SandboxPolicy};

/// 检测沙箱是否可用（bwrap 是否安装）
pub fn is_supported() -> bool {
    std::process::Command::new("bwrap")
        .arg("--version")
        .output()
        .is_ok()
}

/// 构建沙箱化命令。
///
/// Linux 上使用 bwrap (bubblewrap) 作为沙箱 wrapper（如果可用），
/// 因为 Landlock 需要在进程自身上 restrict_self，无法直接包装 Command。
/// 若 bwrap 不可用，返回 None（fallback 到无沙箱）。
pub fn build_command(
    cmd: &str,
    workspace_root: &str,
    policy: &SandboxPolicy,
) -> Option<(String, Vec<String>)> {
    // 检查 bwrap 是否可用
    if std::process::Command::new("bwrap")
        .arg("--version")
        .output()
        .is_err()
    {
        return None;
    }

    let mut args = Vec::with_capacity(32);

    // 基础文件系统绑定（只读）
    args.extend_from_slice(&[
        "--ro-bind".to_string(), "/usr".to_string(), "/usr".to_string(),
        "--ro-bind".to_string(), "/lib".to_string(), "/lib".to_string(),
        "--ro-bind".to_string(), "/bin".to_string(), "/bin".to_string(),
        "--ro-bind".to_string(), "/etc".to_string(), "/etc".to_string(),
        "--proc".to_string(), "/proc".to_string(),
        "--dev".to_string(), "/dev".to_string(),
    ]);

    // 可选：绑定 /lib64（某些发行版需要）
    if std::path::Path::new("/lib64").exists() {
        args.extend_from_slice(&[
            "--ro-bind".to_string(), "/lib64".to_string(), "/lib64".to_string(),
        ]);
    }

    // 可写绑定 workspace
    args.extend_from_slice(&[
        "--bind".to_string(),
        workspace_root.to_string(),
        workspace_root.to_string(),
    ]);

    // /tmp 可写
    args.extend_from_slice(&[
        "--bind".to_string(), "/tmp".to_string(), "/tmp".to_string(),
    ]);

    // 额外允许写入的路径
    for path in &policy.allow_write {
        let expanded = expand_tilde(path);
        if std::path::Path::new(&expanded).exists() {
            args.extend_from_slice(&[
                "--bind".to_string(), expanded.clone(), expanded,
            ]);
        }
    }

    // 网络隔离
    if !policy.allow_network {
        args.push("--unshare-net".to_string());
    }

    // 最后添加要执行的命令
    args.extend_from_slice(&[
        "sh".to_string(), "-c".to_string(), cmd.to_string(),
    ]);

    Some(("bwrap".to_string(), args))
}
