// FILE_SIZE_EXCEPTION: io module shim with file handle methods (read/write/seek/lines/close) in single file
//! Sandbox-safe `io` module shim for Lua.
//!
//! Provides workspace-scoped implementations of standard Lua io functions.
//! All file paths validated through workspace_ops. No access outside workspace.

use mlua::prelude::*;

use crate::workspace_ops;

/// Register the `io` global table with sandbox-safe functions.
pub(super) fn register_io(lua: &Lua, workspace_root: &str) -> LuaResult<()> {
    let io = lua.create_table()?;
    let wr = workspace_root.to_string();

    // io.open(path, mode?) -> handle, nil | nil, errmsg
    let wr_c = wr.clone();
    io.set(
        "open",
        lua.create_function(move |lua, (path, mode): (String, Option<String>)| {
            let mode = mode.unwrap_or_else(|| "r".to_string());
            match create_file_handle(lua, &wr_c, &path, &mode) {
                Ok(handle) => Ok((handle, LuaValue::Nil)),
                Err(e) => Ok((
                    LuaValue::Nil,
                    LuaValue::String(lua.create_string(&e.to_string())?),
                )),
            }
        })?,
    )?;

    // io.read(fmt?) -> nil  (no stdin in sandbox)
    io.set(
        "read",
        lua.create_function(|_, _fmt: Option<String>| Ok(LuaValue::Nil))?,
    )?;

    // io.write(...) -> redirects to print capture (noop here, print is separate)
    io.set(
        "write",
        lua.create_function(|_, _args: mlua::Variadic<String>| Ok(()))?,
    )?;

    // io.lines(path) -> iterator over lines
    let wr_c = wr.clone();
    io.set(
        "lines",
        lua.create_function(move |lua, path: String| {
            let content = workspace_ops::ws_read_file(&wr_c, &path)
                .map_err(LuaError::runtime)?;
            let lines: Vec<String> = content.lines().map(|l| l.to_string()).collect();
            let idx = lua.create_userdata(LineIterState { lines, pos: 0 })?;
            let iter = lua.create_function(move |lua, ud: LuaAnyUserData| {
                let mut state = ud.borrow_mut::<LineIterState>()?;
                if state.pos < state.lines.len() {
                    let line = state.lines[state.pos].clone();
                    state.pos += 1;
                    Ok(LuaValue::String(lua.create_string(&line)?))
                } else {
                    Ok(LuaValue::Nil)
                }
            })?;
            Ok((iter, idx))
        })?,
    )?;

    // io.close(handle) -> delegates to handle:close()
    io.set(
        "close",
        lua.create_function(|_, handle: LuaTable| {
            let close_fn: LuaFunction = handle.get("close")?;
            close_fn.call::<()>(())
        })?,
    )?;

    // io.type(obj) -> "file" | "closed file" | nil
    io.set(
        "type",
        lua.create_function(|lua, val: LuaValue| {
            if let LuaValue::Table(t) = &val {
                if t.get::<String>("_io_type").is_ok() {
                    let closed = t
                        .get::<LuaTable>("_state")
                        .ok()
                        .and_then(|s| s.get::<bool>("closed").ok())
                        .unwrap_or(false);
                    let marker = if closed { "closed file" } else { "file" };
                    return Ok(LuaValue::String(lua.create_string(marker)?));
                }
            }
            Ok(LuaValue::Nil)
        })?,
    )?;

    // io.tmpfile() -> error
    io.set(
        "tmpfile",
        lua.create_function(|_, ()| -> LuaResult<()> {
            Err(LuaError::runtime("io.tmpfile is not supported in sandbox"))
        })?,
    )?;

    // io.popen() -> error
    io.set(
        "popen",
        lua.create_function(|_, _args: mlua::Variadic<LuaValue>| -> LuaResult<()> {
            Err(LuaError::runtime("io.popen is blocked in sandbox"))
        })?,
    )?;

    lua.globals().set("io", io)?;
    Ok(())
}

/// State for io.lines() iterator.
struct LineIterState {
    lines: Vec<String>,
    pos: usize,
}

impl mlua::UserData for LineIterState {}

/// Create a file handle table with read/write/close/lines/seek/flush methods.
fn create_file_handle(
    lua: &Lua,
    workspace_root: &str,
    path: &str,
    mode: &str,
) -> LuaResult<LuaValue> {
    let handle = lua.create_table()?;
    handle.set("_io_type", "file")?;

    match mode.trim_end_matches('b') {
        "r" => create_read_handle(lua, workspace_root, path, &handle)?,
        "w" => create_write_handle(lua, workspace_root, path, &handle, false)?,
        "a" => create_write_handle(lua, workspace_root, path, &handle, true)?,
        _ => return Err(LuaError::runtime(format!("unsupported mode: {mode}"))),
    }

    Ok(LuaValue::Table(handle))
}

fn create_read_handle(
    lua: &Lua,
    workspace_root: &str,
    path: &str,
    handle: &LuaTable,
) -> LuaResult<()> {
    let content = workspace_ops::ws_read_file(workspace_root, path)
        .map_err(LuaError::runtime)?;
    let state = lua.create_table()?;
    state.set("content", content)?;
    state.set("pos", 0i64)?;
    state.set("closed", false)?;
    handle.set("_state", state.clone())?;

    // handle:read(fmt?)
    let st = state.clone();
    handle.set(
        "read",
        lua.create_function(move |lua, (_, fmt): (LuaValue, Option<String>)| {
            if st.get::<bool>("closed")? {
                return Err(LuaError::runtime("attempt to use a closed file"));
            }
            let content: String = st.get("content")?;
            let pos: usize = st.get::<i64>("pos")? as usize;
            let fmt = fmt.unwrap_or_else(|| "*l".to_string());
            read_with_format(lua, &content, pos, &fmt, &st)
        })?,
    )?;

    // handle:lines()
    let st = state.clone();
    handle.set(
        "lines",
        lua.create_function(move |lua, _self_arg: LuaValue| {
            let content: String = st.get("content")?;
            let pos: usize = st.get::<i64>("pos")? as usize;
            let remaining = if pos < content.len() {
                &content[pos..]
            } else {
                ""
            };
            let lines: Vec<String> = remaining.lines().map(|l| l.to_string()).collect();
            st.set("pos", content.len() as i64)?;
            let idx = lua.create_userdata(LineIterState { lines, pos: 0 })?;
            let iter = lua.create_function(move |lua, ud: LuaAnyUserData| {
                let mut state = ud.borrow_mut::<LineIterState>()?;
                if state.pos < state.lines.len() {
                    let line = state.lines[state.pos].clone();
                    state.pos += 1;
                    Ok(LuaValue::String(lua.create_string(&line)?))
                } else {
                    Ok(LuaValue::Nil)
                }
            })?;
            Ok((iter, idx))
        })?,
    )?;

    // handle:seek(whence?, offset?)
    let st = state.clone();
    handle.set(
        "seek",
        lua.create_function(
            move |_, (_self_arg, whence, offset): (LuaValue, Option<String>, Option<i64>)| {
                let content: String = st.get("content")?;
                let cur: i64 = st.get("pos")?;
                let offset = offset.unwrap_or(0);
                let whence = whence.unwrap_or_else(|| "cur".to_string());
                let new_pos = match whence.as_str() {
                    "set" => offset,
                    "cur" => cur + offset,
                    "end" => content.len() as i64 + offset,
                    _ => return Err(LuaError::runtime(format!("invalid whence: {whence}"))),
                };
                let new_pos = new_pos.max(0).min(content.len() as i64);
                st.set("pos", new_pos)?;
                Ok(new_pos)
            },
        )?,
    )?;

    // handle:close()
    handle.set(
        "close",
        lua.create_function(move |_, _self_arg: LuaValue| {
            state.set("closed", true)?;
            Ok(())
        })?,
    )?;

    // handle:write() -> error on read handle
    handle.set(
        "write",
        lua.create_function(|_, _args: mlua::Variadic<LuaValue>| -> LuaResult<()> {
            Err(LuaError::runtime("cannot write to a read-mode file handle"))
        })?,
    )?;

    // handle:flush() -> no-op
    handle.set("flush", lua.create_function(|_, _self_arg: LuaValue| Ok(()))?)?;

    Ok(())
}

fn create_write_handle(
    lua: &Lua,
    workspace_root: &str,
    path: &str,
    handle: &LuaTable,
    append: bool,
) -> LuaResult<()> {
    let state = lua.create_table()?;
    state.set("closed", false)?;
    state.set("path", path)?;
    state.set("wr", workspace_root)?;
    state.set("append", append)?;

    // Pre-load existing content for append mode
    let initial = if append {
        workspace_ops::ws_read_file(workspace_root, path).unwrap_or_default()
    } else {
        String::new()
    };
    state.set("buffer", initial)?;
    handle.set("_state", state.clone())?;

    // handle:write(...)
    let st = state.clone();
    handle.set(
        "write",
        lua.create_function(move |_, (_self_arg, args): (LuaValue, mlua::Variadic<String>)| {
            if st.get::<bool>("closed")? {
                return Err(LuaError::runtime("attempt to use a closed file"));
            }
            let mut buf: String = st.get("buffer")?;
            for s in args.iter() {
                buf.push_str(s);
            }
            st.set("buffer", buf)?;
            Ok(())
        })?,
    )?;

    // handle:close() -> flush buffer to disk
    let st = state.clone();
    handle.set(
        "close",
        lua.create_function(move |_, _self_arg: LuaValue| {
            if st.get::<bool>("closed")? {
                return Ok(());
            }
            st.set("closed", true)?;
            let wr: String = st.get("wr")?;
            let path: String = st.get("path")?;
            let buf: String = st.get("buffer")?;
            // Always write the full buffer (append mode pre-loaded existing content)
            workspace_ops::ws_write_file(&wr, &path, &buf).map_err(LuaError::runtime)?;
            Ok(())
        })?,
    )?;

    // handle:read() -> error on write handle
    handle.set(
        "read",
        lua.create_function(|_, _args: mlua::Variadic<LuaValue>| -> LuaResult<()> {
            Err(LuaError::runtime("cannot read from a write-mode file handle"))
        })?,
    )?;

    // handle:flush() -> write buffer to disk immediately
    let st = state.clone();
    handle.set(
        "flush",
        lua.create_function(move |_, _self_arg: LuaValue| {
            let wr: String = st.get("wr")?;
            let path: String = st.get("path")?;
            let buf: String = st.get("buffer")?;
            workspace_ops::ws_write_file(&wr, &path, &buf).map_err(LuaError::runtime)?;
            Ok(())
        })?,
    )?;

    // handle:seek() -> error on write handle
    handle.set(
        "seek",
        lua.create_function(|_, _args: mlua::Variadic<LuaValue>| -> LuaResult<()> {
            Err(LuaError::runtime("cannot seek on a write-mode file handle"))
        })?,
    )?;

    // handle:lines() -> error on write handle
    handle.set(
        "lines",
        lua.create_function(|_, _args: mlua::Variadic<LuaValue>| -> LuaResult<()> {
            Err(LuaError::runtime("cannot iterate lines on a write-mode file handle"))
        })?,
    )?;

    Ok(())
}

/// Read from content with Lua format specifiers.
fn read_with_format(
    lua: &Lua,
    content: &str,
    pos: usize,
    fmt: &str,
    state: &LuaTable,
) -> LuaResult<LuaValue> {
    if pos >= content.len() {
        return Ok(LuaValue::Nil);
    }
    let remaining = &content[pos..];

    match fmt {
        "*a" | "a" => {
            state.set("pos", content.len() as i64)?;
            Ok(LuaValue::String(lua.create_string(remaining)?))
        }
        "*l" | "l" => {
            if let Some(nl) = remaining.find('\n') {
                let line = &remaining[..nl];
                state.set("pos", (pos + nl + 1) as i64)?;
                Ok(LuaValue::String(lua.create_string(line)?))
            } else {
                state.set("pos", content.len() as i64)?;
                Ok(LuaValue::String(lua.create_string(remaining)?))
            }
        }
        "*n" | "n" => {
            let trimmed = remaining.trim_start();
            let skip = remaining.len() - trimmed.len();
            let num_end = trimmed
                .find(|c: char| !c.is_ascii_digit() && c != '.' && c != '-' && c != '+' && c != 'e' && c != 'E')
                .unwrap_or(trimmed.len());
            if num_end == 0 {
                return Ok(LuaValue::Nil);
            }
            let num_str = &trimmed[..num_end];
            state.set("pos", (pos + skip + num_end) as i64)?;
            if let Ok(n) = num_str.parse::<i64>() {
                Ok(LuaValue::Integer(n))
            } else if let Ok(n) = num_str.parse::<f64>() {
                Ok(LuaValue::Number(n))
            } else {
                Ok(LuaValue::Nil)
            }
        }
        _ => Err(LuaError::runtime(format!("unsupported read format: {fmt}"))),
    }
}
