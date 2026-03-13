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
Do not claim success, concrete IDs/URLs, or completed side effects until a tool result explicitly confirms them. Before the tool result arrives, describe the action as pending or in progress.

### Document shortcuts (DOCX/XLSX/PPTX/PDF)

`read` extracts text from Office documents natively. Do NOT use `parse_document` or `office` to read workspace files when `read` suffices.

`write` creates DOCX automatically when the path ends in `.docx` -- pass markdown content. No need to load OfficeLLM skill or call the `office` tool.

**Important**: `read` returns Office content with a `[Office Document: ...]` header and `00001|` line-number prefixes. When composing content for `write`, strip these wrappers -- pass only the actual text/markdown to `write`.

Common shortcuts:
- Merge documents: `read` each file, strip headers/line numbers, combine text, `write` to new .docx (3 calls)
- Convert markdown to DOCX: `write` with .docx path (1 call)
- Extract text from DOCX: `read` the file (1 call)

For PDF page-range reads (e.g. "pages 5-10"), use `parse_document` with `filePath` + `pageRange` -- `read` does not support page ranges.

Only load OfficeLLM skill for advanced operations: formatting, find-replace, slide manipulation, spreadsheet formulas.

### cove_interpreter quick ref

Lua 5.4, sandboxed, workspace-scoped. Use `print()` for output. `json.encode/decode` built-in.
Workspace APIs: `workspace.readFile/writeFile/listDir/exists/stat/glob/...` (full list in resource).
No `require`, no `os.execute`, no network. Memory 64MB, timeout 30s.

For full API reference, load resource: `cove-core: resources/lua-reference.md`

### cove_interpreter vs bash lua

- **cove_interpreter** — sandboxed, workspace-scoped. Default choice for computation and data processing.
- **bash `lua`** — unsandboxed, bundled sidecar binary (Lua 5.4). Available as `lua` in bash (on PATH). Use `lua -e "..."` for one-liners or `lua script.lua` for files. Only when script needs `require`, `os.execute`, or runs outside workspace.
