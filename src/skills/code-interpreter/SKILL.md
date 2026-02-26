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
- Office document operations: extract text, replace text, convert to PDF, apply formatting

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
| `workspace.officellm(cmd, args)` | Call officellm CLI or Server mode (returns JSON string → use `JSON.parse()`) |
| `Math.*`, `JSON.*`, `Date`, `RegExp`, `Map`, `Set` | Standard JS built-ins |

**Not available**: `fetch`, `require`, `import`, `process`, `fs`, `XMLHttpRequest`.

## Using `workspace.officellm`

### CLI mode (stateless, good for single operations)

```javascript
const res = JSON.parse(workspace.officellm("extract-text", { i: "report.docx" }));
console.log(res.data.text);
```

### Server mode (persistent session, good for multiple operations on the same document)

```javascript
workspace.officellm("open", { path: "doc.docx" });        // open session
workspace.officellm("replace-text", { find: "foo", replace: "bar" });
const saved = JSON.parse(workspace.officellm("save", {})); // save
workspace.officellm("close", {});                          // close session
```

`workspace.officellm` auto-routes:
- `"open"` → starts a `serve --stdio` process
- `"close"` → terminates the server process
- `"status"` → returns current session info (pid, path, uptime)
- any other cmd → JSON-RPC call if session is open, otherwise CLI subprocess

## Limits
- **Memory**: 64 MB  |  **Timeout**: 30s default (max 60s via `timeout` param)
- **No network**  |  **File scope**: active workspace only

## officellm Example

```javascript
// Extract text from a Word document
const res = JSON.parse(workspace.officellm("extract-text", { i: "report.docx" }));
if (res.status === "success") {
  console.log(res.data.text);
}

// Replace text and save as new file
workspace.officellm("replace-text", { i: "doc.docx", o: "doc-new.docx", find: "foo", replace: "bar" });
```

All paths are relative to workspace root.
