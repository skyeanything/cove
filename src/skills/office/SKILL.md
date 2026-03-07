---
name: OfficeLLM
description: Bootstrap for bundled office tool — Tauri tool for document operations (DOCX/PPTX/XLSX).
emoji: "📄"
always: false
---

# Office (Bundled Tauri Tool)

ALWAYS use the `office` Tauri tool for document operations. Do NOT use `bash` to call `officellm` directly — the binary is not in PATH. All operations go through dedicated Tauri IPC commands via the `office` tool.

## QuickJS API

In `cove_interpreter`, use the `officellm` global object for document operations:

```javascript
var doc = officellm.open("report.docx");
var text = doc.call("extract-text");
doc.call("replace-text", { find: "old", replace: "new" });
doc.call("apply-format", { find: "Important", bold: true });
doc.save("report-updated.docx");
doc.close();
```

Batch operations via `doc.execute()`:

```javascript
doc.execute([
  { op: "ReplaceText", target: "Draft", payload: "Final" },
  { op: "ApplyFormat", target: "Title", format: { bold: true, fontSize: "16pt" } }
], { atomic: true, dryRun: true });
```

Stateless commands (no open document needed): `officellm.call("from-markdown", { i: "in.md", o: "out.docx" })`.

## Loading the Full Command Reference

For the complete command reference (~100 commands, workflows, best practices), use the `skill_resource` tool to load guides on demand. Do NOT guess command names.
