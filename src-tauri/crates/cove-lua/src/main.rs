use mlua::prelude::*;
use std::env;
use std::io::Read as _;
use std::process;

fn main() {
    let args: Vec<String> = env::args().collect();
    let exit_code = run(&args);
    process::exit(exit_code);
}

fn run(args: &[String]) -> i32 {
    let interpreter = args.first().map(|s| s.as_str()).unwrap_or("lua");

    if args.len() < 2 {
        return run_stdin(interpreter);
    }

    match args[1].as_str() {
        "-v" | "--version" => {
            println!("Lua 5.4 (cove-lua, minimal CLI via mlua)");
            0
        }
        "-e" => {
            if args.len() < 3 {
                eprintln!("lua: '-e' needs argument");
                return 1;
            }
            let code = &args[2];
            execute(interpreter, "(command line)", code, &[], &args[3..])
        }
        "-" => run_stdin(interpreter),
        arg if arg.starts_with('-') => {
            eprintln!("lua: unrecognized option '{arg}'");
            1
        }
        script => {
            let source = match std::fs::read_to_string(script) {
                Ok(s) => s,
                Err(e) => {
                    eprintln!("lua: cannot open {script}: {e}");
                    return 1;
                }
            };
            // Strip shebang line
            let source = if source.starts_with("#!") {
                source.split_once('\n').map(|(_, rest)| rest).unwrap_or("")
            } else {
                &source
            };
            execute(interpreter, script, source, &args[1..], &args[2..])
        }
    }
}

fn run_stdin(interpreter: &str) -> i32 {
    let mut source = String::new();
    if let Err(e) = std::io::stdin().read_to_string(&mut source) {
        eprintln!("lua: error reading stdin: {e}");
        return 1;
    }
    execute(interpreter, "stdin", &source, &[], &[])
}

/// Execute Lua source code.
///
/// `arg_from_zero`: slice starting with arg[0] (script name), then positional args.
/// `positional`: the positional args only (arg[1], arg[2], ...).
fn execute(
    interpreter: &str,
    chunk_name: &str,
    source: &str,
    arg_from_zero: &[String],
    positional: &[String],
) -> i32 {
    let lua = Lua::new();

    // Build the `arg` global table
    if let Err(e) = build_arg_table(&lua, interpreter, arg_from_zero, positional) {
        eprintln!("lua: failed to set arg table: {e}");
        return 1;
    }

    match lua.load(source).set_name(chunk_name).exec() {
        Ok(()) => 0,
        Err(e) => {
            eprintln!("{e}");
            1
        }
    }
}

/// Build the standard Lua `arg` table:
///   arg[-1] = interpreter path
///   arg[0]  = script name (first element of arg_from_zero, or "")
///   arg[1..] = positional arguments
fn build_arg_table(
    lua: &Lua,
    interpreter: &str,
    arg_from_zero: &[String],
    positional: &[String],
) -> LuaResult<()> {
    let table = lua.create_table()?;
    table.set(-1, interpreter)?;

    if let Some(script) = arg_from_zero.first() {
        table.set(0, script.as_str())?;
    } else {
        table.set(0, "")?;
    }

    for (i, val) in positional.iter().enumerate() {
        table.set((i + 1) as i64, val.as_str())?;
    }

    lua.globals().set("arg", table)?;
    Ok(())
}
