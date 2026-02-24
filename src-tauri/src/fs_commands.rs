//! 文件系统 Tauri 命令：限定在工作区内，供前端 read/write/edit 工具调用。

use std::fs;
use std::io::Read;
use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};
use tauri::Emitter;

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
const READ_DATA_URL_MAX_BYTES: u64 = 25 * 1024 * 1024; // 25MB
const LINE_MAX_CHARS: usize = 2000;

// ---------------------------------------------------------------------------
// MIME 检测：优先 magic bytes，扩展名 fallback
// ---------------------------------------------------------------------------

fn mime_from_magic(bytes: &[u8]) -> Option<&'static str> {
    if bytes.len() < 12 {
        return None;
    }
    // PNG
    if bytes.starts_with(&[0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]) {
        return Some("image/png");
    }
    // JPEG
    if bytes.starts_with(&[0xFF, 0xD8, 0xFF]) {
        return Some("image/jpeg");
    }
    // GIF
    if bytes.starts_with(b"GIF87a") || bytes.starts_with(b"GIF89a") {
        return Some("image/gif");
    }
    // WebP: RIFF....WEBP
    if bytes.len() >= 12 && bytes[0..4] == [0x52, 0x49, 0x46, 0x46] && bytes[8..12] == *b"WEBP" {
        return Some("image/webp");
    }
    // PDF
    if bytes.starts_with(b"%PDF") {
        return Some("application/pdf");
    }
    // ZIP (含 docx/xlsx/pptx)
    if bytes.len() >= 4 && bytes[0..2] == [0x50, 0x4B] && (bytes[2] == 0x03 || bytes[2] == 0x05) {
        return Some("application/zip");
    }
    // SVG (文本，可选按内容判断；此处不检测，交给扩展名)
    None
}

fn mime_from_extension(p: &Path) -> &'static str {
    let ext = p
        .extension()
        .and_then(|e| e.to_str())
        .map(|s| s.to_lowercase());
    match ext.as_deref() {
        Some("png") => "image/png",
        Some("jpg") | Some("jpeg") => "image/jpeg",
        Some("gif") => "image/gif",
        Some("webp") => "image/webp",
        Some("svg") => "image/svg+xml",
        Some("pdf") => "application/pdf",
        Some("docx") => "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        Some("xlsx") => "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        Some("pptx") => "application/vnd.openxmlformats-officedocument.presentationml.presentation",
        _ => "application/octet-stream",
    }
}

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

// --------------- list_dir ---------------

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ListDirArgs {
    pub workspace_root: String,
    /// 相对工作区根的目录路径，空字符串表示根
    pub path: String,
    /// 是否包含以 . 开头的隐藏文件，默认 true
    pub include_hidden: Option<bool>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ListDirEntry {
    pub name: String,
    /// 相对工作区根的路径
    pub path: String,
    pub is_dir: bool,
    pub mtime_secs: i64,
}

#[tauri::command]
pub fn list_dir(args: ListDirArgs) -> Result<Vec<ListDirEntry>, FsError> {
    let root = Path::new(&args.workspace_root)
        .canonicalize()
        .map_err(|_| FsError::NotFound)?
        .into_os_string()
        .into_string()
        .map_err(|_| FsError::Io("workspace path invalid utf-8".into()))?;

    let dir_path = if args.path.trim().is_empty() {
        root.clone()
    } else {
        let resolved = Path::new(&root).join(&args.path);
        let canonical = resolved.canonicalize().map_err(|e| {
            if e.kind() == std::io::ErrorKind::NotFound {
                FsError::NotFound
            } else {
                FsError::Io(e.to_string())
            }
        })?;
        canonical
            .into_os_string()
            .into_string()
            .map_err(|_| FsError::Io("path invalid utf-8".into()))?
    };

    if !dir_path.starts_with(&root) {
        return Err(FsError::OutsideWorkspace);
    }
    let meta = fs::metadata(&dir_path).map_err(FsError::from)?;
    if !meta.is_dir() {
        return Err(FsError::NotAllowed("not a directory".into()));
    }

    let root_path = Path::new(&root);
    let mut entries = Vec::new();
    for e in fs::read_dir(&dir_path).map_err(FsError::from)? {
        let e = e.map_err(FsError::from)?;
        let entry_path = e.path();
        let canonical = match entry_path.canonicalize() {
            Ok(p) => p,
            Err(_) => continue,
        };
        let canonical_str = match canonical.into_os_string().into_string() {
            Ok(s) => s,
            Err(_) => continue,
        };
        if !canonical_str.starts_with(&root) {
            continue;
        }
        let name = e
            .file_name()
            .into_string()
            .map_err(|_| FsError::Io("entry name invalid utf-8".into()))?;
        if args.include_hidden == Some(false) && name.starts_with('.') {
            continue;
        }
        let rel = Path::new(&canonical_str)
            .strip_prefix(root_path)
            .map_err(|_| FsError::Io("strip prefix".into()))?;
        let path = rel.to_string_lossy().replace('\\', "/");
        let meta = fs::metadata(&canonical_str).map_err(FsError::from)?;
        let is_dir = meta.is_dir();
        let mtime_secs = meta
            .modified()
            .map(|t| t.duration_since(std::time::UNIX_EPOCH).unwrap_or_default().as_secs() as i64)
            .unwrap_or(0);
        entries.push(ListDirEntry {
            name,
            path,
            is_dir,
            mtime_secs,
        });
    }
    entries.sort_by(|a, b| {
        match (a.is_dir, b.is_dir) {
            (true, false) => std::cmp::Ordering::Less,
            (false, true) => std::cmp::Ordering::Greater,
            _ => a.name.to_lowercase().cmp(&b.name.to_lowercase()),
        }
    });
    Ok(entries)
}

// --------------- read_file_raw ---------------

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ReadFileRawArgs {
    pub workspace_root: String,
    pub path: String,
}

#[tauri::command]
pub fn read_file_raw(args: ReadFileRawArgs) -> Result<String, FsError> {
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
    Ok(content)
}

// --------------- read_file_as_data_url ---------------

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ReadFileAsDataUrlArgs {
    pub workspace_root: String,
    pub path: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ReadFileAsDataUrlResult {
    pub data_url: String,
}

#[tauri::command]
pub fn read_file_as_data_url(args: ReadFileAsDataUrlArgs) -> Result<ReadFileAsDataUrlResult, FsError> {
    let abs = ensure_inside_workspace_exists(&args.workspace_root, &args.path)?;
    let meta = fs::metadata(&abs).map_err(FsError::from)?;
    if meta.is_dir() {
        return Err(FsError::NotAllowed("is a directory".into()));
    }
    if meta.len() > READ_DATA_URL_MAX_BYTES {
        return Err(FsError::TooLarge);
    }
    let bytes = fs::read(&abs).map_err(FsError::from)?;
    let mime = mime_from_magic(&bytes).unwrap_or_else(|| mime_from_extension(&abs));
    use base64::engine::general_purpose::STANDARD as BASE64;
    use base64::Engine;
    let b64 = BASE64.encode(&bytes);
    let data_url = format!("data:{};base64,{}", mime, b64);
    Ok(ReadFileAsDataUrlResult { data_url })
}

// --------------- stat_file ---------------

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

// --------------- open_with_app ---------------

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OpenWithAppArgs {
    pub workspace_root: String,
    pub path: String,
    /// 可选：指定用哪个应用打开（macOS 上为 app 名称或 bundle path）
    #[serde(default)]
    pub open_with: Option<String>,
}

#[tauri::command]
pub fn open_with_app(args: OpenWithAppArgs) -> Result<(), FsError> {
    let abs = ensure_inside_workspace_exists(&args.workspace_root, &args.path)?;
    let abs_str = abs.to_str().ok_or_else(|| FsError::Io("path invalid utf-8".into()))?;

    let mut cmd = std::process::Command::new("open");
    if let Some(app) = &args.open_with {
        cmd.arg("-a").arg(app);
    }
    cmd.arg(abs_str);
    cmd.spawn().map_err(|e| FsError::Io(e.to_string()))?;
    Ok(())
}

// --------------- create_dir ---------------

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateDirArgs {
    pub workspace_root: String,
    /// 父目录相对工作区根的路径，空字符串表示工作区根
    pub path: String,
    /// 新文件夹名称
    pub name: String,
}

#[tauri::command]
pub fn create_dir(app: tauri::AppHandle, args: CreateDirArgs) -> Result<(), FsError> {
    let parent_path = if args.path.trim().is_empty() {
        ".".to_string()
    } else {
        args.path.clone()
    };
    let parent = ensure_inside_workspace_exists(&args.workspace_root, &parent_path)?;
    let name = args.name.trim();
    if name.is_empty() || name.contains('/') || name.contains('\\') {
        return Err(FsError::NotAllowed("invalid folder name".into()));
    }
    let new_dir = parent.join(name);
    if new_dir.exists() {
        return Err(FsError::NotAllowed("already exists".into()));
    }
    fs::create_dir(&new_dir).map_err(FsError::from)?;
    let root = Path::new(&args.workspace_root).canonicalize().map_err(FsError::from)?;
    let rel = new_dir
        .strip_prefix(&root)
        .map(|p| p.to_string_lossy().replace('\\', "/"))
        .map_err(|_| FsError::Io("strip prefix".into()))?;
    let _ = app.emit(
        crate::workspace_watcher::EVENT_WORKSPACE_FILE_CHANGED,
        crate::workspace_watcher::WorkspaceFileChangedPayload {
            path: rel,
            kind: crate::workspace_watcher::FileChangeKind::Create,
        },
    );
    Ok(())
}

// --------------- move_file (含重命名) ---------------

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MoveFileArgs {
    pub workspace_root: String,
    pub from_path: String,
    pub to_path: String,
}

#[tauri::command]
pub fn move_file(app: tauri::AppHandle, args: MoveFileArgs) -> Result<(), FsError> {
    let from_abs = ensure_inside_workspace_exists(&args.workspace_root, &args.from_path)?;
    let to_abs = ensure_inside_workspace_may_not_exist(&args.workspace_root, &args.to_path)?;
    if from_abs == to_abs {
        return Ok(());
    }
    if to_abs.exists() {
        return Err(FsError::NotAllowed("destination already exists".into()));
    }
    if let Some(parent) = to_abs.parent() {
        if !parent.exists() {
            fs::create_dir_all(parent).map_err(FsError::from)?;
        }
    }
    fs::rename(&from_abs, &to_abs).map_err(FsError::from)?;
    let root = Path::new(&args.workspace_root).canonicalize().map_err(FsError::from)?;
    let from_rel = from_abs
        .strip_prefix(&root)
        .map(|p| p.to_string_lossy().replace('\\', "/"))
        .unwrap_or_else(|_| args.from_path.clone());
    let to_rel = to_abs
        .strip_prefix(&root)
        .map(|p| p.to_string_lossy().replace('\\', "/"))
        .unwrap_or_else(|_| args.to_path.clone());
    let _ = app.emit(
        crate::workspace_watcher::EVENT_WORKSPACE_FILE_CHANGED,
        crate::workspace_watcher::WorkspaceFileChangedPayload {
            path: from_rel,
            kind: crate::workspace_watcher::FileChangeKind::Rename,
        },
    );
    let _ = app.emit(
        crate::workspace_watcher::EVENT_WORKSPACE_FILE_CHANGED,
        crate::workspace_watcher::WorkspaceFileChangedPayload {
            path: to_rel,
            kind: crate::workspace_watcher::FileChangeKind::Create,
        },
    );
    Ok(())
}

// --------------- remove_entry (文件或目录) ---------------

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RemoveEntryArgs {
    pub workspace_root: String,
    pub path: String,
}

#[tauri::command]
pub fn remove_entry(app: tauri::AppHandle, args: RemoveEntryArgs) -> Result<(), FsError> {
    let abs = ensure_inside_workspace_exists(&args.workspace_root, &args.path)?;
    let meta = fs::metadata(&abs).map_err(FsError::from)?;
    if meta.is_dir() {
        fs::remove_dir_all(&abs).map_err(FsError::from)?;
    } else {
        fs::remove_file(&abs).map_err(FsError::from)?;
    }
    let _ = app.emit(
        crate::workspace_watcher::EVENT_WORKSPACE_FILE_CHANGED,
        crate::workspace_watcher::WorkspaceFileChangedPayload {
            path: args.path.clone(),
            kind: crate::workspace_watcher::FileChangeKind::Remove,
        },
    );
    Ok(())
}

// --------------- reveal_in_finder ---------------

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RevealInFinderArgs {
    pub workspace_root: String,
    pub path: String,
}

#[tauri::command]
pub fn reveal_in_finder(args: RevealInFinderArgs) -> Result<(), FsError> {
    let abs = ensure_inside_workspace_exists(&args.workspace_root, &args.path)?;
    let abs_str = abs.to_str().ok_or_else(|| FsError::Io("path invalid utf-8".into()))?;

    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("open")
            .arg("-R")
            .arg(abs_str)
            .spawn()
            .map_err(|e| FsError::Io(e.to_string()))?;
    }

    #[cfg(target_os = "windows")]
    {
        let arg = format!("/select,{}", abs_str);
        std::process::Command::new("explorer").arg(arg).spawn().map_err(|e| FsError::Io(e.to_string()))?;
    }

    #[cfg(not(any(target_os = "macos", target_os = "windows")))]
    {
        if let Some(parent) = abs.parent() {
            if let Some(p) = parent.to_str() {
                let _ = std::process::Command::new("xdg-open").arg(p).spawn();
            }
        }
    }

    Ok(())
}

// --------------- detect_office_apps ---------------

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OfficeAppInfo {
    /// 应用标识符，用于 open -a 参数
    pub id: String,
    /// 显示名称
    pub name: String,
    /// 应用路径
    pub path: String,
}

#[tauri::command]
pub fn detect_office_apps() -> Vec<OfficeAppInfo> {
    let mut apps = Vec::new();

    #[cfg(target_os = "macos")]
    {
        let candidates: &[(&str, &str, &[&str])] = &[
            ("wpsoffice", "WPS Office", &["/Applications/wpsoffice.app"]),
            ("Microsoft Word", "Microsoft Word", &["/Applications/Microsoft Word.app"]),
            ("Microsoft Excel", "Microsoft Excel", &["/Applications/Microsoft Excel.app"]),
            ("Microsoft PowerPoint", "Microsoft PowerPoint", &["/Applications/Microsoft PowerPoint.app"]),
            ("LibreOffice", "LibreOffice", &["/Applications/LibreOffice.app"]),
        ];

        for &(id, name, paths) in candidates {
            for &p in paths {
                if Path::new(p).exists() {
                    apps.push(OfficeAppInfo {
                        id: id.to_string(),
                        name: name.to_string(),
                        path: p.to_string(),
                    });
                    break;
                }
            }
        }
    }

    apps
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
