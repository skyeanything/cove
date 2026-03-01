//! 发现本机常见应用安装的 skill 目录（Claude / Cursor / OpenCode 等），仅读取 SKILL.md 内容供前端展示与加载。

use std::fs;
use std::io::Read;
use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};

/// 内置默认目录（与 Claude / OpenCode / Cursor 等约定一致）
const DEFAULT_SKILL_ROOTS: &[(&str, &str)] = &[
    (".cove/skills", "cove"),
    (".claude/skills", "claude"),
    (".agents/skills", "agents"),
    (".cursor/skills-cursor", "cursor"),
    (".opencode/skill", "opencode"),
    (".officellm/skills", "office"),
];

const SKILL_FILENAME: &str = "SKILL.md";
const MAX_SKILL_BYTES: u64 = 512 * 1024;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExternalSkillEntry {
    /// 来源标识：claude / agents / cursor / opencode
    pub source: String,
    /// 技能目录名（即 skill name）
    pub name: String,
    /// SKILL.md 的绝对路径
    pub path: String,
    /// 文件内容（原始，前端解析 frontmatter）
    pub content: String,
}

fn home_dir() -> Option<PathBuf> {
    #[cfg(unix)]
    return std::env::var_os("HOME").map(PathBuf::from);
    #[cfg(windows)]
    return std::env::var_os("USERPROFILE").map(PathBuf::from);
    #[allow(unreachable_code)]
    None
}

/// 将 ~ 展开为 home 目录
fn expand_path(p: &str) -> PathBuf {
    let s = p.trim();
    if s.starts_with("~/") || s == "~" {
        if let Some(home) = home_dir() {
            if s == "~" {
                return home;
            }
            return home.join(s.trim_start_matches("~/"));
        }
    }
    if s.starts_with("~\\") {
        if let Some(home) = home_dir() {
            return home.join(s.trim_start_matches("~\\"));
        }
    }
    PathBuf::from(s)
}

fn scan_skill_root(root: &Path, source: &str) -> Vec<ExternalSkillEntry> {
    let mut out = Vec::new();

    // 平铺布局：SKILL.md 直接位于 root（如 ~/.officellm/skills/SKILL.md）
    let flat_md = root.join(SKILL_FILENAME);
    if flat_md.is_file() {
        if let Ok(content) = read_skill_file(&flat_md) {
            let name = root
                .file_name()
                .map(|n| n.to_string_lossy().into_owned())
                .unwrap_or_else(|| source.to_string());
            out.push(ExternalSkillEntry {
                source: source.to_string(),
                name,
                path: flat_md.to_string_lossy().into_owned(),
                content,
            });
        }
    }

    // 嵌套布局：每个子目录内有 SKILL.md（如 ~/.claude/skills/my-skill/SKILL.md）
    let read_dir = match fs::read_dir(root) {
        Ok(d) => d,
        Err(_) => return out,
    };
    for entry in read_dir.flatten() {
        let path = entry.path();
        if !path.is_dir() {
            continue;
        }
        let name = entry.file_name().to_string_lossy().into_owned();
        let skill_md = path.join(SKILL_FILENAME);
        if !skill_md.is_file() {
            continue;
        }
        let content = match read_skill_file(&skill_md) {
            Ok(c) => c,
            Err(_) => continue,
        };
        out.push(ExternalSkillEntry {
            source: source.to_string(),
            name,
            path: skill_md.to_string_lossy().into_owned(),
            content,
        });
    }
    out
}

fn read_skill_file(path: &Path) -> Result<String, std::io::Error> {
    let meta = fs::metadata(path)?;
    if meta.len() > MAX_SKILL_BYTES {
        return Ok(String::new());
    }
    let mut f = fs::File::open(path)?;
    let mut s = String::new();
    f.read_to_string(&mut s)?;
    Ok(s)
}

/// Resolve the bundled officellm skills directory (if bundled sidecar exists).
fn bundled_officellm_skills(app: &tauri::AppHandle) -> Option<PathBuf> {
    let (_, is_bundled) = crate::officellm::resolve::resolve_bin()?;
    if !is_bundled {
        return None;
    }
    let home = crate::officellm::resolve::officellm_home(app).ok()?;
    let skills = home.join("skills");
    skills.is_dir().then_some(skills)
}

/// 发现本机 skills：先扫内置默认目录，再扫用户配置的 custom_roots（支持 ~ 展开）。
/// workspace_path 存在时额外扫描工作区下的 .claude/skills、.agents/skills。
#[tauri::command]
pub fn discover_external_skills(
    app: tauri::AppHandle,
    workspace_path: Option<String>,
    custom_roots: Option<Vec<String>>,
) -> Result<Vec<ExternalSkillEntry>, String> {
    discover_skills_impl(
        bundled_officellm_skills(&app),
        workspace_path,
        custom_roots,
    )
}

/// Core discovery logic, testable without `AppHandle`.
fn discover_skills_impl(
    bundled_officellm_skills_root: Option<PathBuf>,
    workspace_path: Option<String>,
    custom_roots: Option<Vec<String>>,
) -> Result<Vec<ExternalSkillEntry>, String> {
    let mut all = Vec::new();

    if let Some(home) = home_dir() {
        for (subdir, source) in DEFAULT_SKILL_ROOTS {
            let root = home.join(subdir);
            if root.is_dir() {
                all.extend(scan_skill_root(&root, source));
            }
        }
    }

    // Bundled officellm home: scan <app_data>/officellm/skills/ as fallback
    // for users who don't have ~/.officellm/ (bundled-only).
    // Same source "office" — if DEFAULT_SKILL_ROOTS already found
    // ~/.officellm/skills/, frontend deduplication keeps the first match.
    if let Some(ref root) = bundled_officellm_skills_root {
        all.extend(scan_skill_root(root, "office"));
    }

    if let Some(roots) = custom_roots {
        for path in roots {
            let root = expand_path(&path);
            if root.is_dir() {
                all.extend(scan_skill_root(&root, "custom"));
            }
        }
    }

    if let Some(ws) = workspace_path.filter(|s| !s.is_empty()) {
        let ws = Path::new(&ws);
        if ws.is_dir() {
            for (subdir, source) in [(".claude/skills", "claude"), (".agents/skills", "agents")] {
                let root = ws.join(subdir);
                if root.is_dir() {
                    all.extend(scan_skill_root(&root, source));
                }
            }
        }
    }

    Ok(all)
}

#[cfg(test)]
mod tests;
