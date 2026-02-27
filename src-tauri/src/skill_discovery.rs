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
    (".officellm/skills", "officellm"),
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

/// 发现本机 skills：先扫内置默认目录，再扫用户配置的 custom_roots（支持 ~ 展开）。
/// workspace_path 存在时额外扫描工作区下的 .claude/skills、.agents/skills。
#[tauri::command]
pub fn discover_external_skills(
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
mod tests {
    use super::*;
    use crate::test_util::with_home;

    fn write_md(dir: &Path, content: &str) {
        fs::create_dir_all(dir).unwrap();
        fs::write(dir.join(SKILL_FILENAME), content).unwrap();
    }

    // --- scan_skill_root ---

    #[test]
    fn scan_nested_layout() {
        let td = tempfile::TempDir::new().unwrap();
        let root = td.path();
        write_md(&root.join("my-skill"), "---\nname: my-skill\n---");
        let found = scan_skill_root(root, "test");
        assert_eq!(found.len(), 1);
        assert_eq!(found[0].name, "my-skill");
        assert_eq!(found[0].source, "test");
        assert!(found[0].content.contains("my-skill"));
    }

    #[test]
    fn scan_flat_layout() {
        let td = tempfile::TempDir::new().unwrap();
        let root = td.path().join("skills");
        write_md(&root, "flat content");
        let found = scan_skill_root(&root, "src");
        assert_eq!(found.len(), 1);
        assert_eq!(found[0].name, "skills");
        assert_eq!(found[0].content, "flat content");
    }

    #[test]
    fn scan_mixed_layout() {
        let td = tempfile::TempDir::new().unwrap();
        let root = td.path().join("mix");
        write_md(&root, "flat");
        write_md(&root.join("nested"), "nested");
        let found = scan_skill_root(&root, "s");
        assert_eq!(found.len(), 2);
    }

    #[test]
    fn scan_empty_dir() {
        let td = tempfile::TempDir::new().unwrap();
        assert!(scan_skill_root(td.path(), "x").is_empty());
    }

    #[test]
    fn scan_nonexistent_dir() {
        assert!(scan_skill_root(Path::new("/no/such/dir"), "x").is_empty());
    }

    #[test]
    fn scan_skips_non_dir_entries() {
        let td = tempfile::TempDir::new().unwrap();
        // file (not dir) at root level — should be skipped
        fs::write(td.path().join("not-a-dir"), "x").unwrap();
        // subdir without SKILL.md — should be skipped
        fs::create_dir(td.path().join("empty-sub")).unwrap();
        assert!(scan_skill_root(td.path(), "x").is_empty());
    }

    // --- read_skill_file ---

    #[test]
    fn read_skill_file_normal() {
        let td = tempfile::TempDir::new().unwrap();
        let p = td.path().join("SKILL.md");
        fs::write(&p, "hello").unwrap();
        assert_eq!(read_skill_file(&p).unwrap(), "hello");
    }

    #[test]
    fn read_skill_file_over_limit() {
        let td = tempfile::TempDir::new().unwrap();
        let p = td.path().join("BIG.md");
        let big = vec![b'x'; (MAX_SKILL_BYTES + 1) as usize];
        fs::write(&p, &big).unwrap();
        assert_eq!(read_skill_file(&p).unwrap(), "");
    }

    #[test]
    fn read_skill_file_nonexistent() {
        assert!(read_skill_file(Path::new("/no/file")).is_err());
    }

    // --- expand_path ---

    #[test]
    fn expand_tilde_path() {
        with_home(|home| {
            assert_eq!(expand_path("~/foo"), home.join("foo"));
            assert_eq!(expand_path("~"), home.to_path_buf());
        });
    }

    #[test]
    fn expand_absolute_unchanged() {
        assert_eq!(expand_path("/abs/path"), PathBuf::from("/abs/path"));
    }
}
