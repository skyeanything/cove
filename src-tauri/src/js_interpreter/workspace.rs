// FILE_SIZE_EXCEPTION: security validation adds pre-check lines to glob handler
use rquickjs::Function;

use crate::fs_commands::{
    ensure_inside_workspace_exists, ensure_inside_workspace_may_not_exist,
    is_binary_content, path_has_binary_extension,
};

use super::js_err;
use super::workspace_officellm::register_officellm;

pub(super) fn register_workspace_fns<'js>(
    ctx: &rquickjs::Ctx<'js>,
    ws: &rquickjs::Object<'js>,
    workspace_root: &str,
    officellm_home: Option<&std::path::Path>,
) -> Result<(), String> {
    register_read_file(ctx, ws, workspace_root)?;
    register_write_file(ctx, ws, workspace_root)?;
    register_list_dir(ctx, ws, workspace_root)?;
    register_exists(ctx, ws, workspace_root)?;
    register_stat(ctx, ws, workspace_root)?;
    register_copy_file(ctx, ws, workspace_root)?;
    register_move_file(ctx, ws, workspace_root)?;
    register_remove(ctx, ws, workspace_root)?;
    register_create_dir(ctx, ws, workspace_root)?;
    register_glob(ctx, ws, workspace_root)?;
    register_append_file(ctx, ws, workspace_root)?;
    register_officellm(ctx, ws, workspace_root, officellm_home)?;
    Ok(())
}

fn register_read_file<'js>(
    ctx: &rquickjs::Ctx<'js>,
    ws: &rquickjs::Object<'js>,
    workspace_root: &str,
) -> Result<(), String> {
    let wr = workspace_root.to_string();
    let f = Function::new(ctx.clone(), move |path: String| -> rquickjs::Result<String> {
        let abs = ensure_inside_workspace_exists(&wr, &path)
            .map_err(|_| js_err("path outside workspace"))?;
        std::fs::read_to_string(&abs).map_err(|e| js_err(&e.to_string()))
    })
    .map_err(|e| format!("{e}"))?;
    ws.set("readFile", f).map_err(|e| format!("{e}"))
}

fn register_write_file<'js>(
    ctx: &rquickjs::Ctx<'js>,
    ws: &rquickjs::Object<'js>,
    workspace_root: &str,
) -> Result<(), String> {
    let wr = workspace_root.to_string();
    let f = Function::new(
        ctx.clone(),
        move |path: String, content: String| -> rquickjs::Result<()> {
            let abs = ensure_inside_workspace_may_not_exist(&wr, &path)
                .map_err(|_| js_err("path outside workspace"))?;
            if let Some(parent) = abs.parent() {
                std::fs::create_dir_all(parent).map_err(|e| js_err(&e.to_string()))?;
            }
            std::fs::write(&abs, content).map_err(|e| js_err(&e.to_string()))
        },
    )
    .map_err(|e| format!("{e}"))?;
    ws.set("writeFile", f).map_err(|e| format!("{e}"))
}

fn register_list_dir<'js>(
    ctx: &rquickjs::Ctx<'js>,
    ws: &rquickjs::Object<'js>,
    workspace_root: &str,
) -> Result<(), String> {
    let wr = workspace_root.to_string();
    let f = Function::new(
        ctx.clone(),
        move |path: String| -> rquickjs::Result<Vec<String>> {
            let abs = ensure_inside_workspace_exists(&wr, &path)
                .map_err(|_| js_err("path outside workspace"))?;
            let entries = std::fs::read_dir(&abs).map_err(|e| js_err(&e.to_string()))?;
            Ok(entries
                .filter_map(|e| e.ok())
                .map(|e| e.file_name().to_string_lossy().into_owned())
                .collect())
        },
    )
    .map_err(|e| format!("{e}"))?;
    ws.set("listDir", f).map_err(|e| format!("{e}"))
}

fn register_exists<'js>(
    ctx: &rquickjs::Ctx<'js>,
    ws: &rquickjs::Object<'js>,
    workspace_root: &str,
) -> Result<(), String> {
    let wr = workspace_root.to_string();
    let f = Function::new(ctx.clone(), move |path: String| -> rquickjs::Result<bool> {
        let abs = match ensure_inside_workspace_may_not_exist(&wr, &path) {
            Ok(p) => p,
            Err(_) => return Ok(false),
        };
        Ok(abs.exists())
    })
    .map_err(|e| format!("{e}"))?;
    ws.set("exists", f).map_err(|e| format!("{e}"))
}

fn register_stat<'js>(
    ctx: &rquickjs::Ctx<'js>,
    ws: &rquickjs::Object<'js>,
    workspace_root: &str,
) -> Result<(), String> {
    let wr = workspace_root.to_string();
    let f = Function::new(ctx.clone(), move |path: String| -> rquickjs::Result<String> {
        let abs = ensure_inside_workspace_exists(&wr, &path)
            .map_err(|_| js_err("path outside workspace or not found"))?;
        let meta = std::fs::metadata(&abs).map_err(|e| js_err(&e.to_string()))?;
        let is_dir = meta.is_dir();
        let size = meta.len();
        let mtime = meta
            .modified()
            .ok()
            .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
            .map(|d| d.as_secs())
            .unwrap_or(0);
        let is_binary = if is_dir {
            false
        } else if path_has_binary_extension(&abs) {
            true
        } else {
            std::fs::File::open(&abs)
                .ok()
                .and_then(|f| is_binary_content(f).ok())
                .unwrap_or(false)
        };
        Ok(format!(
            r#"{{"size":{size},"mtime":{mtime},"isDir":{is_dir},"isBinary":{is_binary}}}"#
        ))
    })
    .map_err(|e| format!("{e}"))?;
    ws.set("_statRaw", f).map_err(|e| format!("{e}"))
    // Note: JS wrapper (workspace.stat) is installed in mod.rs after globals are set
}

fn register_copy_file<'js>(
    ctx: &rquickjs::Ctx<'js>,
    ws: &rquickjs::Object<'js>,
    workspace_root: &str,
) -> Result<(), String> {
    let wr = workspace_root.to_string();
    let f = Function::new(
        ctx.clone(),
        move |src: String, dst: String| -> rquickjs::Result<()> {
            let abs_src = ensure_inside_workspace_exists(&wr, &src)
                .map_err(|_| js_err("source path outside workspace or not found"))?;
            let abs_dst = ensure_inside_workspace_may_not_exist(&wr, &dst)
                .map_err(|_| js_err("destination path outside workspace"))?;
            if let Some(parent) = abs_dst.parent() {
                std::fs::create_dir_all(parent).map_err(|e| js_err(&e.to_string()))?;
            }
            std::fs::copy(&abs_src, &abs_dst).map_err(|e| js_err(&e.to_string()))?;
            Ok(())
        },
    )
    .map_err(|e| format!("{e}"))?;
    ws.set("copyFile", f).map_err(|e| format!("{e}"))
}

fn register_move_file<'js>(
    ctx: &rquickjs::Ctx<'js>,
    ws: &rquickjs::Object<'js>,
    workspace_root: &str,
) -> Result<(), String> {
    let wr = workspace_root.to_string();
    let f = Function::new(
        ctx.clone(),
        move |src: String, dst: String| -> rquickjs::Result<()> {
            let abs_src = ensure_inside_workspace_exists(&wr, &src)
                .map_err(|_| js_err("source path outside workspace or not found"))?;
            let abs_dst = ensure_inside_workspace_may_not_exist(&wr, &dst)
                .map_err(|_| js_err("destination path outside workspace"))?;
            if let Some(parent) = abs_dst.parent() {
                std::fs::create_dir_all(parent).map_err(|e| js_err(&e.to_string()))?;
            }
            std::fs::rename(&abs_src, &abs_dst).map_err(|e| js_err(&e.to_string()))?;
            Ok(())
        },
    )
    .map_err(|e| format!("{e}"))?;
    ws.set("moveFile", f).map_err(|e| format!("{e}"))
}

fn register_remove<'js>(
    ctx: &rquickjs::Ctx<'js>,
    ws: &rquickjs::Object<'js>,
    workspace_root: &str,
) -> Result<(), String> {
    let wr = workspace_root.to_string();
    let f = Function::new(ctx.clone(), move |path: String| -> rquickjs::Result<()> {
        let abs = ensure_inside_workspace_exists(&wr, &path)
            .map_err(|_| js_err("path outside workspace or not found"))?;
        let meta = std::fs::metadata(&abs).map_err(|e| js_err(&e.to_string()))?;
        if meta.is_dir() {
            std::fs::remove_dir(&abs).map_err(|e| js_err(&e.to_string()))?;
        } else {
            std::fs::remove_file(&abs).map_err(|e| js_err(&e.to_string()))?;
        }
        Ok(())
    })
    .map_err(|e| format!("{e}"))?;
    ws.set("remove", f).map_err(|e| format!("{e}"))
}

fn register_create_dir<'js>(
    ctx: &rquickjs::Ctx<'js>,
    ws: &rquickjs::Object<'js>,
    workspace_root: &str,
) -> Result<(), String> {
    let wr = workspace_root.to_string();
    let f = Function::new(ctx.clone(), move |path: String| -> rquickjs::Result<()> {
        let abs = ensure_inside_workspace_may_not_exist(&wr, &path)
            .map_err(|_| js_err("path outside workspace"))?;
        std::fs::create_dir_all(&abs).map_err(|e| js_err(&e.to_string()))?;
        Ok(())
    })
    .map_err(|e| format!("{e}"))?;
    ws.set("createDir", f).map_err(|e| format!("{e}"))
}

fn register_glob<'js>(
    ctx: &rquickjs::Ctx<'js>,
    ws: &rquickjs::Object<'js>,
    workspace_root: &str,
) -> Result<(), String> {
    let wr = workspace_root.to_string();
    let f = Function::new(
        ctx.clone(),
        move |pattern: String| -> rquickjs::Result<Vec<String>> {
            // Pre-validate: reject patterns that would scan outside workspace
            if std::path::Path::new(&pattern).is_absolute() {
                return Err(js_err("absolute glob patterns not allowed"));
            }
            if std::path::Path::new(&pattern).components().any(|c| matches!(c, std::path::Component::ParentDir)) {
                return Err(js_err("glob pattern must not contain parent traversal"));
            }
            let root = std::path::Path::new(&wr);
            let full_pattern = root.join(&pattern).to_string_lossy().into_owned();
            let paths = glob::glob(&full_pattern).map_err(|e| js_err(&e.to_string()))?;

            let canonical_root = root.canonicalize().map_err(|e| js_err(&e.to_string()))?;

            const GLOB_LIMIT: usize = 1000;
            let mut results = Vec::new();
            for entry in paths {
                let p = entry.map_err(|e| js_err(&e.to_string()))?;
                let canonical = match p.canonicalize() {
                    Ok(c) => c,
                    Err(_) => continue,
                };
                if !canonical.starts_with(&canonical_root) {
                    continue;
                }
                if let Ok(rel) = canonical.strip_prefix(&canonical_root) {
                    results.push(rel.to_string_lossy().into_owned());
                }
                if results.len() >= GLOB_LIMIT {
                    break;
                }
            }
            Ok(results)
        },
    )
    .map_err(|e| format!("{e}"))?;
    ws.set("glob", f).map_err(|e| format!("{e}"))
}

fn register_append_file<'js>(
    ctx: &rquickjs::Ctx<'js>,
    ws: &rquickjs::Object<'js>,
    workspace_root: &str,
) -> Result<(), String> {
    use std::io::Write;
    let wr = workspace_root.to_string();
    let f = Function::new(
        ctx.clone(),
        move |path: String, content: String| -> rquickjs::Result<()> {
            let abs = ensure_inside_workspace_may_not_exist(&wr, &path)
                .map_err(|_| js_err("path outside workspace"))?;
            if let Some(parent) = abs.parent() {
                std::fs::create_dir_all(parent).map_err(|e| js_err(&e.to_string()))?;
            }
            let mut file = std::fs::OpenOptions::new()
                .create(true)
                .append(true)
                .open(&abs)
                .map_err(|e| js_err(&e.to_string()))?;
            file.write_all(content.as_bytes())
                .map_err(|e| js_err(&e.to_string()))?;
            Ok(())
        },
    )
    .map_err(|e| format!("{e}"))?;
    ws.set("appendFile", f).map_err(|e| format!("{e}"))
}

