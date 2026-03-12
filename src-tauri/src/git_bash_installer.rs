//! Windows Git Bash detection and PortableGit auto-installation.
//!
//! On non-Windows platforms only the status command is exposed.

#[cfg(windows)]
use std::path::{Path, PathBuf};

#[cfg(windows)]
const MANIFEST_URL: &str =
    "https://raw.githubusercontent.com/cove-founders/cove/main/tools/git-windows-manifest.json";
#[cfg(windows)]
const FALLBACK_X64_URL: &str = "https://cdn.npmmirror.com/binaries/git-for-windows/v2.53.0.windows.1/PortableGit-2.53.0-64-bit.7z.exe";
#[cfg(windows)]
const FALLBACK_ARM64_URL: &str = "https://cdn.npmmirror.com/binaries/git-for-windows/v2.53.0.windows.1/PortableGit-2.53.0-arm64.7z.exe";

/// Path to the app-managed Git installation root.
#[cfg(windows)]
pub fn managed_git_root() -> PathBuf {
    dirs::home_dir()
        .unwrap_or_else(|| PathBuf::from("."))
        .join(".cove")
        .join("tools")
        .join("git")
}

/// Return paths to inject into PATH for a given bash.exe.
/// Derives git root from bash.exe location (`bash.exe` → `bin/` → `git_root/`).
#[cfg(windows)]
pub fn git_bash_extra_paths(bash_exe: &Path) -> Vec<PathBuf> {
    let git_root = bash_exe
        .parent()           // bin/
        .and_then(|p| p.parent()) // git_root/
        .map(|p| p.to_path_buf());
    match git_root {
        Some(root) => vec![root.join("bin"), root.join("usr").join("bin")],
        None => vec![],
    }
}

// ── Windows-only implementation ───────────────────────────────────────────────

#[cfg(windows)]
use std::sync::Mutex;

#[cfg(windows)]
static INSTALL_MUTEX: Mutex<()> = Mutex::new(());

/// Locate an existing bash.exe by probing multiple sources.
#[cfg(windows)]
pub fn find_git_bash() -> Option<PathBuf> {
    try_registry()
        .or_else(try_common_paths)
        .or_else(try_from_git_location)
        .or_else(|| {
            let p = managed_git_root().join("bin").join("bash.exe");
            p.exists().then_some(p)
        })
}

/// Find Git Bash; if missing, attempt PortableGit auto-install first.
#[cfg(windows)]
pub fn ensure_git_bash() -> Result<PathBuf, String> {
    if let Some(p) = find_git_bash() {
        return Ok(p);
    }
    // Serialise concurrent callers (startup thread + bash tool race).
    let _guard = INSTALL_MUTEX.lock().map_err(|e| e.to_string())?;
    // Double-check after acquiring the lock.
    if let Some(p) = find_git_bash() {
        return Ok(p);
    }
    install_git_bash()?;
    find_git_bash().ok_or_else(|| {
        "Git Bash 安装后仍无法找到 bash.exe。\
         请手动安装 Git for Windows：https://git-scm.com/download/win"
            .to_string()
    })
}

// ── Registry probe ────────────────────────────────────────────────────────────

#[cfg(windows)]
fn try_registry() -> Option<PathBuf> {
    use std::process::Command;
    // Use reg.exe query to avoid pulling in winreg crate.
    let output = Command::new("reg")
        .args([
            "query",
            r"HKLM\SOFTWARE\GitForWindows",
            "/v",
            "InstallPath",
        ])
        .output()
        .ok()?;
    let text = String::from_utf8_lossy(&output.stdout);
    for line in text.lines() {
        if line.trim_start().starts_with("InstallPath") {
            // Format: "    InstallPath    REG_SZ    C:\Program Files\Git"
            let parts: Vec<&str> = line.splitn(4, "    ").collect();
            if let Some(install_path) = parts.last() {
                let bash = PathBuf::from(install_path.trim()).join("bin").join("bash.exe");
                if bash.exists() {
                    return Some(bash);
                }
            }
        }
    }
    None
}

// ── Common install paths ──────────────────────────────────────────────────────

#[cfg(windows)]
fn try_common_paths() -> Option<PathBuf> {
    let candidates = [
        r"C:\Program Files\Git\bin\bash.exe",
        r"C:\Program Files (x86)\Git\bin\bash.exe",
        r"C:\Git\bin\bash.exe",
    ];
    candidates
        .iter()
        .map(PathBuf::from)
        .find(|p| p.exists())
}

// ── Derive from `where git` ───────────────────────────────────────────────────

#[cfg(windows)]
fn try_from_git_location() -> Option<PathBuf> {
    use std::process::Command;
    let output = Command::new("where").arg("git").output().ok()?;
    let text = String::from_utf8_lossy(&output.stdout);
    for line in text.lines() {
        let git_exe = PathBuf::from(line.trim());
        // git.exe is usually in <root>\cmd\git.exe; bash is at <root>\bin\bash.exe
        if let Some(cmd_dir) = git_exe.parent() {
            if let Some(root) = cmd_dir.parent() {
                let bash = root.join("bin").join("bash.exe");
                if bash.exists() {
                    return Some(bash);
                }
            }
        }
    }
    None
}

// ── PortableGit installer ─────────────────────────────────────────────────────

#[cfg(windows)]
#[derive(serde::Deserialize)]
struct ManifestTarget {
    url: String,
    sha256: Option<String>,
}

#[cfg(windows)]
#[derive(serde::Deserialize)]
struct Manifest {
    targets: std::collections::HashMap<String, ManifestTarget>,
}

#[cfg(windows)]
fn current_arch_key() -> &'static str {
    match std::env::consts::ARCH {
        "aarch64" => "aarch64",
        _ => "x86_64",
    }
}

#[cfg(windows)]
fn fetch_manifest() -> Option<ManifestTarget> {
    use reqwest::blocking::Client;
    use std::time::Duration;
    let client = Client::builder()
        .timeout(Duration::from_secs(5))
        .build()
        .ok()?;
    let text = client.get(MANIFEST_URL).send().ok()?.text().ok()?;
    let manifest: Manifest = serde_json::from_str(&text).ok()?;
    manifest.targets.into_iter()
        .find(|(k, _)| k == current_arch_key())
        .map(|(_, v)| v)
}

#[cfg(windows)]
fn install_git_bash() -> Result<(), String> {
    use reqwest::blocking::Client;
    use std::time::Duration;

    let arch = current_arch_key();
    let (url, expected_sha256) = match fetch_manifest() {
        Some(t) => (t.url, t.sha256),
        None => {
            let fallback = if arch == "aarch64" { FALLBACK_ARM64_URL } else { FALLBACK_X64_URL };
            (fallback.to_string(), None)
        }
    };

    log::info!("Downloading PortableGit from {url}");

    let client = Client::builder()
        .timeout(Duration::from_secs(300))
        .build()
        .map_err(|e| format!("HTTP client error: {e}"))?;
    let bytes = client
        .get(&url)
        .send()
        .map_err(|e| format!("Download failed: {e}"))?
        .bytes()
        .map_err(|e| format!("Read bytes failed: {e}"))?;

    // SHA256 verification
    if let Some(expected) = expected_sha256 {
        use sha2::{Digest, Sha256};
        let hash = hex::encode(Sha256::digest(&bytes));
        if hash != expected.to_lowercase() {
            return Err(format!(
                "SHA256 校验失败（expected={expected}, got={hash}）。请重试或手动安装 Git for Windows。"
            ));
        }
    }

    // Write to temp file
    let temp_path = std::env::temp_dir().join("PortableGit-installer.exe");
    std::fs::write(&temp_path, &bytes)
        .map_err(|e| format!("写入临时文件失败: {e}"))?;

    // Execute self-extracting archive
    let target = managed_git_root();
    std::fs::create_dir_all(&target)
        .map_err(|e| format!("创建目标目录失败: {e}"))?;
    let target_str = format!("-o{}", target.display());

    let status = std::process::Command::new(&temp_path)
        .args(["-y", &target_str])
        .status()
        .map_err(|e| format!("解压失败: {e}"))?;

    let _ = std::fs::remove_file(&temp_path);

    if !status.success() {
        return Err(format!(
            "PortableGit 解压退出码: {:?}。请手动安装 Git for Windows：https://git-scm.com/download/win",
            status.code()
        ));
    }

    let bash = managed_git_root().join("bin").join("bash.exe");
    if !bash.exists() {
        return Err(
            "解压完成但找不到 bash.exe。请手动安装 Git for Windows：https://git-scm.com/download/win"
                .to_string(),
        );
    }
    Ok(())
}

// ── Tauri commands ────────────────────────────────────────────────────────────

/// Returns "found", "not_found", or "not_windows".
#[tauri::command]
pub fn check_git_bash_status() -> &'static str {
    #[cfg(windows)]
    {
        if find_git_bash().is_some() { "found" } else { "not_found" }
    }
    #[cfg(not(windows))]
    {
        "not_windows"
    }
}
