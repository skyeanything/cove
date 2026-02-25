# Precise Replacement Guide

This guide details how to use the precise replacement features of OfficeLLM, specifically utilizing XPath and IDs to target exact content within a DOCX file.

## Overview

Standard find-and-replace relies on text matching, which can be ambiguous if the text appears multiple times. Precise replacement uses unique identifiers (XPath) to target a specific node in the document structure.

## Workflow

### 1. Search for Targets

First, use the `search` command to find all occurrences of your target text. The output will include a unique `xpath` for each match.

```bash
officellm search -i input.docx --find "TARGET"
```

**Output Example:**
```json
{
  "matches": [
    {
      "text": "TARGET",
      "xpath": "/w:document[1]/w:body[1]/w:p[3]/w:r[1]/w:t[1]",
      "context": { ... }
    },
    {
      "text": "TARGET",
      "xpath": "/w:document[1]/w:body[1]/w:p[10]/w:r[2]/w:t[1]",
      "context": { ... }
    }
  ]
}
```

### 2. Preview the Replacement (Recommended)

Before executing the replacement, preview what will change:

```bash
officellm replace-text -i input.docx \
  --target-xpath "/w:document[1]/w:body[1]/w:p[3]/w:r[1]/w:t[1]" \
  --replace "New Value" \
  --dry-run
```

**Output:**
```json
{
  "dryRun": true,
  "summary": {
    "totalChanges": 1,
    "command": "replace-by-xpath"
  },
  "changes": [
    {
      "location": {
        "xpath": "/w:document[1]/w:body[1]/w:p[3]/w:r[1]/w:t[1]",
        "elementType": "t"
      },
      "before": "TARGET",
      "after": "New Value"
    }
  ]
}
```

### 3. Execute the Replacement

After confirming the preview looks correct:

```bash
officellm replace-text -i input.docx -o output.docx \
  --target-xpath "/w:document[1]/w:body[1]/w:p[3]/w:r[1]/w:t[1]" \
  --replace "New Value"
```

### Arguments

- `--target-xpath` (or `--xpath`): The XPath string returned by the search command. (`--target-id` and `--id` are deprecated aliases that still work but emit a warning.)
- `--replace`: The text to replace with.
- `--find`: (Optional) If specified, searches for this text *within* the target node instead of replacing the entire node content.

### 4. Scoped Replacement
You can combine `--xpath` with `--find` to perform a search-and-replace *within* the targeted node, rather than replacing the entire node value. This is useful for partial updates in a specific location (e.g., a specific table cell).

```bash
officellm replace-text -i input.docx \
  --xpath "//w:tbl[1]/w:tr[1]/w:tc[1]" \
  --find "OldText" \
  --replace "NewText"
```

## When to Use

- **Ambiguous Text**: When "Date: 2024" appears in the header, footer, and body, and you only want to change the body one.
- **Structured Updates**: When updating specific cells in a table where you know the structure but the content might vary (combined with `raw-xml` or tailored search).
- **Automated Workflows**: When a preceding analysis step identifies exactly which node needs modification.

## Limitations

- The XPath must be exact. If the document structure changes (e.g., editing outside OfficeLLM), the XPath might become invalid. Always `search` freshly before `replace`.
- Currently only supports plain text replacement via this method (no markdown/html injection yet).
