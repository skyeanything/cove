//! 嵌入式 QuickJS JavaScript 代码解释器。
//!
//! 通过 rquickjs 嵌入 QuickJS 引擎，AI agent 可直接执行 JS 代码。
//! 引擎天然沙箱：默认不暴露文件系统/网络/进程 API，仅注册受控的安全函数。

use rquickjs::{Context, Function, Runtime};
use serde::{Deserialize, Serialize};
use std::cell::RefCell;
use std::collections::HashMap;
use std::rc::Rc;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::time::{Duration, Instant};

use crate::fs_commands::{ensure_inside_workspace_exists, ensure_inside_workspace_may_not_exist};

const DEFAULT_MEMORY_LIMIT: usize = 64 * 1024 * 1024; // 64 MB
const DEFAULT_MAX_STACK: usize = 512 * 1024; // 512 KB
const DEFAULT_TIMEOUT_MS: u64 = 30_000;

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RunJsArgs {
    pub workspace_root: String,
    pub code: String,
    #[serde(default)]
    pub timeout_ms: Option<u64>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct JsExecutionResult {
    pub output: String,
    pub result: String,
    pub error: Option<String>,
    pub execution_ms: u64,
}

fn js_err(msg: &str) -> rquickjs::Error {
    rquickjs::Error::new_from_js_message("value", "value", msg.to_string())
}

#[tauri::command]
pub fn run_js(args: RunJsArgs) -> Result<JsExecutionResult, String> {
    let timeout_ms = args.timeout_ms.unwrap_or(DEFAULT_TIMEOUT_MS).min(60_000);
    let start = Instant::now();

    let timed_out = Arc::new(AtomicBool::new(false));
    let timed_out_clone = timed_out.clone();
    let deadline = start + Duration::from_millis(timeout_ms);

    let rt = Runtime::new().map_err(|e| format!("QuickJS init: {e}"))?;
    rt.set_memory_limit(DEFAULT_MEMORY_LIMIT);
    rt.set_max_stack_size(DEFAULT_MAX_STACK);
    rt.set_interrupt_handler(Some(Box::new(move || {
        if Instant::now() >= deadline {
            timed_out_clone.store(true, Ordering::Relaxed);
            return true;
        }
        false
    })));

    let ctx = Context::full(&rt).map_err(|e| format!("Context init: {e}"))?;
    let workspace_root = args.workspace_root.clone();
    let code = args.code.clone();

    ctx.with(|ctx| {
        let globals = ctx.globals();
        let buf: Rc<RefCell<Vec<String>>> = Rc::new(RefCell::new(Vec::new()));

        // --- console ---
        let console = rquickjs::Object::new(ctx.clone())
            .map_err(|e| format!("{e}"))?;

        register_console_fn(&ctx, &console, "log", buf.clone(), "")?;
        register_console_fn(&ctx, &console, "error", buf.clone(), "[error] ")?;
        register_console_fn(&ctx, &console, "warn", buf.clone(), "[warn] ")?;
        globals.set("console", console).map_err(|e| format!("{e}"))?;

        // --- workspace ---
        let ws = rquickjs::Object::new(ctx.clone()).map_err(|e| format!("{e}"))?;
        register_workspace_fns(&ctx, &ws, &workspace_root)?;
        globals.set("workspace", ws).map_err(|e| format!("{e}"))?;

        // --- eval ---
        let eval_result: Result<rquickjs::Value, _> = ctx.eval(code.as_bytes());
        let execution_ms = start.elapsed().as_millis() as u64;

        if timed_out.load(Ordering::Relaxed) {
            return Ok(JsExecutionResult {
                output: buf.borrow().join("\n"),
                result: String::new(),
                error: Some(format!("Execution timed out after {timeout_ms}ms")),
                execution_ms,
            });
        }

        match eval_result {
            Ok(val) => {
                let result_str = stringify_value(&val);
                Ok(JsExecutionResult {
                    output: buf.borrow().join("\n"),
                    result: result_str,
                    error: None,
                    execution_ms,
                })
            }
            Err(e) => Ok(JsExecutionResult {
                output: buf.borrow().join("\n"),
                result: String::new(),
                error: Some(format!("{e}")),
                execution_ms,
            }),
        }
    })
}

fn register_console_fn<'js>(
    ctx: &rquickjs::Ctx<'js>,
    console: &rquickjs::Object<'js>,
    name: &str,
    buf: Rc<RefCell<Vec<String>>>,
    prefix: &'static str,
) -> Result<(), String> {
    let f = Function::new(
        ctx.clone(),
        move |args: rquickjs::function::Rest<rquickjs::Value>| {
            let parts: Vec<String> = args
                .0
                .iter()
                .map(|v| {
                    v.as_string()
                        .and_then(|s| s.to_string().ok())
                        .unwrap_or_else(|| format!("{v:?}"))
                })
                .collect();
            let line = if prefix.is_empty() {
                parts.join(" ")
            } else {
                format!("{prefix}{}", parts.join(" "))
            };
            buf.borrow_mut().push(line);
        },
    )
    .map_err(|e| format!("{e}"))?;
    console.set(name, f).map_err(|e| format!("{e}"))
}

fn register_workspace_fns<'js>(
    ctx: &rquickjs::Ctx<'js>,
    ws: &rquickjs::Object<'js>,
    workspace_root: &str,
) -> Result<(), String> {
    let wr = workspace_root.to_string();
    let read_fn = Function::new(ctx.clone(), move |path: String| -> rquickjs::Result<String> {
        let abs = ensure_inside_workspace_exists(&wr, &path)
            .map_err(|_| js_err("path outside workspace"))?;
        std::fs::read_to_string(&abs).map_err(|e| {
            let msg = e.to_string();
            js_err(&msg)
        })
    })
    .map_err(|e| format!("{e}"))?;
    ws.set("readFile", read_fn).map_err(|e| format!("{e}"))?;

    let wr2 = workspace_root.to_string();
    let write_fn = Function::new(
        ctx.clone(),
        move |path: String, content: String| -> rquickjs::Result<()> {
            let abs = ensure_inside_workspace_may_not_exist(&wr2, &path)
                .map_err(|_| js_err("path outside workspace"))?;
            if let Some(parent) = abs.parent() {
                std::fs::create_dir_all(parent).map_err(|e| {
                    let msg = e.to_string();
                    js_err(&msg)
                })?;
            }
            std::fs::write(&abs, content).map_err(|e| {
                let msg = e.to_string();
                js_err(&msg)
            })
        },
    )
    .map_err(|e| format!("{e}"))?;
    ws.set("writeFile", write_fn).map_err(|e| format!("{e}"))?;

    let wr3 = workspace_root.to_string();
    let list_fn = Function::new(
        ctx.clone(),
        move |path: String| -> rquickjs::Result<Vec<String>> {
            let abs = ensure_inside_workspace_exists(&wr3, &path)
                .map_err(|_| js_err("path outside workspace"))?;
            let entries = std::fs::read_dir(&abs).map_err(|e| {
                let msg = e.to_string();
                js_err(&msg)
            })?;
            Ok(entries
                .filter_map(|e| e.ok())
                .map(|e| e.file_name().to_string_lossy().into_owned())
                .collect())
        },
    )
    .map_err(|e| format!("{e}"))?;
    ws.set("listDir", list_fn).map_err(|e| format!("{e}"))?;

    let wr4 = workspace_root.to_string();
    let officellm_fn = Function::new(
        ctx.clone(),
        move |cmd: String, mut args: HashMap<String, String>| -> rquickjs::Result<String> {
            // 路径边界校验：防 `..` 逃逸，拒绝 workspace 外路径（绝对/相对均检查）
            // 输入类路径文件必须存在，输出类路径可不存在
            for key in &["i", "input", "path"] {
                if let Some(v) = args.get(*key) {
                    let abs = ensure_inside_workspace_exists(&wr4, v)
                        .map_err(|e| js_err(&format!("{e:?}")))?;
                    args.insert(key.to_string(), abs.to_string_lossy().into_owned());
                }
            }
            for key in &["o", "output"] {
                if let Some(v) = args.get(*key) {
                    let abs = ensure_inside_workspace_may_not_exist(&wr4, v)
                        .map_err(|e| js_err(&format!("{e:?}")))?;
                    args.insert(key.to_string(), abs.to_string_lossy().into_owned());
                }
            }

            let result: Result<serde_json::Value, String> = match cmd.as_str() {
                "open" => {
                    let path = args.get("path").ok_or_else(|| "open 需要 path 参数".to_string()).map_err(|e| js_err(&e))?;
                    crate::officellm::server::open(path)
                        .map(|_| serde_json::json!({"status":"success"}))
                }
                "close" => {
                    crate::officellm::server::close()
                        .map(|_| serde_json::json!({"status":"success"}))
                }
                "status" => {
                    crate::officellm::server::status()
                        .map(|info| serde_json::json!({"status":"success","data": info}))
                }
                _ => {
                    // 将 HashMap 转换为 CLI 风格参数数组，如 {"limit":"10"} → ["--limit","10"]
                    let cli_args: Vec<String> = args.iter().flat_map(|(key, value)| {
                        let flag = if key.len() == 1 { format!("-{key}") } else { format!("--{key}") };
                        [flag, value.clone()]
                    }).collect();
                    let r = if crate::officellm::server::has_session() {
                        crate::officellm::server::call(&cmd, &cli_args)
                            .map(|r| serde_json::to_value(&r).unwrap_or(serde_json::Value::Null))
                    } else {
                        crate::officellm::cli::call(&cmd, &cli_args)
                            .map(|r| serde_json::to_value(&r).unwrap_or(serde_json::Value::Null))
                    };
                    r
                }
            };

            match result {
                Ok(v) => serde_json::to_string(&v).map_err(|e| js_err(&e.to_string())),
                Err(e) => Err(js_err(&e)),
            }
        },
    )
    .map_err(|e| format!("{e}"))?;
    ws.set("officellm", officellm_fn).map_err(|e| format!("{e}"))
}

fn stringify_value(val: &rquickjs::Value) -> String {
    val.as_string()
        .and_then(|s| s.to_string().ok())
        .unwrap_or_else(|| {
            if val.is_undefined() || val.is_null() {
                "undefined".to_string()
            } else {
                format!("{val:?}")
            }
        })
}
