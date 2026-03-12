//! Sandbox-safe `os` module shim for Lua.
//!
//! Provides safe subset of standard Lua os functions.
//! Time/clock are safe. File ops delegate to workspace_ops.
//! Shell execution and env access are blocked.

use mlua::prelude::*;

use crate::workspace_ops;

/// Register the `os` global table with sandbox-safe functions.
pub(super) fn register_os(lua: &Lua, workspace_root: &str) -> LuaResult<()> {
    let os = lua.create_table()?;
    let start = std::time::Instant::now();

    // os.clock() -> CPU time in seconds (relative to start)
    os.set(
        "clock",
        lua.create_function(move |_, ()| {
            Ok(start.elapsed().as_secs_f64())
        })?,
    )?;

    // os.time() -> epoch seconds
    os.set(
        "time",
        lua.create_function(|_, ()| {
            let secs = std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .map(|d| d.as_secs() as i64)
                .unwrap_or(0);
            Ok(secs)
        })?,
    )?;

    // os.date(fmt?, time?) -> formatted date string
    os.set(
        "date",
        lua.create_function(|_, (fmt, time): (Option<String>, Option<i64>)| {
            let fmt = fmt.unwrap_or_else(|| "%c".to_string());
            let dt = if let Some(t) = time {
                chrono::DateTime::from_timestamp(t, 0)
                    .unwrap_or_else(chrono::Utc::now)
            } else {
                chrono::Utc::now()
            };
            let local: chrono::DateTime<chrono::Local> = dt.into();
            // Lua convention: "*t" returns a table
            if fmt == "*t" || fmt == "!*t" {
                return Err(LuaError::runtime(
                    "os.date('*t') table format not supported; use format strings",
                ));
            }
            let fmt_str = fmt.strip_prefix('!').unwrap_or(&fmt);
            let result = if fmt.starts_with('!') {
                dt.format(fmt_str).to_string()
            } else {
                local.format(fmt_str).to_string()
            };
            Ok(result)
        })?,
    )?;

    // os.difftime(t2, t1) -> seconds
    os.set(
        "difftime",
        lua.create_function(|_, (t2, t1): (f64, f64)| Ok(t2 - t1))?,
    )?;

    // os.tmpname() -> workspace-relative temp path, creates empty file
    let wr = workspace_root.to_string();
    let wr_c = wr.clone();
    os.set(
        "tmpname",
        lua.create_function(move |_, ()| {
            let name = format!(".cove-tmp-{:x}", rand_u64());
            workspace_ops::ws_write_file(&wr_c, &name, "")
                .map_err(LuaError::runtime)?;
            Ok(name)
        })?,
    )?;

    // os.remove(path)
    let wr_c = wr.clone();
    os.set(
        "remove",
        lua.create_function(move |_, path: String| {
            workspace_ops::ws_remove(&wr_c, &path).map_err(LuaError::runtime)
        })?,
    )?;

    // os.rename(old, new)
    let wr_c = wr.clone();
    os.set(
        "rename",
        lua.create_function(move |_, (old, new): (String, String)| {
            workspace_ops::ws_move_file(&wr_c, &old, &new).map_err(LuaError::runtime)
        })?,
    )?;

    // Blocked functions
    os.set(
        "execute",
        lua.create_function(|_, _args: mlua::Variadic<LuaValue>| -> LuaResult<()> {
            Err(LuaError::runtime("os.execute is blocked in sandbox"))
        })?,
    )?;

    os.set(
        "exit",
        lua.create_function(|_, _args: mlua::Variadic<LuaValue>| -> LuaResult<()> {
            Err(LuaError::runtime("os.exit is blocked in sandbox"))
        })?,
    )?;

    os.set(
        "getenv",
        lua.create_function(|_, _name: String| -> LuaResult<LuaValue> {
            Ok(LuaValue::Nil)
        })?,
    )?;

    os.set(
        "setlocale",
        lua.create_function(|_, _args: mlua::Variadic<LuaValue>| -> LuaResult<()> {
            Err(LuaError::runtime("os.setlocale is blocked in sandbox"))
        })?,
    )?;

    os.set(
        "popen",
        lua.create_function(|_, _args: mlua::Variadic<LuaValue>| -> LuaResult<()> {
            Err(LuaError::runtime("os.popen is blocked in sandbox"))
        })?,
    )?;

    lua.globals().set("os", os)?;
    Ok(())
}

/// Simple pseudo-random u64 from system time (no external crate needed).
fn rand_u64() -> u64 {
    let t = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default();
    // Mix nanoseconds for uniqueness
    t.as_nanos() as u64 ^ (t.as_secs().wrapping_mul(6364136223846793005))
}
