//! 文件系统 Tauri 命令：限定在工作区内，供前端 read/write/edit 工具调用。

use std::fs;
use std::io::Read;
use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};

// ---------------------------------------------------------------------------
// 错误类型
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "kind", content = "message")]
pub enum FsError {
    /// 路径不在工作区内
    OutsideWorkspace,
    /// 文件或目录不存在
    NotFound,
    /// 权限不足或类型不符（如期望文件却是目录）
    NotAllowed(String),
    /// 被判定为二进制文件，拒绝读取
    BinaryFile,
    /// 文件超过 250KB
    TooLarge,
    /// 其它 I/O 错误
    Io(String),
}

impl From<std::io::Error> for FsError {
    fn from(e: std::io::Error) -> Self {
        use std::io::ErrorKind;
        match e.kind() {
            ErrorKind::NotFound => FsError::NotFound,
            ErrorKind::PermissionDenied => FsError::NotAllowed(e.to_string()),
            _ => FsError::Io(e.to_string()),
        }
    }
}

// ---------------------------------------------------------------------------
// 路径校验
// ---------------------------------------------------------------------------

/// 规范化路径成分（解析 `.` 与 `..`），不要求路径在磁盘上存在。
fn normalize_path_components(p: &Path) -> PathBuf {
    let mut out = PathBuf::new();
    for c in p.components() {
        match c {
            std::path::Component::CurDir => {}
            std::path::Component::ParentDir => {
                out.pop();
            }
            other => out.push(other),
        }
    }
    out
}

/// 路径必须存在：规范为绝对路径并校验在工作区内。
pub(crate) fn ensure_inside_workspace_exists(workspace_root: &str, path: &str) -> Result<PathBuf, FsError> {
    let root = Path::new(workspace_root)
        .canonicalize()
        .map_err(|_| FsError::NotFound)?
        .into_os_string()
        .into_string()
        .map_err(|_| FsError::Io("workspace path invalid utf-8".into()))?;

    let p = Path::new(path);
    let resolved = if p.is_absolute() {
        PathBuf::from(path)
    } else {
        Path::new(&root).join(path)
    };
    let canonical = resolved.canonicalize().map_err(|e| {
        if e.kind() == std::io::ErrorKind::NotFound {
            FsError::NotFound
        } else {
            FsError::Io(e.to_string())
        }
    })?;
    let canonical_str = canonical
        .into_os_string()
        .into_string()
        .map_err(|_| FsError::Io("resolved path invalid utf-8".into()))?;
    if !canonical_str.starts_with(&root) {
        return Err(FsError::OutsideWorkspace);
    }
    Ok(PathBuf::from(canonical_str))
}

/// 路径可以不存在（如写入新文件）：规范为绝对路径并校验在工作区内。
fn ensure_inside_workspace_may_not_exist(workspace_root: &str, path: &str) -> Result<PathBuf, FsError> {
    let root = Path::new(workspace_root).canonicalize().map_err(|_| FsError::NotFound)?;

    let p = Path::new(path);
    let resolved = if p.is_absolute() {
        normalize_path_components(Path::new(path))
    } else {
        normalize_path_components(&root.join(path))
    };
    if !resolved.starts_with(&root) {
        return Err(FsError::OutsideWorkspace);
    }
    Ok(resolved)
}

// ---------------------------------------------------------------------------
// 二进制检测
// ---------------------------------------------------------------------------

const BINARY_EXTENSIONS: &[&str] = &[
    "exe", "dll", "so", "dylib", "bin", "pyc", "pyo", "zip", "tar", "gz", "xz", "z", "bz2", "7z",
    "rar", "png", "jpg", "jpeg", "gif", "webp", "ico", "bmp", "pdf", "woff", "woff2", "ttf", "otf",
    "mp3", "wav", "ogg", "mp4", "webm", "mov", "avi", "mkv",
];

fn path_has_binary_extension(p: &Path) -> bool {
    p.extension()
        .and_then(|e| e.to_str())
        .map(|e| BINARY_EXTENSIONS.iter().any(|ext| ext.eq_ignore_ascii_case(e)))
        .unwrap_or(false)
}

/// 读取前 8KB，若非 UTF-8 或可打印字节占比 < 70% 则视为二进制。
fn is_binary_content(mut reader: impl Read) -> Result<bool, std::io::Error> {
    let mut buf = [0u8; 8192];
    let n = reader.read(&mut buf)?;
    let buf = &buf[..n];
    if buf.is_empty() {
        return Ok(false);
    }
    match std::str::from_utf8(buf) {
        Ok(s) => {
            let printable = s.chars().filter(|c| !c.is_control() || *c == '\n' || *c == '\r' || *c == '\t').count();
            let total = s.chars().count().max(1);
            Ok(printable * 100 / total < 70)
        }
        Err(_) => Ok(true),
    }
}

// ---------------------------------------------------------------------------
// 常量
// ---------------------------------------------------------------------------

const READ_MAX_BYTES: u64 = 250 * 1024; // 250KB
const LINE_MAX_CHARS: usize = 2000;

// ---------------------------------------------------------------------------
// Tauri 命令（前端传 camelCase，用 serde rename 对齐）
// ---------------------------------------------------------------------------

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ReadFileArgs {
    pub workspace_root: String,
    pub path: String,
    #[serde(default)]
    pub offset: Option<u64>,
    #[serde(default)]
    pub limit: Option<u64>,
}

#[tauri::command]
pub fn read_file(args: ReadFileArgs) -> Result<String, FsError> {
    let abs = ensure_inside_workspace_exists(&args.workspace_root, &args.path)?;
    let meta = fs::metadata(&abs).map_err(FsError::from)?;
    if meta.is_dir() {
        return Err(FsError::NotAllowed("is a directory".into()));
    }
    if meta.len() > READ_MAX_BYTES {
        return Err(FsError::TooLarge);
    }
    if path_has_binary_extension(&abs) {
        return Err(FsError::BinaryFile);
    }
    let mut f = fs::File::open(&abs).map_err(FsError::from)?;
    if is_binary_content(&mut f).map_err(FsError::from)? {
        return Err(FsError::BinaryFile);
    }
    f = fs::File::open(&abs).map_err(FsError::from)?;
    let mut content = String::new();
    f.read_to_string(&mut content).map_err(FsError::from)?;

    let offset = args.offset.unwrap_or(0) as usize;
    let limit = args.limit.unwrap_or(2000) as usize;

    let lines: Vec<&str> = content.lines().collect();
    let total = lines.len();
    let from = offset.min(total);
    let to = (from + limit).min(total);
    let selected = &lines[from..to];

    let mut out = String::new();
    for (i, line) in selected.iter().enumerate() {
        let line_no = from + i + 1;
        let prefix = format!("{:05}| ", line_no);
        let trimmed = if line.chars().count() > LINE_MAX_CHARS {
            let s: String = line.chars().take(LINE_MAX_CHARS).collect();
            format!("{}[... truncated {} chars]", s, line.chars().count() - LINE_MAX_CHARS)
        } else {
            line.to_string()
        };
        out.push_str(&prefix);
        out.push_str(&trimmed);
        out.push('\n');
    }
    Ok(out)
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WriteFileArgs {
    pub workspace_root: String,
    pub path: String,
    pub content: String,
}

#[tauri::command]
pub fn write_file(args: WriteFileArgs) -> Result<(), FsError> {
    let abs = ensure_inside_workspace_may_not_exist(&args.workspace_root, &args.path)?;
    if abs.is_dir() {
        return Err(FsError::NotAllowed("path is a directory".into()));
    }
    if let Some(parent) = abs.parent() {
        if !parent.exists() {
            fs::create_dir_all(parent).map_err(FsError::from)?;
        }
    }
    fs::write(&abs, args.content).map_err(FsError::from)?;
    Ok(())
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StatFileArgs {
    pub workspace_root: String,
    pub path: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StatFileResult {
    pub size: u64,
    pub mtime_secs: i64,
    pub is_dir: bool,
    pub is_binary: bool,
}

#[tauri::command]
pub fn stat_file(args: StatFileArgs) -> Result<StatFileResult, FsError> {
    let abs = ensure_inside_workspace_exists(&args.workspace_root, &args.path)?;
    let meta = fs::metadata(&abs).map_err(FsError::from)?;
    let is_dir = meta.is_dir();
    let size = meta.len();
    let mtime_secs = meta
        .modified()
        .map(|t| t.duration_since(std::time::UNIX_EPOCH).unwrap_or_default().as_secs() as i64)
        .unwrap_or(0);

    let is_binary = if meta.is_file() {
        path_has_binary_extension(&abs)
            || fs::File::open(&abs)
                .ok()
                .and_then(|f| is_binary_content(f).ok())
                .unwrap_or(false)
    } else {
        false
    };

    Ok(StatFileResult {
        size,
        mtime_secs,
        is_dir,
        is_binary,
    })
}

// ---------------------------------------------------------------------------
// 单元测试：序列化契约 + 命令逻辑 + 路径/二进制行为
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    /// 前端 invoke 传的是 camelCase 且包在 args 里；此处验证反序列化契约。
    #[test]
    fn read_file_args_deserialize_from_camel_case_json() {
        let json = r#"{"workspaceRoot":"/tmp/ws","path":"a/b.txt","limit":10}"#;
        let args: ReadFileArgs = serde_json::from_str(json).unwrap();
        assert_eq!(args.workspace_root, "/tmp/ws");
        assert_eq!(args.path, "a/b.txt");
        assert_eq!(args.offset, None);
        assert_eq!(args.limit, Some(10));
    }

    #[test]
    fn write_file_args_deserialize_from_camel_case_json() {
        let json = r#"{"workspaceRoot":"/tmp","path":"f.txt","content":"hi"}"#;
        let args: WriteFileArgs = serde_json::from_str(json).unwrap();
        assert_eq!(args.workspace_root, "/tmp");
        assert_eq!(args.path, "f.txt");
        assert_eq!(args.content, "hi");
    }

    #[test]
    fn stat_file_args_deserialize_from_camel_case_json() {
        let json = r#"{"workspaceRoot":"/tmp","path":"f.txt"}"#;
        let args: StatFileArgs = serde_json::from_str(json).unwrap();
        assert_eq!(args.workspace_root, "/tmp");
        assert_eq!(args.path, "f.txt");
    }

    #[test]
    fn read_file_returns_line_numbered_content() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path().to_str().unwrap();
        let f = dir.path().join("hello.txt");
        std::fs::write(&f, "line1\nline2\nline3\n").unwrap();

        let out = read_file(ReadFileArgs {
            workspace_root: root.to_string(),
            path: "hello.txt".to_string(),
            offset: None,
            limit: None,
        })
        .unwrap();
        assert!(out.starts_with("00001| line1\n"));
        assert!(out.contains("00002| line2\n"));
        assert!(out.contains("00003| line3\n"));
    }

    #[test]
    fn read_file_offset_limit() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path().to_str().unwrap();
        std::fs::write(dir.path().join("five.txt"), "a\nb\nc\nd\ne\n").unwrap();

        let out = read_file(ReadFileArgs {
            workspace_root: root.to_string(),
            path: "five.txt".to_string(),
            offset: Some(1),
            limit: Some(2),
        })
        .unwrap();
        assert_eq!(out.trim(), "00002| b\n00003| c");
    }

    #[test]
    fn read_file_outside_workspace_rejected() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path().to_str().unwrap();
        let result = read_file(ReadFileArgs {
            workspace_root: root.to_string(),
            path: "/etc/hosts".to_string(),
            offset: None,
            limit: Some(5),
        });
        assert!(matches!(result, Err(FsError::OutsideWorkspace)));
    }

    #[test]
    fn read_file_binary_extension_rejected() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path().to_str().unwrap();
        std::fs::write(dir.path().join("x.png"), "not really png").unwrap();

        let result = read_file(ReadFileArgs {
            workspace_root: root.to_string(),
            path: "x.png".to_string(),
            offset: None,
            limit: None,
        });
        assert!(matches!(result, Err(FsError::BinaryFile)));
    }

    #[test]
    fn write_file_creates_file_and_parent_dir() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path().to_str().unwrap();
        let sub = dir.path().join("sub");
        assert!(!sub.exists());

        write_file(WriteFileArgs {
            workspace_root: root.to_string(),
            path: "sub/nested/file.txt".to_string(),
            content: "written".to_string(),
        })
        .unwrap();

        let p = dir.path().join("sub/nested/file.txt");
        assert!(p.is_file());
        assert_eq!(std::fs::read_to_string(&p).unwrap(), "written");
    }

    #[test]
    fn write_file_outside_workspace_rejected() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path().to_str().unwrap();
        let result = write_file(WriteFileArgs {
            workspace_root: root.to_string(),
            path: "../../etc/foo".to_string(),
            content: "x".to_string(),
        });
        assert!(matches!(result, Err(FsError::OutsideWorkspace)));
    }

    #[test]
    fn stat_file_returns_metadata() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path().to_str().unwrap();
        std::fs::write(dir.path().join("f.txt"), "hello").unwrap();

        let st = stat_file(StatFileArgs {
            workspace_root: root.to_string(),
            path: "f.txt".to_string(),
        })
        .unwrap();
        assert_eq!(st.size, 5);
        assert!(!st.is_dir);
        assert!(!st.is_binary);
    }

}
