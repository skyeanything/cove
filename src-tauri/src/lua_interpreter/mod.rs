// FILE_SIZE_EXCEPTION: Lua runtime setup + Tauri command + JSON helpers in single entry point
//! Embedded Lua 5.4 interpreter for sandboxed code execution.
//!
//! AI agent executes Lua code in a safe sandbox with workspace file APIs.
//! Sandbox-safe subsets of io/os are provided (workspace-scoped).

mod io_shim;
mod os_shim;
mod print_capture;
mod workspace;

#[cfg(test)]
mod tests;

use print_capture::PrintCapture;
use workspace::register_workspace_fns;

use mlua::prelude::*;
use serde::{Deserialize, Serialize};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::time::{Duration, Instant};

const OFFICELLM_BRIDGE: &str = include_str!("../officellm_bridge.lua");
const DEFAULT_MEMORY_LIMIT: usize = 64 * 1024 * 1024; // 64 MB
const DEFAULT_TIMEOUT_MS: u64 = 30_000;

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RunLuaArgs {
    pub workspace_root: String,
    pub code: Option<String>,
    pub file: Option<String>,
    #[serde(default)]
    pub timeout_ms: Option<u64>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LuaExecutionResult {
    pub output: String,
    pub result: String,
    pub error: Option<String>,
    pub execution_ms: u64,
}

/// Register json.encode() and json.decode() as Rust-backed functions.
fn register_json(lua: &Lua) -> LuaResult<()> {
    let json_table = lua.create_table()?;

    json_table.set(
        "encode",
        lua.create_function(|_lua, value: LuaValue| {
            let json = lua_value_to_json(&value);
            Ok(serde_json::to_string(&json).unwrap_or_else(|_| "null".to_string()))
        })?,
    )?;

    json_table.set(
        "decode",
        lua.create_function(|lua, s: String| {
            let v: serde_json::Value =
                serde_json::from_str(&s).map_err(|e| LuaError::runtime(e.to_string()))?;
            json_to_lua_value(lua, &v)
        })?,
    )?;

    lua.globals().set("json", json_table)?;
    Ok(())
}

fn lua_value_to_json(val: &LuaValue) -> serde_json::Value {
    match val {
        LuaValue::Nil => serde_json::Value::Null,
        LuaValue::Boolean(b) => serde_json::Value::Bool(*b),
        LuaValue::Integer(n) => serde_json::json!(*n),
        LuaValue::Number(n) => serde_json::json!(*n),
        LuaValue::String(s) => {
            serde_json::Value::String(s.to_string_lossy().to_string())
        }
        LuaValue::Table(t) => {
            // Detect if it's an array (sequential integer keys starting at 1)
            let len = t.raw_len();
            if len > 0 {
                let arr: Vec<serde_json::Value> = (1..=len)
                    .filter_map(|i| t.raw_get::<LuaValue>(i).ok())
                    .map(|v| lua_value_to_json(&v))
                    .collect();
                if arr.len() == len as usize {
                    return serde_json::Value::Array(arr);
                }
            }
            let mut map = serde_json::Map::new();
            if let Ok(pairs) = t.clone().pairs::<LuaValue, LuaValue>().collect::<LuaResult<Vec<_>>>() {
                for (k, v) in pairs {
                    let key = match &k {
                        LuaValue::String(s) => s.to_string_lossy().to_string(),
                        LuaValue::Integer(n) => n.to_string(),
                        LuaValue::Number(n) => n.to_string(),
                        _ => continue,
                    };
                    map.insert(key, lua_value_to_json(&v));
                }
            }
            serde_json::Value::Object(map)
        }
        _ => serde_json::Value::Null,
    }
}

fn json_to_lua_value(lua: &Lua, val: &serde_json::Value) -> LuaResult<LuaValue> {
    match val {
        serde_json::Value::Null => Ok(LuaValue::Nil),
        serde_json::Value::Bool(b) => Ok(LuaValue::Boolean(*b)),
        serde_json::Value::Number(n) => {
            if let Some(i) = n.as_i64() {
                Ok(LuaValue::Integer(i))
            } else {
                Ok(LuaValue::Number(n.as_f64().unwrap_or(0.0)))
            }
        }
        serde_json::Value::String(s) => Ok(LuaValue::String(lua.create_string(s)?)),
        serde_json::Value::Array(arr) => {
            let table = lua.create_table()?;
            for (i, v) in arr.iter().enumerate() {
                table.set(i + 1, json_to_lua_value(lua, v)?)?;
            }
            Ok(LuaValue::Table(table))
        }
        serde_json::Value::Object(map) => {
            let table = lua.create_table()?;
            for (k, v) in map {
                table.set(k.as_str(), json_to_lua_value(lua, v)?)?;
            }
            Ok(LuaValue::Table(table))
        }
    }
}

fn lua_value_to_string(val: &LuaValue) -> String {
    match val {
        LuaValue::Nil => "nil".to_string(),
        LuaValue::Boolean(b) => b.to_string(),
        LuaValue::Integer(n) => n.to_string(),
        LuaValue::Number(n) => n.to_string(),
        LuaValue::String(s) => s.to_string_lossy().to_string(),
        LuaValue::Table(_) => {
            let json = lua_value_to_json(val);
            serde_json::to_string(&json).unwrap_or_else(|_| "table".to_string())
        }
        _ => format!("{val:?}"),
    }
}

/// Strip a `#!` shebang line from Lua source so mlua can parse it.
fn strip_shebang(source: &str) -> &str {
    match source.strip_prefix("#!") {
        Some(rest) => rest.split_once('\n').map_or("", |(_, after)| after),
        None => source,
    }
}

/// Run Lua code without AppHandle dependency (for tests).
pub(crate) fn run_lua_inner(
    workspace_root: &str,
    code: Option<&str>,
    file: Option<&str>,
    timeout_ms: u64,
    officellm_home: Option<&std::path::Path>,
) -> Result<LuaExecutionResult, String> {
    let timeout_ms = timeout_ms.min(60_000);
    let start = Instant::now();
    let deadline = start + Duration::from_millis(timeout_ms);

    let timed_out = Arc::new(AtomicBool::new(false));
    let timed_out_clone = timed_out.clone();

    let lua = Lua::new();
    let _ = lua.set_memory_limit(DEFAULT_MEMORY_LIMIT);
    lua.set_hook(
        mlua::HookTriggers::new().every_nth_instruction(4096),
        move |_lua, _debug| {
            if Instant::now() >= deadline {
                timed_out_clone.store(true, Ordering::Relaxed);
                Err(LuaError::runtime("execution timed out"))
            } else {
                Ok(mlua::VmState::Continue)
            }
        },
    );

    // Remove dangerous modules (sandbox)
    let globals = lua.globals();
    for module in &["os", "io", "package", "debug", "dofile", "loadfile"] {
        let _ = globals.set(*module, LuaValue::Nil);
    }
    // Remove require
    let _ = globals.set("require", LuaValue::Nil);

    // Register sandbox-safe io/os shims (after clearing originals)
    io_shim::register_io(&lua, workspace_root)
        .map_err(|e| format!("io shim setup: {e}"))?;
    os_shim::register_os(&lua, workspace_root)
        .map_err(|e| format!("os shim setup: {e}"))?;

    let print_buf = PrintCapture::new();
    let print_buf_clone = print_buf.clone();
    let print_fn = lua
        .create_function(move |_, args: mlua::Variadic<LuaValue>| {
            let parts: Vec<String> = args.iter().map(lua_value_to_string).collect();
            print_buf_clone.push(parts.join("\t"));
            Ok(())
        })
        .map_err(|e| format!("print setup: {e}"))?;
    globals.set("print", print_fn).map_err(|e| format!("{e}"))?;

    register_json(&lua).map_err(|e| format!("json setup: {e}"))?;
    register_workspace_fns(&lua, workspace_root, officellm_home)
        .map_err(|e| format!("workspace setup: {e}"))?;

    // Auto-inject officellm bridge when binary is available
    if officellm_home.is_some() {
        lua.load(OFFICELLM_BRIDGE)
            .exec()
            .map_err(|e| format!("officellm bridge init: {e}"))?;
    }

    // Resolve code to execute
    let source = if let Some(file_path) = file {
        crate::workspace_ops::ws_read_file(workspace_root, file_path)?
    } else if let Some(code) = code {
        code.to_string()
    } else {
        return Err("either code or file must be provided".to_string());
    };

    let eval_result: LuaResult<LuaValue> = lua.load(strip_shebang(&source)).eval();
    let execution_ms = start.elapsed().as_millis() as u64;

    if timed_out.load(Ordering::Relaxed) {
        return Ok(LuaExecutionResult {
            output: print_buf.join("\n"),
            result: String::new(),
            error: Some(format!("Execution timed out after {timeout_ms}ms")),
            execution_ms,
        });
    }

    match eval_result {
        Ok(val) => {
            let result_str = lua_value_to_string(&val);
            Ok(LuaExecutionResult {
                output: print_buf.join("\n"),
                result: result_str,
                error: None,
                execution_ms,
            })
        }
        Err(e) => Ok(LuaExecutionResult {
            output: print_buf.join("\n"),
            result: String::new(),
            error: Some(format!("{e}")),
            execution_ms,
        }),
    }
}

#[tauri::command]
pub fn run_lua(app: tauri::AppHandle, args: RunLuaArgs) -> Result<LuaExecutionResult, String> {
    let timeout_ms = args.timeout_ms.unwrap_or(DEFAULT_TIMEOUT_MS);
    let officellm_home = crate::officellm::resolve::resolve_bin()
        .map(|(_, is_bundled)| crate::officellm::resolve::resolve_home(is_bundled, &app))
        .transpose()?;
    run_lua_inner(
        &args.workspace_root,
        args.code.as_deref(),
        args.file.as_deref(),
        timeout_ms,
        officellm_home.as_deref(),
    )
}
