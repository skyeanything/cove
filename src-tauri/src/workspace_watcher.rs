//! 工作区文件监听：递归 watch + 防抖，向前端发送 workspace-file-changed 事件。

use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::mpsc;
use std::sync::{Arc, Mutex};
use std::time::Duration;

use notify::{recommended_watcher, Event, EventKind, RecommendedWatcher, RecursiveMode, Watcher};
use serde::Serialize;
use tauri::Emitter;

const DEBOUNCE_MS: u64 = 400;

/// 前端监听的事件名
pub const EVENT_WORKSPACE_FILE_CHANGED: &str = "workspace-file-changed";

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceFileChangedPayload {
    /// 相对工作区根的路径（正斜杠）
    pub path: String,
    pub kind: FileChangeKind,
}

#[derive(Debug, Clone, Copy, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum FileChangeKind {
    Create,
    Modify,
    Remove,
    Rename,
}

/// notify 6.x 无 Rename 变体，重命名通常以 Modify 上报
fn kind_from_event(e: &Event) -> Option<FileChangeKind> {
    match &e.kind {
        EventKind::Create(_) => Some(FileChangeKind::Create),
        EventKind::Modify(_) => Some(FileChangeKind::Modify),
        EventKind::Remove(_) => Some(FileChangeKind::Remove),
        _ => None,
    }
}

/// 忽略的目录名（不向上递归匹配，仅当前段）
const IGNORE_DIRS: &[&str] = &["node_modules", ".git", "target", "dist", ".next", ".turbo", "build"];

fn is_ignored(path: &Path, workspace_root: &Path) -> bool {
    let path = path.strip_prefix(workspace_root).unwrap_or(path);
    path.components().any(|c| {
        if let std::path::Component::Normal(name) = c {
            IGNORE_DIRS.contains(&name.to_string_lossy().as_ref())
        } else {
            false
        }
    })
}

fn to_relative_path(root: &Path, abs: &Path) -> Option<String> {
    let rel = abs.strip_prefix(root).ok()?;
    Some(rel.to_string_lossy().replace('\\', "/"))
}

/// 从事件中收集 (相对路径, kind)
fn collect_paths(e: &Event, workspace_root: &Path) -> Vec<(String, FileChangeKind)> {
    let kind = match kind_from_event(e) {
        Some(k) => k,
        None => return vec![],
    };
    let mut out = Vec::new();
    for p in &e.paths {
        if is_ignored(p, workspace_root) {
            continue;
        }
        if let Some(rel) = to_relative_path(workspace_root, p) {
            out.push((rel, kind));
        }
    }
    out
}

pub struct WatcherState {
    pub watcher: Mutex<Option<RecommendedWatcher>>,
}

impl WatcherState {
    pub fn new() -> Self {
        Self {
            watcher: Mutex::new(None),
        }
    }
}

/// 启动对 workspace_root 的监听；若此前已有监听则先停止再开新的。
pub fn watch_workspace(
    app_handle: tauri::AppHandle,
    state: Arc<WatcherState>,
    workspace_root: PathBuf,
) -> Result<(), String> {
    {
        let mut guard = state.watcher.lock().map_err(|e| e.to_string())?;
        *guard = None;
    }

    let (tx, rx) = mpsc::channel::<(String, FileChangeKind)>();

    let root = workspace_root.clone();
    let mut watcher = recommended_watcher(move |res: Result<Event, notify::Error>| {
        if let Ok(e) = res {
            for (rel, kind) in collect_paths(&e, &root) {
                let _ = tx.send((rel, kind));
            }
        }
    })
    .map_err(|e| e.to_string())?;

    watcher
        .watch(&workspace_root, RecursiveMode::Recursive)
        .map_err(|e| e.to_string())?;

    {
        let mut guard = state.watcher.lock().map_err(|e| e.to_string())?;
        *guard = Some(watcher);
    }

    // 防抖线程：收集 DEBOUNCE_MS 内的 (path, kind)，同一 path 只保留最后一次 kind，再 emit
    std::thread::spawn(move || {
        let mut pending: HashMap<String, FileChangeKind> = HashMap::new();
        let timeout = Duration::from_millis(DEBOUNCE_MS);
        loop {
            match rx.recv_timeout(timeout) {
                Ok((path, kind)) => {
                    pending.insert(path, kind);
                }
                Err(std::sync::mpsc::RecvTimeoutError::Timeout) => {
                    if !pending.is_empty() {
                        for (path, kind) in pending.drain() {
                            let _ = app_handle.emit(
                                EVENT_WORKSPACE_FILE_CHANGED,
                                WorkspaceFileChangedPayload { path, kind },
                            );
                        }
                    }
                }
                Err(std::sync::mpsc::RecvTimeoutError::Disconnected) => break,
            }
        }
    });

    Ok(())
}

/// 停止监听（drop 当前 watcher）
pub fn stop_watching(state: &WatcherState) {
    if let Ok(mut guard) = state.watcher.lock() {
        *guard = None;
    }
}

#[derive(Debug, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WatchWorkspaceArgs {
    pub workspace_root: String,
}

#[tauri::command]
pub fn watch_workspace_command(
    app_handle: tauri::AppHandle,
    state: tauri::State<Arc<WatcherState>>,
    args: WatchWorkspaceArgs,
) -> Result<(), String> {
    let root = args.workspace_root.trim();
    if root.is_empty() {
        stop_watching(state.inner().as_ref());
        return Ok(());
    }
    let path = PathBuf::from(root);
    if !path.is_dir() {
        return Err("workspace_root 不是有效目录".into());
    }
    let canonical = path.canonicalize().map_err(|e| e.to_string())?;
    watch_workspace(app_handle, state.inner().clone(), canonical)
}

#[cfg(test)]
mod tests {
    use super::*;
    use notify::event::{AccessKind, CreateKind, ModifyKind, RemoveKind};

    #[test]
    fn kind_from_event_maps_create_modify_remove() {
        let create = Event::new(EventKind::Create(CreateKind::File));
        assert!(matches!(kind_from_event(&create), Some(FileChangeKind::Create)));
        let modify = Event::new(EventKind::Modify(ModifyKind::Any));
        assert!(matches!(kind_from_event(&modify), Some(FileChangeKind::Modify)));
        let remove = Event::new(EventKind::Remove(RemoveKind::File));
        assert!(matches!(kind_from_event(&remove), Some(FileChangeKind::Remove)));
    }

    #[test]
    fn kind_from_event_returns_none_for_access_and_other() {
        let access = Event::new(EventKind::Access(AccessKind::Read));
        assert!(kind_from_event(&access).is_none());
        let other = Event::new(EventKind::Other);
        assert!(kind_from_event(&other).is_none());
    }

    #[test]
    fn is_ignored_filters_all_ignore_dirs() {
        let root = Path::new("/workspace");
        for dir in IGNORE_DIRS {
            let p = root.join(dir).join("file.rs");
            assert!(is_ignored(&p, root), "{dir} should be ignored");
        }
    }

    #[test]
    fn is_ignored_passes_normal_paths() {
        let root = Path::new("/workspace");
        assert!(!is_ignored(&root.join("src/main.rs"), root));
        assert!(!is_ignored(&root.join("README.md"), root));
    }

    #[test]
    fn is_ignored_catches_nested_ignored_dir() {
        let root = Path::new("/workspace");
        let p = root.join("packages/foo/node_modules/bar/index.js");
        assert!(is_ignored(&p, root));
    }

    #[test]
    fn to_relative_path_inside_root() {
        let root = Path::new("/workspace");
        assert_eq!(
            to_relative_path(root, &root.join("src/main.rs")),
            Some("src/main.rs".into())
        );
    }

    #[test]
    fn to_relative_path_outside_root_returns_none() {
        let root = Path::new("/workspace");
        assert_eq!(to_relative_path(root, Path::new("/other/file.rs")), None);
    }

    #[test]
    fn collect_paths_filters_ignored_and_converts() {
        let root = Path::new("/workspace");
        let mut e = Event::new(EventKind::Create(CreateKind::File));
        e.paths = vec![
            root.join("src/main.rs"),
            root.join("node_modules/foo/bar.js"),
            root.join("lib/util.rs"),
        ];
        let result = collect_paths(&e, root);
        assert_eq!(result.len(), 2);
        assert_eq!(result[0].0, "src/main.rs");
        assert_eq!(result[1].0, "lib/util.rs");
    }

    #[test]
    fn collect_paths_returns_empty_for_access_event() {
        let root = Path::new("/workspace");
        let mut e = Event::new(EventKind::Access(AccessKind::Read));
        e.paths = vec![root.join("src/main.rs")];
        assert!(collect_paths(&e, root).is_empty());
    }

    #[test]
    fn watcher_state_new_is_none() {
        let s = WatcherState::new();
        assert!(s.watcher.lock().unwrap().is_none());
    }

    #[test]
    fn stop_watching_no_panic_on_empty_state() {
        let s = WatcherState::new();
        stop_watching(&s);
    }

    #[test]
    fn watch_workspace_args_deserialize_camel_case() {
        let json = r#"{"workspaceRoot":"/tmp/ws"}"#;
        let args: WatchWorkspaceArgs = serde_json::from_str(json).unwrap();
        assert_eq!(args.workspace_root, "/tmp/ws");
    }
}
