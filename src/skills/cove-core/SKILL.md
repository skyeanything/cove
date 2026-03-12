---
name: cove-core
description: "Cove core capabilities: built-in Lua interpreter, file operations, and core tool usage guide."
emoji: "🏠"
always: true
---

## Tool priority

1. Dedicated tool first (read, write, edit, fetch_url, office, etc.)
2. `cove_interpreter` for computation, data processing, multi-step logic
3. `bash` for system interaction (git, npm, shell, network)

Do NOT wrap a single operation in cove_interpreter when a dedicated tool can do it.
Do NOT use bash for JSON parsing or math — use cove_interpreter.

## cove_interpreter (Lua 5.4)

### Output
Use `print()` for output (not console.log). Multiple args are tab-separated.

### JSON
`json.encode(table)` and `json.decode(string)` are available (Rust-backed, not a Lua library).

### Workspace APIs
`workspace.readFile(path)`, `writeFile(path, content)`, `appendFile(path, content)`, `listDir(path)`, `exists(path)`, `stat(path)`, `copyFile(src, dst)`, `moveFile(src, dst)`, `remove(path)`, `createDir(path)`, `glob(pattern)`, `officellm(cmd, args)`.

### File execution
Pass `file: "path/to/script.lua"` instead of `code` to execute a .lua file from the workspace.

### Sandboxed
Safe subsets of `io` and `os` are available (workspace-scoped).
`io.open`, `io.lines`, `io.read`, `io.write` operate within workspace only.
`os.time()`, `os.clock()`, `os.date()`, `os.tmpname()`, `os.remove()`, `os.rename()` available.
`os.execute`, `io.popen`, `require`, `debug`, `dofile`, `loadfile` are blocked.
No network access. Memory 64MB, timeout 30s (max 60s). Workspace scope only.

### Available globals
`print`, `json`, `workspace`, `io`, `os`, `string`, `table`, `math`, `tonumber`, `tostring`, `type`, `pairs`, `ipairs`, `select`, `pcall`, `xpcall`, `error`, `assert`.

## Before acting

- Read files before editing/overwriting
- Verify workspace is set before file operations
- Destructive operations require user confirmation
- Ambiguous intent: present options, don't guess
