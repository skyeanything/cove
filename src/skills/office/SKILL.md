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

## Loading the Full Command Reference

For the complete command reference (~100 commands, workflows, best practices), use the `skill_resource` tool to load guides on demand. Do NOT guess command names.
