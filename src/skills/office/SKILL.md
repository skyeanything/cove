---
name: OfficeLLM
description: Bootstrap for bundled office tool — Tauri tool for document operations (DOCX/PPTX/XLSX).
emoji: "📄"
always: false
---

# Office (Bundled Tauri Tool)

## Two entry points

**Single operations** -- use the `office` tool:
```
office(command: "open", args: {path: "doc.docx"})
office(command: "create")
office(command: "create", args: {markdown: "# Title\n\nContent"})
office(command: "replace-text", args: {find: "old", replace: "new"})
office(command: "save")
office(command: "close")
office(command: "from-markdown", args: {i: "in.md", o: "out.docx"})
```

**Multi-step workflows** -- use `cove_interpreter` with the officellm bridge:
```lua
-- Edit existing document
local doc = officellm.open("report.docx")
doc.call("replace-text", { find = "old", replace = "new" })
doc.call("apply-format", { find = "Important", bold = true })
doc.save("report-updated.docx")
doc.close()

-- Create new document from scratch
local doc = officellm.create({ markdown = "# Report\n\nContent here" })
doc.call("apply-format", { find = "Report", bold = true })
doc.save("report.docx")  -- create documents require a path on save
doc.close()
```

Batch operations via `doc.execute()`:
```lua
doc.execute({
  { op = "ReplaceText", target = "Draft", payload = "Final" },
  { op = "ApplyFormat", target = "Title", format = { bold = true, fontSize = "16pt" } }
}, { atomic = true, dryRun = true })
```

Stateless (no open needed): `officellm.call("from-markdown", { i = "in.md", o = "out.docx" })`.

## officellm bridge API (cove_interpreter)

When officellm is available, a bridge API is auto-injected into the Lua runtime.
Use it for multi-step workflows combining multiple operations on the same document.
For single operations, use the `office` tool directly.

**Low-level workspace.officellm()** is also available for direct calls:
```lua
local raw = json.decode(workspace.officellm("extract-text", { i = "report.docx" }))
if raw.status == "success" then print(raw.data.text) end
```

Rules:
- Always check `status` before `open`. Always `close` when done.
- Wrap calls in `pcall`; log the command name in error messages.
- `workspace.officellm()` returns a JSON string; always `json.decode()` it.

## Session coordination

The officellm server is a process-wide singleton. Both the `office` tool and `cove_interpreter` share one session via the same Rust mutex.

- Always check `office(command: "status")` before `open`. Always `close` when done.
- If open fails with "session already active", close first, then retry.
- Do NOT use `bash` to run officellm CLI — it bypasses session coordination.
- Prefer `office` tool for single operations; `cove_interpreter` + bridge for multi-step workflows.

## Document operation priorities

1. **`office` tool** — preferred for single operations
2. **`cove_interpreter` + officellm bridge** — for multi-step workflows
3. MUST load OfficeLLM skill (via the `skill` tool) before calling any command by name

Common mistakes:
- Do NOT call `office` tool before loading the OfficeLLM skill — you will guess wrong command names
- Do NOT wrap a single office operation in `cove_interpreter` when the `office` tool can do it directly
- Do NOT use `bash` to run officellm CLI — the binary is not in PATH
- Do NOT guess command parameters — load the skill first

## Loading the Full Command Reference

Run `doctor` first — the response includes a `home` field. For the complete command reference (~100 commands, workflows, best practices):

- `<home>/skills/resources/*.md` — detailed guides
- `<home>/skills/quickjs-examples/*.js` — scripting examples
- Use the `skill_resource` tool to load a specific guide on demand.

Do NOT guess command names — read the resource guides first.

## Dependency Check

Before any document operation, run `doctor` once per session:

1. Call `office` tool with `action: "doctor"`
2. Check `dependencies` array — each has `name`, `available`, `required`
3. Install missing **required** dependencies:

| Dependency  | Install (macOS)                   |
|-------------|-----------------------------------|
| libreoffice | `brew install --cask libreoffice` |
| pdftoppm    | `brew install poppler`            |
| quarto      | `brew install --cask quarto`      |

If Homebrew is missing or slow (China mainland), offer USTC mirror:
- Install: `/bin/bash -c "$(curl -fsSL https://mirrors.ustc.edu.cn/misc/brew-install.sh)"`
- Mirror config:
  ```
  export HOMEBREW_BREW_GIT_REMOTE="https://mirrors.ustc.edu.cn/brew.git"
  export HOMEBREW_CORE_GIT_REMOTE="https://mirrors.ustc.edu.cn/homebrew-core.git"
  export HOMEBREW_API_DOMAIN="https://mirrors.ustc.edu.cn/homebrew-bottles/api"
  export HOMEBREW_BOTTLE_DOMAIN="https://mirrors.ustc.edu.cn/homebrew-bottles"
  ```

Use `bash` tool for install commands. Re-run `doctor` to confirm.

## Quick Reference (Common Operations)

These examples work without loading the full OfficeLLM skill. Prefer the `office` Tauri tool for single operations. Use `cove_interpreter` with `workspace.officellm()` only for multi-step programmatic workflows.

### Extract text from a document

```json
{ "action": "call", "command": "extract-text", "args": { "i": "report.docx" } }
```

For multi-step processing, use `cove_interpreter`:

```javascript
const res = JSON.parse(workspace.officellm("extract-text", { i: "report.docx" }));
console.log(res.data.text);
```

### Replace text in a document

```json
{ "action": "call", "command": "replace-text", "args": { "i": "doc.docx", "o": "doc-out.docx", "find": "old text", "replace": "new text" } }
```

### Server mode via cove_interpreter (multiple operations on one document)

```javascript
workspace.officellm("open", { path: "presentation.pptx" });
// ... multiple commands ...
workspace.officellm("save", {});
workspace.officellm("close", {});
```

### Check session status

```json
{ "action": "status" }
```

For the full command reference (~100 commands), run `doctor` and read the resource guides at `<home>/skills/resources/`.

## File Output Rule

Whenever a file is successfully written to disk (save, export, pack, convert, etc.), output the absolute path as a clickable markdown link:

```
[filename.docx](file:///absolute/path/to/filename.docx)
```

Always use the absolute path. Apply this to every generated, edited, or saved file.
