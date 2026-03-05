---
name: OfficeLLM
description: Bootstrap for bundled office tool — Tauri tool for document operations (DOCX/PPTX/XLSX).
emoji: "📄"
always: false
---

# Office (Bundled Tauri Tool)

ALWAYS use the `office` Tauri tool for document operations. Do NOT use `bash` to call `officellm` directly — the binary is not in PATH. All operations go through dedicated Tauri IPC commands via the `office` tool.

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
