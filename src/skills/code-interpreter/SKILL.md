---
name: code-interpreter
description: Guides the agent to use the built-in JavaScript interpreter for calculations, data processing, and file operations without requiring external runtimes.
emoji: "\U0001F4BB"
always: true
requires:
  tools:
    - js_interpreter
---

# Code Interpreter Skill

When the user needs computation, data processing, or file manipulation, prefer `js_interpreter` over `bash` with external runtimes (Python, Node, etc.) — the user may not have them installed.

## When to use `js_interpreter`

- Math calculations and numeric analysis
- JSON parsing, transforming, and formatting
- String processing and regex matching
- Reading workspace files and processing their content
- Quick data aggregation (sum, average, filter, sort)
- Any task that can be done in pure JavaScript without external dependencies

## When to use `bash` instead

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
| `Math.*` | Standard math functions |
| `JSON.*` | JSON parse/stringify |
| `Date`, `RegExp`, `Map`, `Set` | Built-in JS globals |

**Not available**: `fetch`, `require`, `import`, `process`, `fs`, `XMLHttpRequest`.

## Limits

- **Memory**: 64 MB
- **Timeout**: 30s default, adjustable up to 60s via `timeout` parameter
- **No network**: Cannot make HTTP requests
- **File scope**: Only files within the active workspace
