# Execute Batch Operations Guide

> **Relationship**: This guide expands on [SKILL.md Section 3](../SKILL.md) (Core Capabilities → Content Editing → `execute`). For the full command index, see SKILL.md.

The `execute` command runs multiple document operations in a single pass, reading and writing the file once. It supports 22 operation types, conditional filtering, atomic rollback, and per-operation track-changes control.

## Basic Usage

```bash
# Inline JSON
officellm execute -i doc.docx -o output.docx --instructions '[{"op":"ReplaceText","target":"old","payload":"new"}]'

# From file
officellm execute -f instructions.json -i doc.docx -o output.docx

# With safety flags
officellm execute -f instructions.json -i doc.docx -o output.docx --dry-run --atomic --strict
```

## Operation Types

### Text Operations

| Operation | Description | Required | Optional |
|-----------|-------------|----------|----------|
| `ReplaceText` | Find & replace text | `target`, `payload` | `context`, `fuzzy`, `threshold`, `match_policy`, `clean_placeholder`, `format_mode`, `condition` |
| `Delete` | Delete matched text | `target` | `context`, `fuzzy`, `threshold`, `match_policy`, `condition` |
| `InsertAfter` | Insert content after marker | `target`, `payload` | `context`, `fuzzy`, `threshold`, `match_policy`, `condition` |
| `InsertBefore` | Insert content before marker | `target`, `payload` | `context`, `fuzzy`, `threshold`, `match_policy`, `condition` |
| `Append` | Append to document section | `payload` | `context` |

### Paragraph Operations

| Operation | Description | Required | Optional |
|-----------|-------------|----------|----------|
| `ReplaceParagraphByIndex` | Replace paragraph by 0-based index | `target` (int), `payload` | `context`, `condition` |
| `ReplaceParagraphByXPath` | Replace paragraph by XPath | `target` (xpath), `payload` | — |

### Style & Format Operations

| Operation | Description | Required | Optional |
|-----------|-------------|----------|----------|
| `ApplyStyle` | Apply named style to text or paragraph | `target` (text or int), `style` | `condition` |
| `ApplyStyleRange` | Apply style to paragraph range | `target` ("start-end"), `style` | `condition` |
| `ApplyFormat` | Apply direct formatting | `target`, `format` (object) | `match_policy`, `condition` |

### Template Operations

| Operation | Description | Required | Optional |
|-----------|-------------|----------|----------|
| `FillPlaceholder` | Fill template placeholder | `target` (key), `payload` | batch-level: `placeholder_prefix`, `placeholder_suffix` |

### Table Operations

| Operation | Description | Required | Optional |
|-----------|-------------|----------|----------|
| `SetTableCell` | Set cell value | `table_index`, `row`, `col`, `payload` | `condition` (only `in_table`) |
| `InsertRow` | Insert empty row | `table_index`, `row` | `condition` (only `in_table`) |
| `DeleteRow` | Delete row | `table_index`, `row` | `condition` (only `in_table`) |
| `InsertColumn` | Insert empty column | `table_index`, `column` | `condition` (only `in_table`) |
| `DeleteColumn` | Delete column | `table_index`, `column` | `condition` (only `in_table`) |

### Image Operations

| Operation | Description | Required | Optional |
|-----------|-------------|----------|----------|
| `InsertImage` | Insert image | `payload` (image path) | `target`, `position`, `width_cm`, `alt_text`, `condition` (only `in_table`) |
| `DeleteImage` | Delete image by index | `image_index` | `condition` (only `in_table`) |
| `ReplaceImage` | Replace image by index | `image_index`, `payload` (new path) | `condition` (only `in_table`) |

### Annotation Operations

| Operation | Description | Required | Optional |
|-----------|-------------|----------|----------|
| `AddComment` | Add comment to text | `target` (anchor text), `payload` (comment) | `author` |
| `InsertHyperlink` | Insert hyperlink | `target` (anchor text), `payload` (URL) | `tooltip` |
| `RemoveHyperlink` | Remove hyperlink | `target` (link text) | — |

## Condition Object

The optional `condition` (aliases: `filter`, `when`) filters which paragraphs an operation affects. Multiple fields combine with **AND** logic.

| Field | Type | Description | Applicable Ops |
|-------|------|-------------|----------------|
| `style` | string | Paragraph must have this style name | Text/paragraph ops |
| `contains` | string | Paragraph must contain this text substring | Text/paragraph ops |
| `not_contains` | string | Paragraph must NOT contain this text substring | Text/paragraph ops |
| `paragraph_index_range` | [int, int] | Half-open range [start, end) of paragraph indices | Text/paragraph ops |
| `in_table` | bool | Paragraph must be inside (true) or outside (false) a table | All ops |
| `table_row_count_gte` | int | Table must have at least N rows | Table ops only |
| `image_exists_at` | int | An image must exist at the given 0-based index | Image ops only |
| `cell_empty` | `{"table_index": int, "row": int, "col": int}` | Specified cell must be empty | Table ops only |

**Scope limits**: Table, image, and annotation ops only support `in_table`, `table_row_count_gte`, `image_exists_at`, and `cell_empty`. Using text/paragraph condition fields (`style`, `contains`, `not_contains`, `paragraph_index_range`) on table, image, or annotation ops causes those ops to be skipped. `Append` ignores conditions entirely.

### Example — Text condition

```json
{
  "op": "ReplaceText",
  "target": "TODO",
  "payload": "DONE",
  "condition": {
    "style": "Normal",
    "contains": "TODO",
    "paragraph_index_range": [10, 50]
  }
}
```

### Example — Combined table conditions

```json
{
  "op": "SetTableCell",
  "table_index": 0,
  "row": 1,
  "col": 0,
  "payload": "新值",
  "condition": {
    "table_row_count_gte": 3,
    "cell_empty": {"table_index": 0, "row": 1, "col": 0}
  }
}
```

## Parameter Aliases

Parameters in the execute JSON accept multiple names for compatibility with CLI conventions:

| Canonical | Aliases |
|-----------|---------|
| `target` | `find`, `search` |
| `payload` | `replace`, `content`, `value` |
| `context` | `scope` |
| `table_index` | `table`, `table-index` |
| `image_index` | `image-index` |
| `width_cm` | `width-cm` |
| `alt_text` | `alt-text` |
| `condition` | `filter`, `when` |
| `format_mode` | `formatMode`, `format-mode` |

## Auto Reindex

When a batch contains structural row/column operations (`InsertRow`, `DeleteRow`, `InsertColumn`, `DeleteColumn`), subsequent operations that reference rows or columns by index will see shifted coordinates relative to the original document.

**Enable auto reindex** to let OfficeLLM recalculate coordinates automatically after each structural change, so all operations can be written using original-document coordinates.

```bash
# CLI flag
officellm execute -f instructions.json -i doc.docx -o output.docx --auto-reindex

# JSON field
{
  "auto_reindex": true,
  "instructions": [...]
}
```

**How it works**: An `IndexAdjuster` tracks each insert/delete as it is applied and remaps the row/column indices of all subsequent operations before they execute. No manual coordinate adjustment is needed.

**Example**: Delete row 2, then update what was originally row 3 (now row 2 after deletion).

```json
{
  "auto_reindex": true,
  "instructions": [
    { "op": "DeleteRow", "table_index": 0, "row": 2 },
    { "op": "SetTableCell", "table_index": 0, "row": 3, "col": 1, "payload": "Updated" }
  ]
}
```

Without `auto_reindex`, the second op would target the wrong row. With it, row 3 in the original document is found correctly.

> **Note**: `auto_reindex` only adjusts row/column indices within the same table. Cross-table references are not adjusted.

## Atomic Mode

`--atomic` enables all-or-nothing execution. If any operation fails, the entire document is rolled back to its pre-execute state.

```bash
officellm execute -f instructions.json -i doc.docx -o output.docx --atomic
```

### Report Fields

| Field | Type | Description |
|-------|------|-------------|
| `atomic` | bool | Whether atomic mode was enabled |
| `rolled_back` | bool | True if any op failed and all changes were reverted |
| `skipped` | int | Number of ops skipped due to errors |
| `skipped_by_condition` | int | Number of ops skipped because their condition didn't match |

### Behavior

- **On success**: All operations applied, `rolled_back: false`
- **On failure**: Document unchanged, `rolled_back: true`, failing op reported in `skipped`
- **Conditions**: Ops skipped by condition are NOT treated as failures — they don't trigger rollback

## Format Mode

Per-operation `format_mode` controls how `payload` text is interpreted:

| Mode | Behavior |
|------|----------|
| `auto` (default) | If payload contains Markdown syntax, parse as Markdown; otherwise plain text |
| `preserve` | Always treat as plain text, preserve existing formatting |
| `markdown` | Always parse payload as Markdown |

## Track Changes

Per-operation `track_changes` (bool) overrides the batch-level `--track-changes` setting. Available on text-matching ops: `ReplaceText`, `Delete`, `InsertAfter`, `InsertBefore`.

## Full Example

```json
{
  "instructions": [
    {
      "op": "ReplaceText",
      "target": "COMPANY_NAME",
      "payload": "Acme Corporation",
      "condition": { "style": "Normal" }
    },
    {
      "op": "ApplyFormat",
      "target": "Acme Corporation",
      "format": { "bold": true, "color": "003366" }
    },
    {
      "op": "SetTableCell",
      "table_index": 0,
      "row": 1,
      "col": 3,
      "payload": "$1,250,000"
    },
    {
      "op": "InsertAfter",
      "target": "Executive Summary",
      "payload": "## Key Findings\n\nRevenue increased by 15% year-over-year.",
      "format_mode": "markdown"
    },
    {
      "op": "DeleteRow",
      "table_index": 1,
      "row": 5
    },
    {
      "op": "InsertImage",
      "payload": "chart.png",
      "target": "See chart below",
      "position": "after",
      "width_cm": 12,
      "alt_text": "Revenue chart"
    }
  ]
}
```

```bash
officellm execute -f instructions.json -i report.docx -o report.docx --atomic --strict
```

## Troubleshooting

| Symptom | Cause | Fix |
|---------|-------|-----|
| `rolled_back: true` | One op failed in atomic mode | Check which op failed in the output report |
| `skipped_by_condition` is high | Conditions are too restrictive | Use `search` to verify text/style exists |
| NO_MATCH on `ReplaceText` | Text not found in document | Run `search --find "text"` to verify |
| Table op skipped | Unsupported condition field on table op | Table, image, and annotation ops only support `in_table`, `table_row_count_gte`, `image_exists_at`, `cell_empty` |
| Order-dependent failures | Indices shift after insert/delete | Enable `--auto-reindex` or write operations using original-document coordinates |
