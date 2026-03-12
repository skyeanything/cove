---
name: cove-core
description: "Cove core capabilities: built-in Lua interpreter, file operations, and core tool usage guide."
emoji: "🏠"
always: true
---

## Tool priority

1. Dedicated tool first (read, write, edit, fetch_url, office, etc.)
2. `bash` for anything a single shell command handles well — file listing, searching, counting, git, npm, system interaction
3. `cove_interpreter` for multi-step computation, data transformation, JSON manipulation, or logic that would need multiple piped commands in bash

Prefer the shorter tool call. If bash one-liner does the job, use bash — do NOT rewrite it as Lua.
Do NOT use bash for JSON parsing or math — use cove_interpreter.

### cove_interpreter quick ref

Lua 5.4, sandboxed, workspace-scoped. Use `print()` for output. `json.encode/decode` built-in.
Workspace APIs: `workspace.readFile/writeFile/listDir/exists/stat/glob/...` (full list in resource).
No `require`, no `os.execute`, no network. Memory 64MB, timeout 30s.

For full API reference, load resource: `cove-core: resources/lua-reference.md`

### cove_interpreter vs bash lua

- **cove_interpreter** — sandboxed, workspace-scoped. Default choice for computation and data processing.
- **bash `lua`** — unsandboxed, bundled sidecar binary (Lua 5.4). Available as `lua` in bash (on PATH). Use `lua -e "..."` for one-liners or `lua script.lua` for files. Only when script needs `require`, `os.execute`, or runs outside workspace.
