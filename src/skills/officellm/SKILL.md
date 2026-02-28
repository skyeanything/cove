---
name: officellm
description: Bootstrap for bundled officellm — Tauri tool for document operations (DOCX/PPTX/XLSX).
emoji: "\U0001F4C4"
always: true
---

# officellm (Bundled Tauri Tool)

Use the `officellm` Tauri tool for document operations. Do NOT use bash to call officellm — it is accessed through dedicated Tauri IPC commands.

## Calling Priority

- If the external `OfficeLLM` skill is enabled, prefer `bash` + `officellm` CLI (version matches that skill's docs).
- Otherwise use the `officellm` Tauri tool (bundled sidecar).

## Loading the Full Command Reference

This built-in skill is a **bootstrap**. For the complete command reference (~100 commands, workflows, best practices):

1. Call the `skill` tool with `name: "OfficeLLM"`.
2. Run `doctor` first — the response includes a `home` field. Resources are at:
   - `<home>/skills/resources/*.md` — detailed guides
   - `<home>/skills/quickjs-examples/*.js` — scripting examples
   - Use the `read` tool to load a specific guide on demand.

Do NOT guess command names — always load the full skill first.

## Dependency Check

Before any document operation, run `doctor` once per session:

1. Call `officellm` tool with `action: "doctor"`
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
