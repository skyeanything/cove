---
name: OfficeLLM
description: OfficeLLM command reference for document operations (DOCX/PPTX/XLSX).
emoji: "📄"
always: false
---

# OfficeLLM Command Guide

## First step: discover, do not guess

When you use the bundled `office` tool and you are not certain about the command name or parameters, discover first:

1. `office(command: "help")`
2. `office(command: "list-commands")`
3. `office(command: "get-command-schema", args: { name: "<command>" })`
4. Only then execute the document command

For wrapper commands (`open`, `save`, `status`, etc.), inspect them with:

```text
office(command: "help", args: { name: "save" })
```

## Wrapper commands vs document commands

**Cove wrapper commands**
- `help`
- `detect`
- `doctor`
- `list-commands`
- `get-command-schema`
- `open`
- `create`
- `save`
- `close`
- `status`

**OfficeLLM document commands**
- Real runtime commands such as `replace-text`, `insert`, `extract-text`, `list-structure`
- Discover these at runtime with `list-commands` / `get-command-schema`

## Tool priority

1. **`office` tool** — single operations and command discovery
2. **`cove_interpreter` + officellm bridge** — multi-step workflows on the same document
3. **`skill_resource`** — workflow and mapping guides, not command schema lookup

## Single-operation examples

```text
office(command: "help")
office(command: "list-commands", args: { category: "Editing" })
office(command: "get-command-schema", args: { name: "replace-text" })
office(command: "open", args: { path: "report.docx" })
office(command: "replace-text", args: { find: "old", replace: "new" })
office(command: "save", args: { path: "report-final.docx" })
office(command: "close")
```

## Multi-step workflows

Use the built-in `cove_interpreter` officellm bridge when you need multiple operations on the same active document:

```lua
local doc = officellm.open("report.docx")
doc.call("replace-text", { find = "Draft", replace = "Final" })
doc.call("apply-format", { find = "Final", bold = true })
doc.save("report-final.docx")
doc.close()
```

## Session coordination

- `office` and `cove_interpreter` share one process-wide officellm session
- Check `office(command: "status")` before `open` if you suspect another document is active
- Always `close` when the workflow is done
- Do not use `bash` to run `officellm`; bundled office must go through the `office` tool

## Simple tasks: skip this skill

For simple read/write/merge tasks, the `read` and `write` tools handle DOCX directly without loading this skill. Only load this skill when you need advanced operations (formatting, find-replace, slide manipulation, spreadsheet formulas).

## Resources

- `resources/command-discovery.md` — exact discovery workflow for bundled office
- `resources/command-mapping.md` — common naming differences and when to use wrapper commands
