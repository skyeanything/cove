# cove_interpreter — Lua 5.4 API Reference

## Output
Use `print()` for output (not console.log). Multiple args are tab-separated.

## JSON
`json.encode(table)` and `json.decode(string)` are available (Rust-backed, not a Lua library).

## Workspace APIs
- `workspace.readFile(path)` — read file contents as string
- `workspace.writeFile(path, content)` — write string to file
- `workspace.appendFile(path, content)` — append to file
- `workspace.listDir(path)` — list directory entries
- `workspace.exists(path)` — check if path exists
- `workspace.stat(path)` — file metadata (size, modified, is_dir)
- `workspace.copyFile(src, dst)` — copy file
- `workspace.moveFile(src, dst)` — move/rename file
- `workspace.remove(path)` — delete file or directory
- `workspace.createDir(path)` — create directory (recursive)
- `workspace.glob(pattern)` — glob match files
- `workspace.officellm(cmd, args)` — invoke OfficeLLM commands

## File execution
Pass `file: "path/to/script.lua"` instead of `code` to execute a .lua file from the workspace.

## Sandbox rules
Safe subsets of `io` and `os` are available (workspace-scoped).
- `io.open`, `io.lines`, `io.read`, `io.write` operate within workspace only.
- `os.time()`, `os.clock()`, `os.date()`, `os.tmpname()`, `os.remove()`, `os.rename()` available.
- `os.execute`, `io.popen`, `require`, `debug`, `dofile`, `loadfile` are **blocked**.
- No network access. Memory 64MB, timeout 30s (max 60s). Workspace scope only.

## Available globals
`print`, `json`, `workspace`, `io`, `os`, `string`, `table`, `math`, `tonumber`, `tostring`, `type`, `pairs`, `ipairs`, `select`, `pcall`, `xpcall`, `error`, `assert`.
