// FILE_SIZE_EXCEPTION: 11 workspace function bindings + officellm binding for Lua
use mlua::prelude::*;
use std::collections::HashMap;

use crate::workspace_ops;

pub(super) fn register_workspace_fns(
    lua: &Lua,
    workspace_root: &str,
    officellm_home: Option<&std::path::Path>,
) -> LuaResult<()> {
    let ws = lua.create_table()?;
    let wr = workspace_root.to_string();

    // readFile(path) -> string
    let wr_c = wr.clone();
    ws.set(
        "readFile",
        lua.create_function(move |_, path: String| {
            workspace_ops::ws_read_file(&wr_c, &path).map_err(LuaError::runtime)
        })?,
    )?;

    // writeFile(path, content)
    let wr_c = wr.clone();
    ws.set(
        "writeFile",
        lua.create_function(move |_, (path, content): (String, String)| {
            workspace_ops::ws_write_file(&wr_c, &path, &content).map_err(LuaError::runtime)
        })?,
    )?;

    // appendFile(path, content)
    let wr_c = wr.clone();
    ws.set(
        "appendFile",
        lua.create_function(move |_, (path, content): (String, String)| {
            workspace_ops::ws_append_file(&wr_c, &path, &content).map_err(LuaError::runtime)
        })?,
    )?;

    // listDir(path) -> table
    let wr_c = wr.clone();
    ws.set(
        "listDir",
        lua.create_function(move |lua, path: String| {
            let entries =
                workspace_ops::ws_list_dir(&wr_c, &path).map_err(LuaError::runtime)?;
            let table = lua.create_table()?;
            for (i, entry) in entries.iter().enumerate() {
                table.set(i + 1, entry.as_str())?;
            }
            Ok(table)
        })?,
    )?;

    // exists(path) -> boolean
    let wr_c = wr.clone();
    ws.set(
        "exists",
        lua.create_function(move |_, path: String| {
            workspace_ops::ws_exists(&wr_c, &path).map_err(LuaError::runtime)
        })?,
    )?;

    // stat(path) -> table {size, mtime, isDir, isBinary}
    let wr_c = wr.clone();
    ws.set(
        "stat",
        lua.create_function(move |lua, path: String| {
            let s = workspace_ops::ws_stat(&wr_c, &path).map_err(LuaError::runtime)?;
            let table = lua.create_table()?;
            table.set("size", s.size)?;
            table.set("mtime", s.mtime)?;
            table.set("isDir", s.is_dir)?;
            table.set("isBinary", s.is_binary)?;
            Ok(table)
        })?,
    )?;

    // copyFile(src, dst)
    let wr_c = wr.clone();
    ws.set(
        "copyFile",
        lua.create_function(move |_, (src, dst): (String, String)| {
            workspace_ops::ws_copy_file(&wr_c, &src, &dst).map_err(LuaError::runtime)
        })?,
    )?;

    // moveFile(src, dst)
    let wr_c = wr.clone();
    ws.set(
        "moveFile",
        lua.create_function(move |_, (src, dst): (String, String)| {
            workspace_ops::ws_move_file(&wr_c, &src, &dst).map_err(LuaError::runtime)
        })?,
    )?;

    // remove(path)
    let wr_c = wr.clone();
    ws.set(
        "remove",
        lua.create_function(move |_, path: String| {
            workspace_ops::ws_remove(&wr_c, &path).map_err(LuaError::runtime)
        })?,
    )?;

    // createDir(path)
    let wr_c = wr.clone();
    ws.set(
        "createDir",
        lua.create_function(move |_, path: String| {
            workspace_ops::ws_create_dir(&wr_c, &path).map_err(LuaError::runtime)
        })?,
    )?;

    // glob(pattern) -> table
    let wr_c = wr.clone();
    ws.set(
        "glob",
        lua.create_function(move |lua, pattern: String| {
            let results =
                workspace_ops::ws_glob(&wr_c, &pattern).map_err(LuaError::runtime)?;
            let table = lua.create_table()?;
            for (i, entry) in results.iter().enumerate() {
                table.set(i + 1, entry.as_str())?;
            }
            Ok(table)
        })?,
    )?;

    // officellm(cmd, args) -> string
    if let Some(home) = officellm_home {
        let wr_c = wr.clone();
        let home = home.to_path_buf();
        ws.set(
            "officellm",
            lua.create_function(move |_, (cmd, args): (String, HashMap<String, String>)| {
                workspace_ops::ws_officellm(&wr_c, &cmd, args, &home)
                    .map_err(LuaError::runtime)
            })?,
        )?;
    }

    lua.globals().set("workspace", ws)?;
    Ok(())
}
