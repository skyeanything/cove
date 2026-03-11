// FILE_SIZE_EXCEPTION: comprehensive Lua interpreter + sandbox + workspace tests
use super::run_lua_inner;
use std::fs;
use tempfile::TempDir;

fn run(workspace: &str, code: &str) -> super::LuaExecutionResult {
    run_lua_inner(workspace, Some(code), None, 5_000, None).expect("run_lua_inner failed")
}

// --- basic execution ---

#[test]
fn test_basic_expression() {
    let dir = TempDir::new().unwrap();
    let r = run(dir.path().to_str().unwrap(), "return 1 + 2");
    assert!(r.error.is_none());
    assert_eq!(r.result, "3");
}

#[test]
fn test_string_return() {
    let dir = TempDir::new().unwrap();
    let r = run(dir.path().to_str().unwrap(), "return 'hello'");
    assert!(r.error.is_none());
    assert_eq!(r.result, "hello");
}

#[test]
fn test_nil_return() {
    let dir = TempDir::new().unwrap();
    let r = run(dir.path().to_str().unwrap(), "local x = 1");
    assert!(r.error.is_none());
    assert_eq!(r.result, "nil");
}

// --- print capture ---

#[test]
fn test_print_capture() {
    let dir = TempDir::new().unwrap();
    let r = run(dir.path().to_str().unwrap(), "print('hello'); print('world')");
    assert_eq!(r.output, "hello\nworld");
}

#[test]
fn test_print_multiple_args() {
    let dir = TempDir::new().unwrap();
    let r = run(dir.path().to_str().unwrap(), "print('a', 42, true)");
    assert_eq!(r.output, "a\t42\ttrue");
}

// --- json ---

#[test]
fn test_json_encode() {
    let dir = TempDir::new().unwrap();
    let r = run(dir.path().to_str().unwrap(), "return json.encode({a = 1, b = 'hello'})");
    assert!(r.error.is_none());
    let v: serde_json::Value = serde_json::from_str(&r.result).unwrap();
    assert_eq!(v["a"], 1);
    assert_eq!(v["b"], "hello");
}

#[test]
fn test_json_decode() {
    let dir = TempDir::new().unwrap();
    let r = run(
        dir.path().to_str().unwrap(),
        r#"local t = json.decode('{"x":42}'); return t.x"#,
    );
    assert!(r.error.is_none());
    assert_eq!(r.result, "42");
}

#[test]
fn test_json_array() {
    let dir = TempDir::new().unwrap();
    let r = run(
        dir.path().to_str().unwrap(),
        "return json.encode({10, 20, 30})",
    );
    assert!(r.error.is_none());
    assert_eq!(r.result, "[10,20,30]");
}

// --- workspace functions ---

#[test]
fn test_read_write_file() {
    let dir = TempDir::new().unwrap();
    let r = run(
        dir.path().to_str().unwrap(),
        r#"
        workspace.writeFile('test.txt', 'hello world')
        return workspace.readFile('test.txt')
        "#,
    );
    assert!(r.error.is_none());
    assert_eq!(r.result, "hello world");
}

#[test]
fn test_list_dir() {
    let dir = TempDir::new().unwrap();
    let wr = dir.path().to_str().unwrap();
    fs::write(dir.path().join("x.txt"), "").unwrap();
    fs::write(dir.path().join("y.txt"), "").unwrap();
    let r = run(
        wr,
        r#"
        local entries = workspace.listDir('.')
        table.sort(entries)
        return json.encode(entries)
        "#,
    );
    assert!(r.error.is_none());
    let v: Vec<String> = serde_json::from_str(&r.result).unwrap();
    assert_eq!(v, vec!["x.txt", "y.txt"]);
}

#[test]
fn test_exists_true() {
    let dir = TempDir::new().unwrap();
    fs::write(dir.path().join("a.txt"), "hello").unwrap();
    let r = run(
        dir.path().to_str().unwrap(),
        "return workspace.exists('a.txt')",
    );
    assert!(r.error.is_none());
    assert_eq!(r.result, "true");
}

#[test]
fn test_exists_false() {
    let dir = TempDir::new().unwrap();
    let r = run(
        dir.path().to_str().unwrap(),
        "return workspace.exists('nope.txt')",
    );
    assert!(r.error.is_none());
    assert_eq!(r.result, "false");
}

#[test]
fn test_stat_file() {
    let dir = TempDir::new().unwrap();
    fs::write(dir.path().join("f.txt"), "data").unwrap();
    let r = run(
        dir.path().to_str().unwrap(),
        r#"
        local s = workspace.stat('f.txt')
        return json.encode({size = s.size, isDir = s.isDir, isBinary = s.isBinary})
        "#,
    );
    assert!(r.error.is_none());
    let v: serde_json::Value = serde_json::from_str(&r.result).unwrap();
    assert_eq!(v["size"], 4);
    assert_eq!(v["isDir"], false);
    assert_eq!(v["isBinary"], false);
}

#[test]
fn test_copy_file() {
    let dir = TempDir::new().unwrap();
    fs::write(dir.path().join("src.txt"), "content").unwrap();
    let r = run(
        dir.path().to_str().unwrap(),
        "workspace.copyFile('src.txt', 'dst.txt')",
    );
    assert!(r.error.is_none());
    assert_eq!(fs::read_to_string(dir.path().join("dst.txt")).unwrap(), "content");
    assert!(dir.path().join("src.txt").exists());
}

#[test]
fn test_move_file() {
    let dir = TempDir::new().unwrap();
    fs::write(dir.path().join("old.txt"), "data").unwrap();
    let r = run(
        dir.path().to_str().unwrap(),
        "workspace.moveFile('old.txt', 'new.txt')",
    );
    assert!(r.error.is_none());
    assert!(!dir.path().join("old.txt").exists());
    assert_eq!(fs::read_to_string(dir.path().join("new.txt")).unwrap(), "data");
}

#[test]
fn test_remove_file() {
    let dir = TempDir::new().unwrap();
    fs::write(dir.path().join("rm.txt"), "bye").unwrap();
    let r = run(dir.path().to_str().unwrap(), "workspace.remove('rm.txt')");
    assert!(r.error.is_none());
    assert!(!dir.path().join("rm.txt").exists());
}

#[test]
fn test_create_dir() {
    let dir = TempDir::new().unwrap();
    let r = run(dir.path().to_str().unwrap(), "workspace.createDir('a/b/c')");
    assert!(r.error.is_none());
    assert!(dir.path().join("a/b/c").is_dir());
}

#[test]
fn test_append_file() {
    let dir = TempDir::new().unwrap();
    fs::write(dir.path().join("log.txt"), "first\n").unwrap();
    let r = run(
        dir.path().to_str().unwrap(),
        "workspace.appendFile('log.txt', 'second\\n')",
    );
    assert!(r.error.is_none());
    assert_eq!(
        fs::read_to_string(dir.path().join("log.txt")).unwrap(),
        "first\nsecond\n"
    );
}

#[test]
fn test_glob_basic() {
    let dir = TempDir::new().unwrap();
    fs::write(dir.path().join("a.txt"), "").unwrap();
    fs::write(dir.path().join("b.txt"), "").unwrap();
    fs::write(dir.path().join("c.rs"), "").unwrap();
    let r = run(
        dir.path().to_str().unwrap(),
        r#"
        local files = workspace.glob('*.txt')
        table.sort(files)
        return json.encode(files)
        "#,
    );
    assert!(r.error.is_none());
    let v: Vec<String> = serde_json::from_str(&r.result).unwrap();
    assert_eq!(v, vec!["a.txt", "b.txt"]);
}

// --- security ---

#[test]
fn test_read_outside_workspace() {
    let dir = TempDir::new().unwrap();
    let r = run(
        dir.path().to_str().unwrap(),
        "return workspace.readFile('/etc/passwd')",
    );
    assert!(r.error.is_some());
}

#[test]
fn test_exists_outside_workspace_returns_false() {
    let dir = TempDir::new().unwrap();
    let r = run(
        dir.path().to_str().unwrap(),
        "return workspace.exists('/etc/passwd')",
    );
    assert!(r.error.is_none());
    assert_eq!(r.result, "false");
}

#[test]
fn test_glob_absolute_rejected() {
    let dir = TempDir::new().unwrap();
    let r = run(dir.path().to_str().unwrap(), "workspace.glob('/etc/*')");
    assert!(r.error.is_some());
    assert!(r.error.unwrap().contains("absolute glob patterns not allowed"));
}

#[test]
fn test_glob_parent_traversal_rejected() {
    let dir = TempDir::new().unwrap();
    let r = run(dir.path().to_str().unwrap(), "workspace.glob('../*')");
    assert!(r.error.is_some());
    assert!(r.error.unwrap().contains("parent traversal"));
}

// --- sandboxing ---

#[test]
fn test_os_not_available() {
    let dir = TempDir::new().unwrap();
    let r = run(dir.path().to_str().unwrap(), "return os.execute('echo hi')");
    assert!(r.error.is_some());
}

#[test]
fn test_io_not_available() {
    let dir = TempDir::new().unwrap();
    let r = run(
        dir.path().to_str().unwrap(),
        "return io.open('/etc/passwd', 'r')",
    );
    assert!(r.error.is_some());
}

#[test]
fn test_require_not_available() {
    let dir = TempDir::new().unwrap();
    let r = run(dir.path().to_str().unwrap(), "return require('os')");
    assert!(r.error.is_some());
}

#[test]
fn test_dofile_not_available() {
    let dir = TempDir::new().unwrap();
    let r = run(dir.path().to_str().unwrap(), "return dofile('/etc/passwd')");
    assert!(r.error.is_some());
}

// --- timeout ---

#[test]
fn test_timeout() {
    let dir = TempDir::new().unwrap();
    let r = run_lua_inner(
        dir.path().to_str().unwrap(),
        Some("while true do end"),
        None,
        100,
        None,
    )
    .expect("should not fail");
    assert!(r.error.is_some());
    assert!(r.error.unwrap().contains("timed out"));
}

// --- file execution ---

#[test]
fn test_file_execution() {
    let dir = TempDir::new().unwrap();
    fs::write(dir.path().join("test.lua"), "return 42 + 8").unwrap();
    let r = run_lua_inner(
        dir.path().to_str().unwrap(),
        None,
        Some("test.lua"),
        5_000,
        None,
    )
    .expect("should not fail");
    assert!(r.error.is_none());
    assert_eq!(r.result, "50");
}

#[test]
fn test_file_execution_with_workspace() {
    let dir = TempDir::new().unwrap();
    fs::write(dir.path().join("data.txt"), "hello from file").unwrap();
    fs::write(
        dir.path().join("read_it.lua"),
        "return workspace.readFile('data.txt')",
    )
    .unwrap();
    let r = run_lua_inner(
        dir.path().to_str().unwrap(),
        None,
        Some("read_it.lua"),
        5_000,
        None,
    )
    .expect("should not fail");
    assert!(r.error.is_none());
    assert_eq!(r.result, "hello from file");
}

#[test]
fn test_file_outside_workspace_rejected() {
    let dir = TempDir::new().unwrap();
    let r = run_lua_inner(
        dir.path().to_str().unwrap(),
        None,
        Some("/etc/passwd"),
        5_000,
        None,
    );
    assert!(r.is_err());
}

// --- officellm bridge regression tests (loads actual bridge source) ---

/// Helper: set up a Lua VM with json + mock workspace.officellm, load the real bridge.
fn run_with_bridge(test_code: &str) -> super::LuaExecutionResult {
    use mlua::prelude::*;
    use std::sync::{Arc, Mutex};

    let lua = Lua::new();
    super::register_json(&lua).unwrap();

    // Mock workspace table with officellm that records calls
    let ws = lua.create_table().unwrap();
    let calls: Arc<Mutex<Vec<(String, String)>>> = Arc::new(Mutex::new(Vec::new()));
    let calls_clone = calls.clone();
    ws.set(
        "officellm",
        lua.create_function(move |_lua, (cmd, params): (String, LuaValue)| {
            let params_json = serde_json::to_string(&super::lua_value_to_json(&params))
                .unwrap_or_default();
            calls_clone.lock().unwrap().push((cmd, params_json));
            Ok(r#"{"ok":true}"#.to_string())
        })
        .unwrap(),
    )
    .unwrap();
    lua.globals().set("workspace", ws).unwrap();

    // Load the ACTUAL bridge source
    lua.load(super::OFFICELLM_BRIDGE).exec().unwrap();

    // Expose captured calls to test code
    let calls_for_lua = calls.clone();
    lua.globals()
        .set(
            "_test_get_calls",
            lua.create_function(move |lua, ()| {
                let locked = calls_for_lua.lock().unwrap();
                let t = lua.create_table()?;
                for (i, (cmd, params)) in locked.iter().enumerate() {
                    let entry = lua.create_table()?;
                    entry.set("cmd", cmd.as_str())?;
                    entry.set("params", params.as_str())?;
                    t.set(i + 1, entry)?;
                }
                Ok(t)
            })
            .unwrap(),
        )
        .unwrap();

    let result: LuaResult<LuaValue> = lua.load(test_code).eval();
    match result {
        Ok(val) => super::LuaExecutionResult {
            output: String::new(),
            result: super::lua_value_to_string(&val),
            error: None,
            execution_ms: 0,
        },
        Err(e) => super::LuaExecutionResult {
            output: String::new(),
            result: String::new(),
            error: Some(format!("{e}")),
            execution_ms: 0,
        },
    }
}

#[test]
fn test_bridge_dot_syntax_call() {
    // Regression: doc.call() must work with dot-syntax (no self param).
    // If session methods had a `_` self param, the first real arg would be consumed.
    let r = run_with_bridge(
        r#"
        local doc = officellm.open("/tmp/test.docx")
        doc.call("addSlide", { title = "Hello" })
        local calls = _test_get_calls()
        -- calls[1] = open, calls[2] = addSlide
        return calls[2].cmd
        "#,
    );
    assert!(r.error.is_none(), "error: {:?}", r.error);
    assert_eq!(r.result, "addSlide");
}

#[test]
fn test_bridge_dot_syntax_call_params() {
    // Verify params are correctly converted (camelCase -> kebab-case) via real bridge.
    let r = run_with_bridge(
        r#"
        local doc = officellm.open("/tmp/test.docx")
        doc.call("setText", { fontSize = "14pt", dryRun = true, disabled = false })
        local calls = _test_get_calls()
        local params = json.decode(calls[2].params)
        -- Build sorted key=value pairs for deterministic assertion
        local kv = {}
        for k, v in pairs(params) do kv[#kv+1] = k .. "=" .. v end
        table.sort(kv)
        return table.concat(kv, ",")
        "#,
    );
    assert!(r.error.is_none(), "error: {:?}", r.error);
    assert_eq!(r.result, "dry-run=,font-size=14pt");
}

#[test]
fn test_bridge_dot_syntax_save() {
    // Regression: doc.save() must accept (path) directly, not (self, path).
    let r = run_with_bridge(
        r#"
        local doc = officellm.open("/tmp/test.docx")
        doc.save("/tmp/out.docx")
        local calls = _test_get_calls()
        local params = json.decode(calls[2].params)
        return params.path
        "#,
    );
    assert!(r.error.is_none(), "error: {:?}", r.error);
    assert_eq!(r.result, "/tmp/out.docx");
}

#[test]
fn test_bridge_dot_syntax_execute() {
    // Regression: doc.execute() must accept (ops, options) directly.
    let r = run_with_bridge(
        r#"
        local doc = officellm.open("/tmp/test.docx")
        doc.execute(
            {{ op = "addSlide", title = "S1" }},
            { dryRun = true }
        )
        local calls = _test_get_calls()
        -- execute call params should contain instructions-json
        local params = json.decode(calls[2].params)
        local instructions = json.decode(params["instructions-json"])
        return instructions.version .. ":" .. tostring(instructions.dry_run)
        "#,
    );
    assert!(r.error.is_none(), "error: {:?}", r.error);
    assert_eq!(r.result, "1.0:true");
}

#[test]
fn test_bridge_not_loaded_without_officellm_home() {
    // officellm global should NOT exist when officellm_home is None
    let dir = TempDir::new().unwrap();
    let r = run(dir.path().to_str().unwrap(), "return type(officellm)");
    assert!(r.error.is_none());
    assert_eq!(r.result, "nil");
}

// --- code/file exclusivity ---

#[test]
fn test_neither_code_nor_file() {
    let dir = TempDir::new().unwrap();
    let r = run_lua_inner(dir.path().to_str().unwrap(), None, None, 5_000, None);
    assert!(r.is_err());
    assert!(r.unwrap_err().contains("either code or file"));
}
