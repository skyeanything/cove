//! Embedded QuickJS JavaScript interpreter.
//!
//! AI agent executes JS code in a sandboxed QuickJS engine.
//! No file system/network/process APIs by default; only controlled workspace functions.

mod console;
mod workspace;
mod workspace_officellm;

#[cfg(test)]
mod tests;

use console::{register_console_fn, stringify_value};
use workspace::register_workspace_fns;

/// OfficeLLM bridge: provides `officellm.open()` / `doc.call()` / etc.
/// Auto-injected when officellm binary is available.
const OFFICELLM_BRIDGE: &str = include_str!("../officellm_bridge.js");

use rquickjs::{CaughtError, Context, Runtime};
use serde::{Deserialize, Serialize};
use std::cell::RefCell;
use std::rc::Rc;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::time::{Duration, Instant};

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

/// Run JS code without AppHandle dependency (for tests).
pub(crate) fn run_js_inner(
    workspace_root: &str,
    code: &str,
    timeout_ms: u64,
    officellm_home: Option<&std::path::Path>,
) -> Result<JsExecutionResult, String> {
    let timeout_ms = timeout_ms.min(60_000);
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
    let workspace_root = workspace_root.to_string();
    let code = code.to_string();

    ctx.with(|ctx| {
        let globals = ctx.globals();
        let buf: Rc<RefCell<Vec<String>>> = Rc::new(RefCell::new(Vec::new()));

        let console = rquickjs::Object::new(ctx.clone()).map_err(|e| format!("{e}"))?;
        register_console_fn(&ctx, &console, "log", buf.clone(), "")?;
        register_console_fn(&ctx, &console, "error", buf.clone(), "[error] ")?;
        register_console_fn(&ctx, &console, "warn", buf.clone(), "[warn] ")?;
        globals.set("console", console).map_err(|e| format!("{e}"))?;

        let ws = rquickjs::Object::new(ctx.clone()).map_err(|e| format!("{e}"))?;
        register_workspace_fns(&ctx, &ws, &workspace_root, officellm_home)?;
        globals.set("workspace", ws).map_err(|e| format!("{e}"))?;

        // Install JS wrapper: workspace.stat returns parsed object from _statRaw JSON
        let _: rquickjs::Value = ctx
            .eval(b"workspace.stat = function(p) { return JSON.parse(workspace._statRaw(p)); };")
            .map_err(|e| format!("{e}"))?;

        // Auto-inject officellm bridge when binary is available
        if officellm_home.is_some() {
            ctx.eval::<(), _>(OFFICELLM_BRIDGE.as_bytes())
                .map_err(|e| format!("officellm bridge init: {e}"))?;
        }

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
            Err(e) => {
                let caught = CaughtError::from_error(&ctx, e);
                Ok(JsExecutionResult {
                    output: buf.borrow().join("\n"),
                    result: String::new(),
                    error: Some(format!("{caught}")),
                    execution_ms,
                })
            }
        }
    })
}

#[tauri::command]
pub fn run_js(app: tauri::AppHandle, args: RunJsArgs) -> Result<JsExecutionResult, String> {
    let timeout_ms = args.timeout_ms.unwrap_or(DEFAULT_TIMEOUT_MS);
    let officellm_home = crate::officellm::resolve::resolve_bin()
        .map(|(_, is_bundled)| crate::officellm::resolve::resolve_home(is_bundled, &app))
        .transpose()?;
    run_js_inner(
        &args.workspace_root,
        &args.code,
        timeout_ms,
        officellm_home.as_deref(),
    )
}
