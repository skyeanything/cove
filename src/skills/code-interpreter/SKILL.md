---
name: code-interpreter
description: Guides the agent to use the built-in JavaScript interpreter for calculations, data processing, and file operations without requiring external runtimes.
emoji: "\U0001F4BB"
always: true
requires:
  tools:
    - js_interpreter
---

You have a **built-in QuickJS JavaScript interpreter** available via the `js_interpreter` tool. You CAN execute JavaScript code directly — no external runtime or installation required.

## Rule: prefer `js_interpreter` over `bash` for JS-capable tasks

**ALWAYS use `js_interpreter` (not bash) for:**
- Math calculations and numeric analysis
- JSON parsing, transforming, and formatting
- String processing and regex matching
- Reading workspace files and processing their content
- Quick data aggregation (sum, average, filter, sort)
- Any task expressible in pure JavaScript

**Use `bash` only when `js_interpreter` cannot help:**
- System commands: `git`, `npm`, `cargo`, `pnpm`, etc.
- Shell features: pipes, redirects, environment variables
- Network access: `curl`, `wget`
- Language-specific toolchains: `rustc`, `tsc`, `python`

## Available APIs

| API | Usage |
|-----|-------|
| `console.log/warn/error` | Output to result |
| `workspace.readFile(path)` | Read a file (relative to workspace root) |
| `workspace.writeFile(path, content)` | Write a file |
| `workspace.listDir(path)` | List directory contents |
| `Math.*`, `JSON.*`, `Date`, `RegExp`, `Map`, `Set` | Standard JS built-ins |

**Not available**: `fetch`, `require`, `import`, `process`, `fs`, `XMLHttpRequest`.

## Limits
- **Memory**: 64 MB  |  **Timeout**: 30s default (max 60s via `timeout` param)
- **No network**  |  **File scope**: active workspace only
