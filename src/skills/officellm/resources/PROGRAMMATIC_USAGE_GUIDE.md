# Programmatic Usage Guide

> **Relationship**: This guide expands on [SKILL.md Section 6](../SKILL.md) (Programmatic Usage). For the full command index, see SKILL.md. For server mode details, see [SERVER_MODE_GUIDE.md](SERVER_MODE_GUIDE.md).

Agents call OfficeLLM as a subprocess. This guide provides ready-to-use helpers, exit code handling, V2 envelope parsing, and common automation patterns for Python, Bash, and JavaScript.

## Setup

### Recommended Config Initialization

```bash
officellm config --init-agent-profile
```

This sets `strict=true`, `resultSchema=v2`, and `backup=true` — the recommended defaults for automation:
- **strict**: Write commands return exit 2 on NO_MATCH (detectable by exit code)
- **resultSchema v2**: Unified JSON envelope with `version`, `status`, `code`, `data`, `metrics`, `errors`, `meta`
- **backup**: Creates `.bak-{timestamp}` before overwriting files

## Language Helpers

### Python

```python
import subprocess, json

def ollm(cmd, **kwargs):
    """Call OfficeLLM and return parsed JSON result."""
    args = ["officellm", "--result-schema", "v2", "--strict", cmd]
    for k, v in kwargs.items():
        args.extend([f"--{k.replace('_', '-')}", str(v)])
    r = subprocess.run(args, capture_output=True, text=True)
    result = json.loads(r.stdout)
    if r.returncode == 2:
        return result  # NO_MATCH — caller decides
    if r.returncode != 0:
        err_msg = "Unknown error"
        if result.get("errors"):
            err_msg = result["errors"][0].get("message", err_msg)
        raise RuntimeError(err_msg)
    return result

# Usage
result = ollm("extract-text", i="doc.docx")
result = ollm("replace-text", i="doc.docx", find="old", replace="new", o="doc.docx")
```

### Bash

```bash
ollm() { officellm --result-schema v2 --strict "$@"; }
ollm_json() { ollm "$@" | jq .; }

# Usage
ollm extract-text -i doc.docx
ollm_json search -i doc.docx --find "keyword"
```

### JavaScript (Node.js)

```javascript
const { execFileSync } = require("child_process");

function ollm(cmd, args = {}) {
  const a = ["--result-schema", "v2", "--strict", cmd];
  for (const [k, v] of Object.entries(args))
    a.push(`--${k.replace(/_/g, "-")}`, String(v));
  return JSON.parse(execFileSync("officellm", a, { encoding: "utf-8" }));
}

// Usage
const result = ollm("extract-text", { i: "doc.docx" });
const replaced = ollm("replace-text", { i: "doc.docx", find: "old", replace: "new", o: "doc.docx" });
```

## Exit Code Reference

### Standard Commands

| Exit Code | Meaning | Action |
|-----------|---------|--------|
| 0 | Success | Parse `data` from JSON |
| 1 | Error (missing args, invalid input, exception) | Read `errors[0].message` and `errors[0].suggestions` |
| 2 | NO_MATCH (`--strict` mode only) | Text not found — decide: retry, skip, or abort |

### Sync Commands (`sync diff`, `sync merge3`, `sync resolve`, `sync apply-patch`, `sync validate`)

| Exit Code | Meaning | Action |
|-----------|---------|--------|
| 0 | Success | Continue workflow |
| 1 | Runtime error | Check error message |
| 2 | Argument error | Fix command arguments |
| 3 | Unresolved conflicts | Provide more decisions or manual intervention |
| 4 | Hash mismatch (concurrent edit) | Re-fetch latest version and retry |
| 5 | Validation failed | Check document structure |

## V2 Envelope Parsing

### Envelope Structure

```json
{
  "version": "2.0",
  "status": "success",
  "code": "OK",
  "command": "replace-text",
  "data": { "applied": true },
  "metrics": { "matched_count": 3, "changed_count": 3 },
  "errors": null,
  "meta": { "output_path": "/path/to/output.docx", "schema": "v2" }
}
```

Null fields are omitted from output.

### Parsing by Language

**Python**:
```python
result = ollm("replace-text", i="doc.docx", find="old", replace="new", o="doc.docx")
if result["status"] == "success":
    print(f"Changed {result['metrics']['changed_count']} matches")
elif result["code"] == "NO_MATCH":
    print("Text not found")
```

**Bash**:
```bash
result=$(ollm replace-text -i doc.docx --find "old" --replace "new" -o doc.docx)
status=$(echo "$result" | jq -r '.status')
if [ "$status" = "success" ]; then
    echo "Changed $(echo "$result" | jq '.metrics.changed_count') matches"
fi
```

**JavaScript**:
```javascript
const result = ollm("replace-text", { i: "doc.docx", find: "old", replace: "new", o: "doc.docx" });
if (result.status === "success") {
  console.log(`Changed ${result.metrics.changed_count} matches`);
}
```

## Common Patterns

### Pattern 1: Search → Conditional Format

Find all paragraphs containing specific text and apply formatting.

```python
result = ollm("search", i="doc.docx", find="DRAFT")
matches = result["data"]["matches"]

for m in matches:
    xpath = m["xpath"]
    ollm("apply-format", i="doc.docx", o="doc.docx",
         xpath=xpath, bold="true", color="FF0000")
```

### Pattern 2: Extract Table → Process → Update Cells

Read data from a table, transform it, and write back.

```python
result = ollm("get-table-data", i="invoice.docx", table_index="0")
rows = result["data"]["rows"]

for r, row in enumerate(rows[1:], start=1):  # skip header
    price = float(row[2].replace("$", ""))
    new_price = f"${price * 1.1:.2f}"
    ollm("set-table-cell", i="invoice.docx", o="invoice.docx",
         table_index="0", row=str(r), col="2", value=new_price)
```

### Pattern 3: Multi-Document Batch

Apply the same operation across all DOCX files in a directory.

```bash
for f in *.docx; do
    echo "Processing: $f"
    if ! ollm replace-text -i "$f" --find "Acme Corp" --replace "NewCo Inc" -o "$f"; then
        echo "  Warning: no match or error in $f (exit $?)" >&2
    fi
done
```

### Pattern 4: Error Handling & Retry

Preview with dry-run, then apply with fallback.

```python
import sys

def safe_replace(file, find, replace):
    """Replace with dry-run preview, then apply."""
    preview = ollm("replace-text", i=file, find=find, replace=replace, dry_run="true")
    matched = preview.get("metrics", {}).get("matched_count", 0)

    if matched == 0:
        print(f"No matches for '{find}' — skipping", file=sys.stderr)
        return False

    print(f"Found {matched} match(es), applying...")
    ollm("replace-text", i=file, find=find, replace=replace, o=file)
    return True

# Usage with fallback
if not safe_replace("doc.docx", "Quater", "Quarter"):
    safe_replace("doc.docx", "quater", "Quarter")  # try lowercase
```

## Troubleshooting

| Symptom | Cause | Fix |
|---------|-------|-----|
| `exit 1` with no JSON output | `officellm` not on PATH | Verify installation with `officellm info` |
| `exit 0` but `status: "partial"` | NO_MATCH without `--strict` | Add `--strict` flag or check `status` field |
| `json.JSONDecodeError` | stderr mixed with stdout | Use `capture_output=True` or redirect stderr |
| Slow performance (4+ commands) | Per-call startup overhead | Switch to [Server Mode](SERVER_MODE_GUIDE.md) |
