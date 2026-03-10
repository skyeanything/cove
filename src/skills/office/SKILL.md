---
name: OfficeLLM
description: OfficeLLM command reference for document operations (DOCX/PPTX/XLSX).
emoji: "📄"
always: false
---

# OfficeLLM Command Reference

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
```javascript
// Edit existing document
var doc = officellm.open("report.docx");
doc.call("replace-text", { find: "old", replace: "new" });
doc.call("apply-format", { find: "Important", bold: true });
doc.save("report-updated.docx");
doc.close();

// Create new document from scratch
var doc = officellm.create({ markdown: "# Report\n\nContent here" });
doc.call("apply-format", { find: "Report", bold: true });
doc.save("report.docx");  // create documents require a path on save
doc.close();
```

Batch operations via `doc.execute()`:
```javascript
doc.execute([
  { op: "ReplaceText", target: "Draft", payload: "Final" },
  { op: "ApplyFormat", target: "Title", format: { bold: true, fontSize: "16pt" } }
], { atomic: true, dryRun: true });
```

Stateless (no open needed): `officellm.call("from-markdown", { i: "in.md", o: "out.docx" })`.

## officellm bridge API (cove_interpreter)

When officellm is available, a bridge API is auto-injected into the QuickJS runtime.
Use it for multi-step workflows combining multiple operations on the same document.
For single operations, use the `office` tool directly.

**Low-level workspace.officellm()** is also available for direct calls:
```javascript
var raw = JSON.parse(workspace.officellm("extract-text", { i: "report.docx" }));
if (raw.status === "success") console.log(raw.data.text);
```

Rules:
- Always check `status` before `open`. Always `close` when done.
- Wrap calls in try/catch; log the command name in error messages.
- `workspace.officellm()` returns a JSON string; always `JSON.parse()` it.

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

For the complete command reference (~100 commands, workflows, best practices), use the `skill_resource` tool to load guides on demand. Do NOT guess command names.
