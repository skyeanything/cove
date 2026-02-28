---
name: officellm
description: Guides the agent to perform document operations (DOCX/PPTX/XLSX) using the officellm JS API — CLI mode for single commands, Server mode for multi-step workflows.
emoji: "\U0001F4C4"
always: false
---

> **⚠️ IMPORTANT: Do NOT use bash to call officellm** — use the `officellm` Tauri tool. officellm is accessed through dedicated Tauri IPC commands, not shell commands.

# officellm Document Operations Skill

officellm is a CLI tool for intelligent document manipulation. In cove, it is accessed through dedicated Tauri commands rather than shell commands.

## Full Skill & Resource Discovery

officellm ships its own comprehensive skill at `~/.officellm/skills/`. This
built-in skill is a **bootstrap** — for the full command reference, use:

1. Call the `skill` tool with `name: "OfficeLLM"` to load the complete
   command reference (~100 commands, workflows, best practices).
2. That skill lists available **resource guides** under `~/.officellm/skills/resources/`.
   Use the `read` tool to load a specific guide on demand, e.g.:
   - `~/.officellm/skills/resources/TABLE_OPERATIONS_GUIDE.md`
   - `~/.officellm/skills/resources/SERVER_MODE_GUIDE.md`
   - `~/.officellm/skills/resources/EXECUTE_BATCH_GUIDE.md`
   - `~/.officellm/skills/resources/VISUAL_QA_GUIDE.md`
3. QuickJS scripting examples: `~/.officellm/skills/quickjs-examples/*.js`
   TypeScript definitions: `~/.officellm/skills/officellm-quickjs.d.ts`

**Recommended workflow**:
- Load the full `OfficeLLM` skill first to understand available commands.
- Read specific resource guides only when you need deep guidance on a topic.
- Do NOT guess command names — always consult the full skill first.

## Prerequisites — Dependency Check

Before performing any document operation, run the `doctor` action to verify
external dependencies are installed:

1. Call `officellm` tool with `action: "doctor"`
2. Check `dependencies` array — each item has `name`, `available`, `required`
3. If any **required** dependency is missing, install it before proceeding:

| Dependency    | Install command (macOS)               |
|---------------|---------------------------------------|
| libreoffice   | `brew install --cask libreoffice`     |
| pdftoppm      | `brew install poppler`                |
| quarto        | `brew install --cask quarto`          |

**Before installing, check Homebrew availability:**

1. Run `which brew` to check if Homebrew is installed.
2. If Homebrew is **not** installed, help the user install it first:
   - Default: `/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"`
   - China mainland (faster): `/bin/bash -c "$(curl -fsSL https://mirrors.ustc.edu.cn/misc/brew-install.sh)"`
3. If Homebrew is installed but downloads are slow (common in China mainland),
   configure USTC mirror before installing dependencies:
   ```
   export HOMEBREW_BREW_GIT_REMOTE="https://mirrors.ustc.edu.cn/brew.git"
   export HOMEBREW_CORE_GIT_REMOTE="https://mirrors.ustc.edu.cn/homebrew-core.git"
   export HOMEBREW_API_DOMAIN="https://mirrors.ustc.edu.cn/homebrew-bottles/api"
   export HOMEBREW_BOTTLE_DOMAIN="https://mirrors.ustc.edu.cn/homebrew-bottles"
   brew update
   ```

**Ask the user if they are in China mainland** when Homebrew is missing or
any `brew install` command fails/times out, then use the mirror commands above.

Use the `bash` tool to run install commands. After installation, run `doctor`
again to confirm.

Only run doctor once per session — if all dependencies are available,
proceed directly with document operations.

## When to Use

- Extracting text, tables, or metadata from Office documents
- Replacing text, applying formatting, or modifying document structure
- Converting documents between formats (DOCX → PDF, etc.)
- Batch operations on multiple documents or multi-step edits on a single document

## Two Modes

### CLI Mode — Single Commands

Best for one-off operations. Each call spawns a fresh process.

```
officellm extract-text -i report.docx
officellm to-pdf -i slides.pptx -o slides.pdf
officellm list-styles -i template.docx
```

Use CLI mode when:
- You need a single operation with no follow-up
- The command is self-contained (input → output)

### Server Mode — Multi-Step Workflows

Best for multiple sequential operations on the same document. Reuses one process (~5ms per command vs ~200ms per CLI spawn).

Workflow pattern:
1. `open(path)` — start session, load document
2. `call(cmd, args)` — execute one or more commands
3. `save(path?)` — persist changes (optional new path)
4. `close()` — end session, release resources

Use Server mode when:
- You need 2+ operations on the same document
- Operations depend on each other (e.g., find then replace)
- Performance matters (batch edits, large documents)

## Common Workflows

### Extract text from a document
```
officellm extract-text -i document.docx
```

### Find and replace text
Open in server mode for multiple replacements:
1. Open the document
2. Run replace-text for each substitution
3. Save and close

### Apply formatting
1. Open the document
2. Use apply-format with XPath selectors
3. Save and close

### Batch operations
1. Open the document
2. Execute an operations file with `execute -f ops.json --atomic true`
3. Save and close

## Command Reference

⚠️ Do NOT guess command names. Load the full `OfficeLLM` skill via the `skill`
tool for the complete command reference (~100 commands). Common commands:

| Command        | Description                            |
|----------------|----------------------------------------|
| `extract-text` | Extract all text from document         |
| `replace-text` | Find and replace text                  |
| `to-pdf`       | Convert document to PDF                |
| `execute`      | Run operations from a JSON file        |
| `doctor`       | Check external dependency status       |

For the full list: `officellm list-commands` (via `call` action) or load
the `OfficeLLM` skill.

## Error Handling

- If officellm is not installed, inform the user and provide the install link: https://github.com/ZhenchongLi/office-llm
- If a command fails, check stderr output for specific error messages
- Server mode errors should trigger a `close()` to clean up the session

## Tips

- Always verify the document exists before operating on it
- For large documents, prefer Server mode to avoid repeated parse overhead
- Use `--result-schema v2 --strict` flags (added automatically in CLI mode) for structured JSON output
- Check `status()` to see if there's an active server session before opening a new one
