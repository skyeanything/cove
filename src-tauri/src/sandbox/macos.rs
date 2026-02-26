//! macOS Seatbelt 沙箱实现：通过 sandbox-exec 在内核层面隔离 shell 命令。

use super::{expand_tilde, SandboxPolicy};

/// macOS 始终支持 sandbox-exec（系统内置）
pub fn is_supported() -> bool {
    true
}

/// 构建 sandbox-exec 命令。
pub fn build_command(
    cmd: &str,
    workspace_root: &str,
    policy: &SandboxPolicy,
) -> Option<(String, Vec<String>)> {
    let profile = generate_profile(workspace_root, policy);
    Some((
        "sandbox-exec".to_string(),
        vec![
            "-p".to_string(),
            profile,
            "sh".to_string(),
            "-c".to_string(),
            cmd.to_string(),
        ],
    ))
}

/// 生成 Seatbelt S-expression profile。
fn generate_profile(workspace_root: &str, policy: &SandboxPolicy) -> String {
    let mut lines = Vec::with_capacity(32);

    lines.push("(version 1)".to_string());
    lines.push("(deny default)".to_string());

    // 基本进程操作
    lines.push("(allow process-exec)".to_string());
    lines.push("(allow process-fork)".to_string());
    lines.push("(allow signal (target self))".to_string());
    lines.push("(allow sysctl-read)".to_string());

    // 允许读取大部分文件
    lines.push("(allow file-read*)".to_string());

    // 拒绝读取敏感路径
    for path in &policy.deny_read {
        let expanded = expand_tilde(path);
        lines.push(format!(
            "(deny file-read* (subpath \"{}\"))",
            escape_seatbelt(&expanded)
        ));
    }

    // 默认拒绝写入
    lines.push("(deny file-write*)".to_string());

    // 允许写入 workspace
    lines.push(format!(
        "(allow file-write* (subpath \"{}\"))",
        escape_seatbelt(workspace_root)
    ));

    // 允许写入 /tmp（许多工具需要）
    lines.push("(allow file-write* (subpath \"/tmp\"))".to_string());
    lines.push("(allow file-write* (subpath \"/private/tmp\"))".to_string());

    // 额外允许写入的路径
    for path in &policy.allow_write {
        let expanded = expand_tilde(path);
        lines.push(format!(
            "(allow file-write* (subpath \"{}\"))",
            escape_seatbelt(&expanded)
        ));
    }

    // 拒绝写入（优先级高，放在 allow 后面）
    for path in &policy.deny_write {
        let expanded = expand_tilde(path);
        lines.push(format!(
            "(deny file-write* (subpath \"{}\"))",
            escape_seatbelt(&expanded)
        ));
    }

    // 网络
    if policy.allow_network {
        lines.push("(allow network*)".to_string());
    } else {
        lines.push("(deny network*)".to_string());
    }

    lines.join("\n")
}

/// 转义 Seatbelt profile 中的特殊字符
fn escape_seatbelt(s: &str) -> String {
    s.replace('\\', "\\\\").replace('"', "\\\"")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_generate_profile_contains_workspace() {
        let policy = SandboxPolicy::default();
        let profile = generate_profile("/Users/test/project", &policy);
        assert!(profile.contains("/Users/test/project"));
        assert!(profile.contains("(deny default)"));
        assert!(profile.contains("(deny network*)"));
    }

    #[test]
    fn test_build_command_returns_sandbox_exec() {
        let policy = SandboxPolicy::default();
        let result = build_command("ls -la", "/Users/test/project", &policy);
        assert!(result.is_some());
        let (prog, args) = result.unwrap();
        assert_eq!(prog, "sandbox-exec");
        assert_eq!(args[0], "-p");
        assert_eq!(args[2], "sh");
        assert_eq!(args[3], "-c");
        assert_eq!(args[4], "ls -la");
    }
}
