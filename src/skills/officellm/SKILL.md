---
name: OfficeLLM
description: Professional Word document (.docx) manipulation tools via OfficeLLM CLI
metadata: {"version": "2.11", "author": "OfficeLLM Team", "license": "MIT"}
---

# OfficeLLM Skill

**Version**: 2.11 (Updated 2026-02-23)

This skill provides comprehensive capabilities for reading, writing, and modifying Microsoft Word (.docx) documents through the `officellm` CLI tool. Designed specifically for AI agents, it offers structured inputs/outputs, precise targeting (XPath/ID), and dry-run capabilities to ensure reliable document automation.

---

## Agent Discovery Guide (read this first)

For structured JSON discovery (use these instead of `--help` which gives plain text):

| Goal | Command |
|------|---------|
| Compact JSON index of all commands | `officellm list-commands` |
| Filter by capability | `officellm list-commands --category Tables` |
| Full schema for one command | `officellm get-command-schema --command replace-text` |
| All schemas (filtered) | `officellm get-command-schema --all --filter "batch_compatible=true"` |
| Compact text overview | `officellm --help --compact` |

**Recommended workflow**: Run `officellm list-commands` first to see the full command index (~100 lines of JSON), then fetch individual schemas as needed.

---

## Table of Contents

1. [Quick Reference](#1-quick-reference) — Top 20 commands, common operations table
2. [Command Selection Guide](#2-command-selection-guide) — Decision trees for reading, editing, comparing, health checks
3. [Core Capabilities](#3-core-capabilities) — All commands by domain (analysis, editing, tables, formatting, etc.)
4. [Typical Workflows](#4-typical-workflows) — Step-by-step recipes for common tasks
5. [Best Practices for AI Agents](#5-best-practices-for-ai-agents) — Safety, targeting, NO_MATCH detection
6. [Programmatic Usage](#6-programmatic-usage) — Subprocess helpers, exit codes, server mode
7. [Troubleshooting Guide](#7-troubleshooting-guide) — Common errors and recovery
8. [Command Reference (Complete)](#8-command-reference-complete) — Alphabetical by category
9. [Status Codes & Output Format](#9-status-codes--output-format) — V2 envelope, exit codes, JSON structure
10. [Additional Resources](#10-additional-resources) — 23 detailed resource guides
11. [Learning Path for New Agents](#11-learning-path-for-new-agents) — Recommended progression
12. [Support](#12-support)

---

## 1. Quick Reference

### Quick Reference Card (Top 20)

| # | Task | Command | Example |
|---|------|---------|---------|
| 1 | Describe document | `describe-document` | `officellm describe-document -i doc.docx` |
| 2 | Extract all text | `extract-text` | `officellm extract-text -i doc.docx --limit 50` |
| 3 | List structure | `list-structure` | `officellm list-structure -i doc.docx` |
| 4 | Search text | `search` | `officellm search -i doc.docx --find "keyword"` |
| 5 | Replace text | `replace-text` | `officellm replace-text -i doc.docx --find "old" --replace "new" --dry-run` |
| 6 | Insert content | `insert` | `officellm insert -i doc.docx --markdown "# Title" --position append` |
| 7 | Batch operations | `execute` | `officellm execute -f ops.json -i doc.docx --atomic` |
| 8 | Read paragraph | `read-paragraph` | `officellm read-paragraph -i doc.docx --index 5` |
| 9 | Update paragraph | `update-paragraph` | `officellm update-paragraph -i doc.docx --index 5 --text "New"` |
| 10 | Apply formatting | `apply-format` | `officellm apply-format -i doc.docx --find "Title" --bold --color "003366"` |
| 11 | Get table data | `get-table-data` | `officellm get-table-data -i doc.docx --table-index 0` |
| 12 | Set table cell | `set-table-cell` | `officellm set-table-cell -i doc.docx --table-index 0 --row 1 --col 2 --value "X"` |
| 13 | Insert image | `insert-image` | `officellm insert-image -i doc.docx --image chart.png --wrap square` |
| 14 | Fill template | `fill-template` | `officellm fill-template -i tpl.docx --data data.json` |
| 15 | Compare docs | `sync diff` | `officellm sync diff --base old.docx --target new.docx --patch patch.json` |
| 16 | Three-way merge | `sync merge3` | `officellm sync merge3 --base b.docx --ours a.docx --theirs t.docx --out m.docx` |
| 17 | Validate | `validate` | `officellm validate --input doc.docx --pre-flight` |
| 18 | Repair | `repair` | `officellm repair --input broken.docx -o fixed.docx` |
| 19 | Render pages | `render-pages` | `officellm render-pages -i doc.docx` |
| 20 | Markdown to DOCX | `from-markdown` | `officellm from-markdown -i content.md -o output.docx` |

### Most Common Operations

| Task | Command Template | Notes |
|------|-----------------|-------|
| **Convert .doc** | `officellm from-doc -i doc.doc -o doc.docx` | Requires LibreOffice |
| **Convert to PDF** | `officellm to-pdf -i input.docx -o output.pdf` | Requires LibreOffice |
| **Render pages** | `officellm render-pages -i input.docx` | Requires pdftoppm; outputs to `~/.officellm/render/` |
| **Extract text** | `officellm extract-text -i doc.docx` | Returns structured JSON; supports `--limit` and `--offset` pagination |
| **Read paragraph** | `officellm read-paragraph -i doc.docx --paragraph-id 4B7F9C2D` | **Precise** read by `--paragraph-id` or `--index` |
| **Update paragraph** | `officellm update-paragraph -i doc.docx --paragraph-id 4B7F9C2D --text "New"` | **Precise** update by `--paragraph-id` or `--index` |
| **Delete paragraph** | `officellm delete-paragraph -i doc.docx --paragraph-id 4B7F9C2D` | **Precise** delete by `--paragraph-id` or `--index` |
| **Search text** | `officellm search -i doc.docx --find "text"` | Returns XPath locations; supports `--context-length` and `--before-after-length` (`0` = no truncation); `--limit`/`--offset` aliases for `--max-results`/`--skip` |
| **Replace text** | `officellm replace-text -i doc.docx --find "old" --replace "new"` | **Preserves formatting** by default |
| **Markdown replace** | `officellm replace-text -i doc.docx --find "old" --replace "**new**" --replace-markdown` | Resets formatting, parses Markdown |
| **Insert content** | `officellm insert -i doc.docx --markdown "# Title" --position append` | Supports Markdown/HTML/XPath |
| **Insert image** | `officellm insert-image -i doc.docx --image "a.png" --wrap square` | Supports **Text Wrapping**, `--index`, `--caption` |
| **Replace image** | `officellm replace-image -i doc.docx --image-index 0 --image "new.png"` | Replace by **image index** or `--target-id` |
| **Delete image** | `officellm delete-image -i doc.docx --image-index 0` | Delete by **index** or `--alt-text` match |
| **Batch images** | `officellm insert-images -i doc.docx --images "a.png,b.png"` | **Side-by-side** layout |
| **Set image wrap**| `officellm set-image-wrap -i doc.docx --image-index 0 --wrap tight` | Change wrap for existing image |
| **Insert equation** | `officellm insert-equation -i doc.docx --latex "E = mc^2"` | **LaTeX to OMML** conversion |
| **Insert break** | `officellm insert-break -i doc.docx --after "Text" --type page` | Support **Page/Section breaks** |
| **Set header** | `officellm set-header -i doc.docx --content "Thesis"` | Supports **STYLEREF** fields |
| **Set footer** | `officellm set-footer -i doc.docx --page-number` | **Auto page numbering** |
| **Add watermark** | `officellm add-watermark -i doc.docx --text "DRAFT"` | Applies to headers |
| **List watermarks** | `officellm list-watermarks -i doc.docx` | Detect existing watermarks |
| **Remove watermark** | `officellm remove-watermark -i doc.docx` | Clean removal from all headers |
| **List sections** | `officellm list-sections -i doc.docx` | Page size, orientation, margins |
| **Set section layout** | `officellm set-section-layout -i doc.docx --section 0 --orientation landscape` | Paper/orientation/margins |
| **Get page layout** | `officellm get-page-layout -i doc.docx` | Size, orientation, margins |
| **Set page layout** | `officellm set-page-layout -i doc.docx --paper A4 --orientation landscape` | Paper presets, custom sizes |
| **Get document properties** | `officellm get-document-properties -i doc.docx` | Title, author, dates, revision |
| **Set document properties** | `officellm set-document-properties -i doc.docx --title "Report" --creator "AI"` | Set title, author, keywords, etc. |
| **Insert caption** | `officellm insert-caption -i doc.docx --after "Image" --caption "Figure 1" --label "fig:1"` | **Cross-referenceable** tags |
| **Insert reference** | `officellm insert-ref -i doc.docx --after "See" --ref "fig:1"` | Auto-updating field codes |
| **Format table cell** | `officellm format-table-cell -i doc.docx --table-index 0 --row 1 --col 2 --highlight yellow` | Precise cell targeting |
| **Set table cell** | `officellm set-table-cell -i doc.docx -o output.docx --table-index 0 --row 1 --col 2 --value "New Content"` | Set content directly |
| **Set table cells** | `officellm set-table-cells -i doc.docx -o out.docx --table-index 0 --cells '[{"row":1,"col":1,"value":"A"}]'` | Batch update multiple cells in one I/O |
| **Apply formatting** | `officellm apply-format -i doc.docx --font "cn-fangsong"` | Bold/italic/color/highlight + alignment/spacing/indent + strikethrough/superscript/subscript/font-east-asia/font-ascii/character-spacing. Global by default, or use `--find`. Supports `--dry-run` |
| **List fonts** | `officellm list-fonts` | Returns available font IDs/Aliases |
| **Get table data** | `officellm get-table-data -i doc.docx --table-index 0` | Returns 2D JSON array |
| **Extract table** | `officellm extract-table -i doc.docx --table-index 0 --format json` | **Structured extraction** with headers and metadata |
| **Compare docs** | `officellm compare --original old.docx --revised new.docx -o diff.docx` | **Track Changes** output |
| **List revisions** | `officellm list-revisions -i doc.docx` | Read-only revision listing with filters |
| **Accept revisions** | `officellm accept-revisions -i doc.docx --author "AI"` | Finalize changes |
| **Structural diff** | `officellm diff --base old.docx --target new.docx` | **JSON diff** with anchors |
| **Three-way merge** | `officellm merge3 --base base.docx --ours a.docx --theirs b.docx --out merged.docx` | **Conflict detection** |
| **Apply patch** | `officellm apply-patch --input head.docx --patch diff.json --out replay.docx` | **Replay changes** |
| **Validate** | `officellm validate --input doc.docx` | **Structure + schema check** (`--level strict` for enhanced, `--pre-flight` for readiness score) |
| **Repair** | `officellm repair --input broken.docx -o fixed.docx` | **Auto-repair** orphaned images, broken bookmarks, invalid numbering, duplicate IDs |
| **Sync diff** | `officellm sync diff --base old.docx --target new.docx --patch patch.json` | **Structured patch JSON** |
| **Sync merge3** | `officellm sync merge3 --base base.docx --ours a.docx --theirs b.docx --out merged.docx --conflicts conflicts.json` | **File-driven 3-way merge** |
| **Sync resolve** | `officellm sync resolve --input merged.docx --conflicts conflicts.json --decisions decisions.json --out resolved.docx` | **Decision-based conflict resolution** |
| **Sync apply-patch** | `officellm sync apply-patch --input head.docx --patch patch.json --out replay.docx` | **Apply sync diff patch to new document** |
| **Sync validate** | `officellm sync validate --input replay.docx --level strict --json validate.json` | **Validate document structure after sync** |

| **Export workspace** | `officellm to-workspace -i doc.docx --with-map` | Create workspace + `content-map.json` |
| **Import workspace** | `officellm from-workspace -i ./workspace -o output.docx` | Rebuild DOCX from edited workspace |
| **Paragraph diff** | `officellm diff-text --original old.docx --revised new.docx` | Structured add/remove/modify diff |
| **Workspace diff** | `officellm workspace-diff -i ./workspace` | Compare workspace state vs original document |
| **Manage Config** | `officellm config --show-defaults` | **View/manage config defaults** |
| **Get Skills** | `officellm get-skills` | **Discover available skills/docs** |
| **Check Skills** | `officellm check-skills --custom-only` | **Check custom skill compatibility** |

### Automatic XML Normalization (New in 2.1)
Most commands (`replace-text`, `search`, etc.) now automatically normalize document XML (e.g., merging split runs) to ensure reliable text matching.
- **Opt-out**: Use `--no-normalize` if you need to preserve exact original XML structure (rare).

---

## 2. Command Selection Guide

Several command groups overlap in functionality. Use the decision trees and tables below to pick the right command for your task.

### A. Reading Document Content

```
Need document content?
├─ Full text dump (all paragraphs) ──────→ extract-text
├─ Document structure + paragraph IDs ───→ list-structure
└─ One specific paragraph by ID/index ──→ read-paragraph
```

| Command | Scope | Output | When to Use |
|---------|-------|--------|-------------|
| `extract-text` | Entire document (paginated with `--limit`/`--offset`, filterable with `--page`) | All text as JSON | Reading full content, feeding to LLM |
| `list-structure` | Entire document (paginated with `--limit`/`--offset`, filterable with `--page`) | Headings, tables, images, paragraph IDs, estimated pages | Understanding layout, getting IDs for targeted edits |
| `read-paragraph` | Single paragraph | Text + resolved index + paragraph ID | Micro-targeted read before `update-paragraph` |

**Recommended workflow**: `list-structure` → find target → `read-paragraph` → `update-paragraph`

> **See also**: [Pagination Guide](resources/PAGINATION_GUIDE.md) for `--limit`/`--offset`/`--page` usage, token budget strategies, and iterative extraction patterns.

### B. Extracting Table Data

```
Need table data?
├─ Structured with headers (JSON/CSV) ──→ extract-table  (recommended)
└─ Raw 2D cell array / cell range ──────→ get-table-data
```

| Command | Output Format | Header Handling | CSV Support | Range Filtering |
|---------|--------------|-----------------|-------------|-----------------|
| `extract-table` | JSON with metadata or CSV | Auto-detected headers | Yes (`--format csv`) | No |
| `get-table-data` | Raw 2D JSON array | None (raw cells) | No | Yes (`--row`, `--col`) |

### C. Comparing Documents

```
Need to compare two documents?
├─ Machine-readable JSON diff ──→ sync diff  (recommended)
│   └─ Also produces track-changes DOCX via --output
├─ Paragraph-level text changes ──→ diff-text
├─ Element-level structural diff ──→ diff
└─ Legacy track-changes DOCX only ──→ compare  (deprecated)
```

| Command | Output Format | Granularity |
|---------|--------------|-------------|
| `sync diff` | JSON patch + optional DOCX | Run-level |
| `diff` | JSON | Element-level |
| `diff-text` | JSON | Paragraph-level |
| `compare` | DOCX with track changes | Configurable |

See [Migration Guide: `compare` → `sync`](#migration-guide-compare--sync) in Section 8 for details.

### D. Editing Documents: Direct vs. Batch vs. Workspace

```
Need to modify a document?
├─ 1-3 targeted changes (replace, insert, format) ──→ Direct command
├─ 4+ related changes in one pass ──────────────────→ execute (batch JSON)
│   └─ Same file, 4+ sequential commands ───────────→ Server mode (faster)
└─ Full-document rewrite or restructure ────────────→ Workspace
    ├─ to-workspace → extract to editable Markdown
    ├─ Edit content.qmd (add/remove/rewrite sections)
    └─ from-workspace → rebuild DOCX preserving styles
```

| Approach | Best For | Format Preservation | Safety | Overhead |
|----------|----------|-------------------|--------|----------|
| **Direct commands** (`replace-text`, `insert`, `apply-format`) | 1-3 precise, targeted edits | Full (formatting preserved in-place) | `--dry-run` preview | Lowest |
| **Batch** (`execute`) | 4+ related changes in a single pass | Full (`--atomic` rollback on any failure) | `--dry-run` + `--atomic` rollback | Low |
| **Workspace** (`to-workspace` / `from-workspace`) | Full-document rewrite, restructure, or translation | Styles via reference.docx; inline formatting may simplify | vault/ isolates complex objects | Higher (export → edit → rebuild) |

**When to use Workspace**:
- Rewriting or translating most/all of the document text
- Reorganizing sections (moving, merging, splitting chapters)
- Content review that requires reading the full document as Markdown
- Generating a new document from scratch based on an existing template's styles
- Operations where the entire document context is needed at once

**When NOT to use Workspace** (use direct commands or `execute` instead):
- Replacing a few specific words or phrases → `replace-text`
- Inserting a paragraph at a known location → `insert`
- Updating a single table cell → `set-table-cell`
- Applying formatting to specific text → `apply-format`
- Any change where you can precisely target the affected elements

### E. Document Health & Safety

```
Need to check or fix document health?
├─ Pre-edit validation ──────────────→ validate --pre-flight
├─ Post-edit structure check ────────→ validate --level strict
├─ Broken document ──────────────────→ repair --dry-run → repair
├─ Post-sync validation ─────────────→ sync validate --level strict
├─ Review operation history ─────────→ audit --list
└─ Revert a change ──────────────────→ undo -i doc.docx [--steps N]
```

---

## 3. Core Capabilities

### 1. Document Analysis

| Command | Purpose | Key Features |
|---------|---------|--------------|
| `describe-document` | Comprehensive document overview | • `file_size_bytes` for memory-awareness<br>• Counts (paragraphs, tables, images, words, sections)<br>• Page estimate with confidence level and `page_break_count`<br>• Heading outline<br>• Feature flags (TOC, headers, footers, comments, track changes)<br>• Styles in use |
| `extract-text` | Extract document content | • Structured JSON output<br>• Preserves hierarchy<br>• Includes metadata<br>• **--final-only** for accepted revision view<br>• **--limit/--offset** pagination for large documents<br>• **--page** filter to a specific estimated page |
| `list-structure` | Analyze document layout | • Lists headings, tables, images, page breaks<br>• Shows hierarchy with estimated page numbers<br>• Provides `paragraph_index`, `paragraph_id`, `style_id`, `estimated_page` for targeting<br>• **--limit/--offset** pagination for large documents<br>• **--page** filter to a specific estimated page<br>• `page_summary` with overall page count and confidence |
| `search` | Find text/patterns | • **Returns XPath locations**<br>• Regex support<br>• Capture groups for data extraction<br>• Configurable context windows via `--context-length` and `--before-after-length` (`0` = no truncation)<br>• `--limit`/`--offset` aliases for `--max-results`/`--skip` |
| `find-location` | Semantic text location | • **Structure-aware** (Inside/After/Before)<br>• Structured JSON query<br>• Anchored search |
| `list-styles` | Discover available styles | • Paragraph styles<br>• Character styles<br>• Table styles |

### 2. Content Editing

| Command | Purpose | Key Features |
|---------|---------|--------------|
| `read-paragraph` | Read paragraph | • **Precise** content read by `--paragraph-id` or `--index`<br>• Supports simple workflow (list -> read -> update) |
| `update-paragraph` | Update paragraph | • **Precise** update by `--paragraph-id` or `--index`<br>• Preserves styles |
| `delete-paragraph` | Delete paragraph | • **Precise** delete by `--paragraph-id` or `--index`<br>• Cannot delete last paragraph |
| `replace-text` | Replace text content | • Exact match or regex<br>• **Simple replacement** (default, preserves formatting)<br>• **Markdown support** (`--replace-markdown` or `enable_markdown: true`)<br>• XPath targeting for precision<br>• **--dry-run mode**<br>• **--show-changes** includes before/after diffs in output<br>• **--clean-placeholder** removes trailing underlined whitespace runs (template fill-in)<br>• **--scope** limits to body/header/footer/footnote/endnote/all (default: all) |
| `replace-pattern` | Sequential replacement | • Replaces regex matches with sequence of values from JSON file<br>• **--show-changes** includes before/after diffs in output |
| `insert` | Insert new content | • Position control (append/prepend/after/before)<br>• Markdown/HTML support<br>• Anchor-based targeting<br>• **--show-changes** includes before/after diffs in output<br>• **--scope** limits to body/header/footer/footnote/endnote/all (default: body) |
| `insert-image` | Add images | • **Text wrapping** support (`--wrap`)<br>• `--index` for paragraph-index positioning<br>• `--caption` for auto caption<br>• Size control, DPI handling |
| `replace-image` | Replace existing images | • Target by `--image-index` (0-based) or `--target-id`<br>• Keeps paragraph/location context<br>• Optional resize and `--dry-run` preview |
| `delete-image` | Delete images | • Target by `--image-index` (0-based) or `--alt-text` (case-insensitive partial match)<br>• Cleans orphaned image parts<br>• `--dry-run` preview |
| `set-image-wrap`| Modfiy wrapping | • Changes existing image wrap mode (square/tight/etc.) |
| `insert-images` | Batch images | • **Side-by-side** layout support |
| `execute` | Batch operations | • JSON instruction format<br>• **22 operation types**: ReplaceText, Delete, InsertAfter, InsertBefore, Append, ReplaceParagraphByIndex, ReplaceParagraphByXPath, ApplyStyle, ApplyStyleRange, ApplyFormat, FillPlaceholder, SetTableCell, InsertRow, DeleteRow, InsertColumn, DeleteColumn, InsertImage, DeleteImage, ReplaceImage, AddComment, InsertHyperlink, RemoveHyperlink<br>• **Per-op `condition`**: filter which paragraphs are affected — `style`, `contains`, `not_contains`, `paragraph_index_range`, `in_table` (AND logic)<br>• **`--atomic`**: all-or-nothing mode — if any op fails, document is not saved (rolled back)<br>• **Dry-run & Revision acceptance**<br>• v1.4: `atomic`/`rolled_back`/`skipped`/`skipped_by_condition` fields in report<br>• Supports `--strict`/`--agent-mode` (exit 2 on zero matches)<br>• **Backup** before in-place edit<br>• **`--auto-reindex`** / `"auto_reindex": true`: automatically adjust row/col/image_index for structural mutations (InsertRow, DeleteRow, InsertColumn, DeleteColumn, DeleteImage) earlier in the same batch — use original-document coordinates throughout |
| `insert-equation` | Formula support | • **LaTeX to OMML** conversion<br>• Equation numbering<br>• Position control |
| `insert-break` | Page/Section breaks | • **Multiple types**: page, column, section-next-page, etc.<br>• Anchor-based positioning |
| `add-footnote` | Add footnotes | • Automatic numbering<br>• Anchor text targeting |
| `add-endnote` | Add endnotes | • Automatic numbering<br>• Anchor text targeting |
| `list-footnotes` | Analyze footnotes | • Returns all footnotes |
| `list-endnotes` | Analyze endnotes | • Returns all endnotes |
| `update-footnote` | Modify footnote | • `--footnote-id` targeting (from list-footnotes) |
| `update-endnote` | Modify endnote | • `--endnote-id` targeting (from list-endnotes) |
| `remove-footnote` | Delete footnote | • Two-way cleanup (part & body) |
| `remove-endnote` | Delete endnote | • Two-way cleanup (part & body) |

#### Execute Operation Types Quick Reference

| Operation | Description | Required Params | Optional Params |
|-----------|-------------|-----------------|-----------------|
| `ReplaceText` | Find & replace text (plain or markdown) | `target`, `payload` | `context`, `fuzzy`, `threshold`, `match_policy`, `clean_placeholder`, `format_mode`, `condition` |
| `Delete` | Delete matched text | `target` | `context`, `fuzzy`, `threshold`, `match_policy`, `condition` |
| `InsertAfter` | Insert content after text marker | `target`, `payload` | `context`, `fuzzy`, `threshold`, `match_policy`, `condition` |
| `InsertBefore` | Insert content before text marker | `target`, `payload` | `context`, `fuzzy`, `threshold`, `match_policy`, `condition` |
| `Append` | Append content to document section | `payload` | `context` |
| `ReplaceParagraphByIndex` | Replace paragraph by 0-based index | `target` (int), `payload` | `context`, `condition` |
| `ReplaceParagraphByXPath` | Replace paragraph by XPath | `target` (xpath), `payload` | — |
| `ApplyStyle` | Apply named style to text or paragraph | `target` (text or int), `style` | `condition` |
| `ApplyStyleRange` | Apply style to paragraph range | `target` ("start-end"), `style` | `condition` |
| `ApplyFormat` | Apply direct formatting (character + paragraph) | `target`, `format` (object) | `match_policy`, `condition` |
| `FillPlaceholder` | Fill template placeholder | `target` (key), `payload` | batch: `placeholder_prefix`, `placeholder_suffix` |
| `SetTableCell` | Set table cell value | `table_index`, `row`, `col`, `payload` | `condition` (only `in_table`) |
| `InsertRow` | Insert empty row in table | `table_index`, `row` | `condition` (only `in_table`) |
| `DeleteRow` | Delete row from table | `table_index`, `row` | `condition` (only `in_table`) |
| `InsertColumn` | Insert empty column in table | `table_index`, `column` | `condition` (only `in_table`) |
| `DeleteColumn` | Delete column from table | `table_index`, `column` | `condition` (only `in_table`) |
| `InsertImage` | Insert image at position | `payload` (image path) | `target`, `position`, `width_cm`, `alt_text`, `condition` (only `in_table`) |
| `DeleteImage` | Delete image by index | `image_index` | `condition` (only `in_table`) |
| `ReplaceImage` | Replace image by index | `image_index`, `payload` (new image path) | `condition` (only `in_table`) |
| `AddComment` | Add comment to matched text | `target` (anchor text), `payload` (comment text) | `author` |
| `InsertHyperlink` | Insert hyperlink on matched text | `target` (anchor text), `payload` (URL) | `tooltip` |
| `RemoveHyperlink` | Remove hyperlink by text match | `target` (link text) | — |

**Per-op `condition` object** (optional): Filters which paragraphs are affected. Fields: `style` (paragraph style name), `contains` (text substring), `not_contains` (exclude substring), `paragraph_index_range` ([start, end) half-open), `in_table` (true/false), `table_row_count_gte` (skip table op unless target table has ≥ N rows), `image_exists_at` (skip image op unless an image exists at index N), `cell_empty` ({table_index, row, col} — skip set-cell op unless cell is empty). Multiple fields combine with AND logic. Table/image/annotation ops with paragraph-level conditions are skipped; document-level conditions (`table_row_count_gte`, `image_exists_at`, `cell_empty`) are evaluated for table/image ops. Append ignores conditions. Note: `table_row_count_gte` and `image_exists_at` are not meaningful for annotation ops (`AddComment`, `InsertHyperlink`, `RemoveHyperlink`) — avoid using them together. Aliases: `filter`, `when`.

**Parameter aliases (execute JSON ↔ CLI)**: `find`/`search` → `target`, `replace`/`content`/`value` → `payload`, `scope` → `context`, `table`/`table-index` → `table_index`, `image-index` → `image_index`, `width-cm` → `width_cm`, `alt-text` → `alt_text`, `filter`/`when` → `condition`, `formatMode`/`format-mode` → `format_mode`. These aliases work in both directions — CLI commands also accept `--target`, `--payload`, `--context`.

All text-matching ops (`ReplaceText`, `Delete`, `InsertAfter`, `InsertBefore`) also accept per-op `track_changes` (bool) to override the batch-level setting.

> **See also**: [Execute Batch Operations Guide](resources/EXECUTE_BATCH_GUIDE.md) for full operation details, condition examples, atomic mode, and realistic JSON instructions.

> **WARNING: Silent NO_MATCH in Write Commands**
>
> `replace-text`, `replace-pattern`, and `insert` (with `after`/`before` position) return **exit code 0** with `status: "partial"` when search text is not found. The document is **not modified**, but agents may treat this as success.
>
> **Always check the response**:
> - Check `status` field — `"partial"` with `error.code: "NO_MATCH"` means text was not found
> - Or use `--strict` / `--agent-mode` to get exit code 2 on NO_MATCH (recommended for automation)
>
> **Best practice**: Run `search --find "text"` before write commands to verify the target exists.

### 3. Cross-References (Academic/Structured)

| Command | Purpose | Key Features |
|---------|---------|--------------|
| `insert-caption` | Add numbered caption | • Figure/Table/Equation types<br>• Unique label system<br>• SEQ field for auto-numbering |
| `insert-ref` | Add cross-reference | • References label/bookmark<br>• Clickable links in Word<br>• Dynamic number sync |
| `list-captions` | Analyze captions | • Shows all labels/bookmarks<br>• Identifies Word-native ones |
| `list-refs` | Analyze references | • Shows all reference locations<br>• Contextual preview |
| `update-caption` | Modify caption text | • Preserves label and link |
| `remove-caption` | Delete caption | • **Cascade delete** support for refs |
| `update-fields` | Sync numbers | • Forces F9/Dirty update on open |
| `list-bookmarks` | List all bookmarks | • Shows name, ID, paragraph index, text |
| `add-bookmark` | Add bookmark to paragraph | • By text search or paragraph index (0-based)<br>• Duplicate name check |
| `remove-bookmark` | Remove bookmark | • Keeps bookmarked content |
| `insert-field` | Insert field code | • REF/PAGEREF/SEQ types<br>• Targets any bookmark<br>• Custom switches and display text |
| `convert-fields-to-text` | Freeze field values as static text | • Handles fldSimple + complex fields<br>• Optional `--field-type` filter (e.g., DATE, MERGEFIELD)<br>• Returns converted count<br>• `--dry-run` preview |
| `list-content-controls` | List SDT content controls | • Returns tag, id, alias, type, current value<br>• Filter by `--type` (plainText, comboBox, etc.) or `--tag` |
| `set-content-control-value` | Set content control value | • Target by `--tag`, `--id`, or `--title`<br>• Returns matched/changed counts<br>• `--dry-run` preview |
| `list-hyperlinks` | List all hyperlinks | • External URLs and internal anchors<br>• Covers body, headers, footers, footnotes, endnotes |
| `insert-hyperlink` | Insert hyperlink | • Wraps matched text (single-run only)<br>• External URL or internal anchor |
| `update-hyperlink` | Update hyperlink | • Change URL, anchor, or display text<br>• By index (0-based) or text search |
| `remove-hyperlink` | Remove hyperlink | • Preserves display text<br>• Clears hyperlink formatting |

### 4. Header & Footer Operations

| Command | Purpose | Key Features |
|---------|---------|--------------|
| `set-header` | Set header content | • **Section support**<br>• `{{styleref:StyleName}}` support<br>• First/Even/Odd types |
| `set-footer` | Set footer content | • **Auto page numbering**<br>• Custom formats (`- {n} -`)<br>• Section start page control |
| `list-headers`| Analyze headers | • Lists all header parts by section/type |
| `list-footers`| Analyze footers | • Lists all footer parts by section/type |
| `remove-header`| Clear header | • Targeted removal by section/type |
| `remove-footer`| Clear footer | • Targeted removal by section/type |
| `add-watermark`| Add watermark | • Text/Color/Opacity control<br>• Adds to headers |
| `list-watermarks`| List watermarks | • Returns text, color, section for each watermark |
| `remove-watermark`| Remove watermarks | • Removes all watermarks from all headers |

### 4b. Section Layout Operations

| Command | Purpose | Key Features |
|---------|---------|--------------|
| `list-sections` | Analyze sections | • Lists all sections with properties<br>• Page size, orientation, margins<br>• Header/footer presence per section |
| `set-section-layout` | Modify section layout | • Paper size presets (A4, A3, letter, legal)<br>• Orientation (portrait/landscape)<br>• Custom margins in cm<br>• Section break type |

### 5. Page Layout

| Command | Purpose | Key Features |
|---------|---------|--------------|
| `get-page-layout` | Read page layout | • Page size, orientation, margins<br>• Per-section reporting |
| `set-page-layout` | Modify page layout | • **Paper presets** (A4/A3/letter/legal)<br>• Orientation (portrait/landscape)<br>• Custom margins/dimensions with units (cm/mm/in) |

### 5b. Document Properties

| Command | Purpose | Key Features |
|---------|---------|--------------|
| `get-document-properties` | Read document metadata | • Title, author, dates, revision<br>• Keywords, category, content status<br>• Optional `--extended` for pages/words/characters |
| `set-document-properties` | Set document metadata | • Title, creator, subject, keywords<br>• Description, category, content status<br>• `--dry-run` preview |

### 6. Table Operations

| Command | Purpose | Key Features |
|---------|---------|--------------| 
| `insert-table` | Create tables | • JSON data input<br>• Auto-formatting<br>• Style application<br>• `--dry-run` preview |
| `get-table-data` | Extract table data | • 2D JSON array output<br>• Preserves structure<br>• Handles merged cells |
| `extract-table` | Structured table extraction | • **JSON/CSV format**<br>• **Header recognition**<br>• **Metadata included** (TableIndex, RowCount, ColumnCount)<br>• Optimized for LLM analysis |
| `format-table-cell` | Format cells | • Precise row/col targeting (1-based)<br>• Highlight, color, bold, shading<br>• Font customization |
| `set-table-cell` | Set content | • Overwrite content<br>• Markdown support<br>• Direct targeting<br>• `--dry-run` preview |
| `set-table-cells` | Batch set content | • Multiple cells in one I/O<br>• JSON inline or file<br>• Mixed value/markdown<br>• `--dry-run` preview |
| `apply-table-style` | Apply Word styles | • Built-in style support<br>• Custom styles |
| `insert-row/column` | Add structure | • Position control<br>• Preserves formatting<br>• `--dry-run` preview |
| `merge-cells` | Merge cell ranges | • Range syntax support<br>• `--dry-run` preview |
| `split-cells` | Split merged cells | • Horizontal & vertical<br>• Dry-run support |
| `set-table-header` | Set header rows | • Repeat header rows |
| `set-row-height` | Set row height | • Exact or minimum height<br>• Units: inches/cm/emu<br>• Auto (remove constraint)<br>• `--dry-run` preview |
| `set-column-width` | Set column width | • Updates grid + all cells<br>• Units: inches/cm/emu/pct<br>• `--dry-run` preview |

### 7. Formatting & Styles

| Command | Purpose | Key Features |
|---------|---------|--------------|
| `apply-format` | Direct formatting | • Bold, italic, underline, strikethrough<br>• Color, highlight<br>• Font size/family, font-east-asia, font-ascii<br>• Superscript, subscript, character-spacing<br>• **Paragraph**: alignment, spacing (before/after/line), indent (first-line/hanging/left/right)<br>• **Pagination** (PageBreakBefore, etc.)<br>• Optional `--find` (global by default)<br>• **--dry-run mode** |

### Font Management Commands

| Command | Description | Example |
|---------|-------------|---------|
| `font list` | List IDs/Aliases | `officellm font list` |
| `font init` | Create fonts.json | `officellm font init` |
| `font add` | Add font mapping | `officellm font add --id "my-font" --name "Arial" --east-asia false` |
| `font audit` | Audit document fonts | `officellm font audit -i document.docx` |
| `font replace` | Replace fonts in document | `officellm font replace -i doc.docx --from "SimSun" --to "cn-fangsong"` |
| `font check` | Check font compliance | `officellm font check -i document.docx --rules cn-gov` |
| `list-fonts` | Alias for `font list` | `officellm list-fonts` |

| `apply-style` | Apply named styles | • By text match, paragraph index, or range (0-based)<br>• Paragraph & character styles<br>• **--dry-run mode** |
| `modify-style` | Update style definitions | • Font, size, color, bold, italic<br>• Alignment, spacing, line-spacing<br>• **--dry-run mode** |
| `create-style` | Create a new custom style definition | • paragraph, character, or table type<br>• Font, size, color, bold, italic, alignment, spacing<br>• **--dry-run mode** |
| `import-styles` | Import styles from template | • Cross-document style copy<br>• Dependency resolution (basedOn, next, link) |
| `delete-style` | Delete a custom style | • Guards against built-in styles<br>• **--force** to reassign usages<br>• **--reassign** to specify replacement style<br>• **--dry-run mode** |
| `font` | Manage font mappings | • **list/init/add**: Font mappings<br>• **audit**: Scan document fonts<br>• **replace**: Batch font replacement<br>• **check**: Compliance validation |
| `list-fonts` | Shortcut for `font list` | • Agent-friendly JSON list |

### 8. Workflow & Safety

| Command | Purpose | Key Features |
|---------|---------|--------------|
| `--dry-run` | Preview changes | • **CRITICAL for safety**<br>• Shows what will change<br>• No file modification |

### 9. Document Comparison & Revisions

| Command | Purpose | Key Features |
|---------|---------|--------------|
| `compare` (legacy) | Compare two docs | • **Track Changes** output<br>• Custom author<br>• Paragraph/Word/Character granularity |
| `list-revisions` | List tracked revisions | • Read-only inspection<br>• Filter by author/type/date<br>• Returns revision keys for selective accept/reject |
| `accept-revisions` | Finalize changes | • Filter by author/type<br>• Selective acceptance via `--keys`<br>• **Interactive mode** support |
| `reject-revisions` | Undo changes | • Filter by author/type<br>• Selective rejection via `--keys`<br>• **Interactive mode** support |
| `disable-track-changes`| Stop tracking | • Removes revision mode |
| `enable-track-changes`| Start tracking | • Enables revision mode (idempotent) |
| `diff` | Structural JSON diff | • Paragraph-level change detection<br>• Anchor-based element tracking<br>• Inline change details |
| `merge3` | Three-way merge | • Auto-merge non-conflicting changes<br>• Conflict detection (text/style/structural)<br>• Strategy: safe, ours, theirs |
| `apply-patch` | Apply diff patch | • Replay changes from diff JSON<br>• Anchor-based element matching<br>• Reverse-order application |
| `validate` | Validate DOCX | • ZIP structure check<br>• OpenXML schema validation<br>• Required parts verification<br>• Duplicate paraId detection |
| `sync` | Sync command family | • File-driven interface for integration<br>• Subcommands: diff, merge3, resolve |
| `sync diff` | Structured patch diff | • Content-hash paragraph alignment<br>• Inline run-level changes<br>• Patch JSON output |
| `sync merge3` | Three-way merge (file) | • Dual-Compare conflict detection<br>• Auto-resolve non-conflicting<br>• conflicts.json output |
| `sync resolve` | Apply decisions | • accept_ours / accept_theirs / manual<br>• Hash validation<br>• Remaining conflicts tracking |
| `sync apply-patch` | Apply sync diff patch | • AnchorHash-based paragraph matching<br>• Tolerates document divergence<br>• Structured result with stats |
| `sync validate` | Validate document structure | • Basic/strict validation levels<br>• Detects conflict markers<br>• Exit code 5 on failure |

> **See also**: [Validate & Repair Guide](resources/VALIDATE_REPAIR_GUIDE.md) for validation levels, pre-flight readiness scoring, auto-repair details, and the difference between `validate` and `sync validate`.

#### Migration Guide: `compare` → `sync`

The `compare` command is now considered legacy. We recommend migrating to the `sync` command family for better integration and structured output.

**Command Equivalence:**

| Legacy Command | Recommended Alternative | Benefits |
|----------------|------------------------|----------|
| `officellm compare --original old.docx --revised new.docx -o diff.docx` | `officellm sync diff --base old.docx --target new.docx --output diff.docx --patch patch.json` | • Structured JSON patch output (via `--patch`)<br>• Machine-readable format<br>• Better integration with CI/CD |
| `officellm compare --original old.docx --revised new.docx -o diff.docx --author "John"` | `officellm sync diff --base old.docx --target new.docx --output diff.docx` | • File-driven workflow<br>• No session dependency<br>• **Note**: Author metadata not supported in sync |

**Why migrate to `sync`?**

1. **Structured Output**: `sync diff` produces machine-readable JSON patches (when using `--patch`) that can be programmatically processed
2. **File-Driven**: All inputs/outputs via files - no session state, perfect for automation
3. **Conflict Management**: `sync merge3` provides structured conflict detection and resolution workflow
4. **Better Integration**: Designed for CI/CD pipelines and automated document workflows
5. **Consistent Exit Codes**: Well-defined exit codes (0=success, 3=conflicts, 4=hash mismatch, 5=validation failed)

**Feature Gap**: The `sync` commands do not support custom author metadata (`--author` parameter). If author tracking is critical, you may need to continue using `compare` or implement author tracking externally.

**Migration Example:**

```bash
# Legacy approach
officellm compare --original v1.docx --revised v2.docx -o changes.docx

# Modern approach - generates both tracked changes and structured patch
officellm sync diff --base v1.docx --target v2.docx --output changes.docx --patch patch.json

# Use the patch for further automation
officellm sync apply-patch --input another.docx --patch patch.json --out updated.docx
```

### 10. Document Synchronization (sync)

The `sync` command family provides a modern, file-driven interface for document synchronization, merging, and conflict resolution. These commands are designed for automation in CI/CD pipelines and multi-user collaborative workflows.

#### Core Sync Commands

| Command | Purpose | Key Features |
|---------|---------|--------------|
| `sync diff` | Generate structured patch | • Content-hash based paragraph alignment<br>• Produces replayable JSON patch<br>• Tracks inline run-level changes<br>• Outputs both visual diff.docx and patch.json |
| `sync merge3` | Three-way merge | • Dual-compare conflict detection algorithm<br>• Auto-resolves non-conflicting changes<br>• Outputs merged.docx + conflicts.json<br>• Supports merge strategies: safe, ours, theirs |
| `sync resolve` | Apply conflict decisions | • Reads decisions.json to resolve conflicts<br>• Hash validation prevents concurrent edits<br>• Tracks remaining unresolved conflicts<br>• Exit code 3 if conflicts remain |
| `sync apply-patch` | Replay changes | • Applies patch.json to new document version<br>• AnchorHash-based tolerant matching<br>• Handles document divergence gracefully<br>• Returns detailed stats.json |
| `sync validate` | Validate structure | • Checks document integrity post-sync<br>• Levels: basic (default), strict<br>• Detects conflict markers<br>• Exit code 5 on validation failure |

#### Detailed Command Parameters

##### `sync diff` - Generate Structured Diff Patch
```bash
officellm sync diff --base <base.docx> --target <target.docx> [--patch <patch.json>] [--output <diff.docx>]
```
- **`--base`** (required): Original document path
- **`--target`** (required): Modified document path
- **`--patch`**: Output path for JSON patch (machine-readable changes)
- **`--output`**: Output path for visual diff DOCX (human-readable track changes)
- **`--json`**: Return result as JSON to stdout

**Output Format** (patch.json):
```json
{
  "Version": "1.0",
  "BaseHash": "sha256:abc123...",
  "TargetHash": "sha256:def456...",
  "Entries": [
    {
      "Op": "modify",
      "AnchorHash": "sha1:para_hash_123",
      "BaseText": "Original text",
      "NewText": "Modified text",
      "RunChanges": [...]
    }
  ]
}
```

##### `sync merge3` - Three-Way Merge
```bash
officellm sync merge3 --base <base.docx> --ours <ours.docx> --theirs <theirs.docx> [--out <merged.docx>] [--conflicts <conflicts.json>] [--strategy safe|ours|theirs]
```
- **`--base`** (required): Common ancestor document
- **`--ours`** (required): Our modified version
- **`--theirs`** (required): Their modified version
- **`--out`**: Output merged document path (optional)
- **`--conflicts`**: Output conflicts JSON path (optional)
- **`--strategy`**: Merge strategy (default: safe)
  - `safe`: Only auto-resolve when both sides agree
  - `ours`: Prefer our changes in conflicts
  - `theirs`: Prefer their changes in conflicts

**Conflicts Output Format**:
```json
{
  "DocumentHash": "sha256:...",
  "Conflicts": [
    {
      "ConflictId": "conflict-1",
      "Type": "text",
      "Anchor": {
        "ParaIndex": 5,
        "ParaHash": "sha1:abc123...",
        "NearbyText": "..."
      },
      "Base": {"Text": "Original", "StyleId": null},
      "Ours": {"Text": "Our change", "StyleId": null},
      "Theirs": {"Text": "Their change", "StyleId": null},
      "UiSummary": "Paragraph 5: Both sides modified differently",
      "Status": "unresolved"
    }
  ]
}
```

##### `sync resolve` - Apply Conflict Decisions
```bash
officellm sync resolve --input <merged.docx> --conflicts <conflicts.json> --decisions <decisions.json> [--out <resolved.docx>] [--remaining <remaining.json>]
```
- **`--input`** (required): Merged document with conflicts
- **`--conflicts`** (required): Conflicts JSON from merge3
- **`--decisions`** (required): Resolution decisions file
- **`--out`**: Output resolved document (optional)
- **`--remaining`**: Output path for unresolved conflicts (optional)

**Decisions Format**:
```json
{
  "Decisions": [
    {
      "ConflictId": "conflict-1",
      "Action": "accept_ours"  // or: accept_theirs, manual
    }
  ],
  "ExpectedHeadHash": "sha256:..."  // Optional concurrency check, read from JSON not CLI
}
```

##### `sync apply-patch` - Apply Patch to New Base
```bash
officellm sync apply-patch --input <head.docx> --patch <patch.json> --out <result.docx> [--json <stats.json>]
```
- **`--input`** (required): Current document version
- **`--patch`** (required): Patch JSON from sync diff
- **`--out`** (required): Output patched document
- **`--json`**: Output detailed statistics

**Statistics Output**:
```json
{
  "Stats": {
    "total_entries": 10,
    "applied": 8,
    "skipped": 2,
    "failed": 0
  },
  "Data": {
    "Applied": 8,
    "Skipped": 2,
    "Failed": 0,
    "Errors": [
      "Delete: Could not find paragraph with anchor sha1:missing_123"
    ]
  }
}
```

##### `sync validate` - Validate Document Integrity
```bash
officellm sync validate --input <document.docx> [--level basic|strict] [--json <result.json>]
```
- **`--input`** (required): Document to validate
- **`--level`**: Validation strictness (default: basic)
  - `basic`: ZIP structure and required parts
  - `strict`: + OpenXML schema compliance, conflict markers, duplicate IDs
- **`--json`**: Output validation report

**Exit Codes**:
- `0`: Validation passed
- `5`: Validation failed (document has issues)

#### Workflow Examples

##### Workflow 1: Basic Document Synchronization
**Goal**: Apply changes from one document to another

```bash
# Generate diff between versions
officellm sync diff --base v1.docx --target v2.docx --patch changes.json --output visual_diff.docx

# Review the changes (AI agent can parse changes.json)
cat changes.json | jq '.Entries[] | {Op, Location: .AnchorHash}'

# Apply patch to another document branch
officellm sync apply-patch --input branch_v1.docx --patch changes.json --out branch_v2.docx

# Validate the result
officellm sync validate --input branch_v2.docx --level strict
```

##### Workflow 2: Collaborative Conflict Resolution
**Goal**: Merge changes from two authors and resolve conflicts

```bash
# Step 1: Perform three-way merge
officellm sync merge3 \
  --base original.docx \
  --ours alice_edits.docx \
  --theirs bob_edits.docx \
  --out merged_draft.docx \
  --conflicts conflicts.json \
  --strategy safe

# Step 2: Check if there are conflicts (exit code 3 = has conflicts)
if [ $? -eq 3 ]; then
  echo "Conflicts detected, need resolution"

  # Step 3: Review conflicts (for AI agent processing)
  cat conflicts.json | jq '.Conflicts[] | {ConflictId, Type, UiSummary}'

  # Step 4: Create decisions file
  cat > decisions.json << EOF
{
  "Decisions": [
    {"ConflictId": "conflict-1", "Action": "accept_ours"},
    {"ConflictId": "conflict-2", "Action": "accept_theirs"},
    {"ConflictId": "conflict-3", "Action": "manual"}
  ]
}
EOF

  # Step 5: Apply decisions
  officellm sync resolve \
    --input merged_draft.docx \
    --conflicts conflicts.json \
    --decisions decisions.json \
    --out final.docx \
    --remaining unresolved.json

  # Step 6: Check for remaining conflicts
  if [ -s unresolved.json ]; then
    echo "Manual intervention needed for remaining conflicts"
  fi
fi

# Step 7: Validate final document
officellm sync validate --input final.docx --level strict
```

##### Workflow 3: CI/CD Pipeline Integration
**Goal**: Automated document updates in continuous integration

```bash
#!/bin/bash
# ci-sync-docs.sh - Run in CI pipeline

set -e  # Exit on any error

# Fetch latest approved version
APPROVED_VERSION="approved.docx"
WORKING_VERSION="working.docx"
PR_VERSION="pr_changes.docx"

# Generate patch from PR
officellm sync diff \
  --base "$WORKING_VERSION" \
  --target "$PR_VERSION" \
  --patch pr_patch.json

# Attempt to apply to approved version and capture result
RESULT=$(officellm sync apply-patch \
  --input "$APPROVED_VERSION" \
  --patch pr_patch.json \
  --out candidate.docx \
  --json)

APPLIED=$(echo "$RESULT" | jq '.Stats.applied // 0')
FAILED=$(echo "$RESULT" | jq '.Stats.failed // 0')

if [ "$FAILED" -gt 0 ]; then
  echo "❌ Patch application failed - manual merge required"
  exit 1
fi

# Validate the candidate (capture exit code before set -e triggers)
set +e  # Temporarily disable exit on error
officellm sync validate --input candidate.docx --level strict
VALIDATE_EXIT=$?
set -e  # Re-enable exit on error

if [ $VALIDATE_EXIT -eq 5 ]; then
  echo "❌ Document validation failed"
  exit 1
fi

echo "✅ Document sync successful - $APPLIED changes applied"
mv candidate.docx "$APPROVED_VERSION"
```

#### Error Handling Guide

##### Exit Codes
| Code | Meaning | Recovery Strategy |
|------|---------|------------------|
| `0` | Success | Continue workflow |
| `3` | Unresolved conflicts remain | Provide more decisions or manual intervention |
| `4` | Hash mismatch (concurrent edit) | Re-fetch latest version and retry |
| `5` | Validation failed | Check document structure, review error details |

##### Common Error Scenarios

**Scenario 1: Patch Application Failures**
```bash
# If apply-patch reports skipped/failed changes
officellm sync apply-patch --input doc.docx --patch patch.json --out result.docx --json stats.json

# Check what failed
jq '.Data.Errors[]' stats.json

# Reasons and solutions:
# - "paragraph_not_found": Target document has diverged significantly
# - "content_mismatch": Paragraph exists but content doesn't match expected base
```

**Scenario 2: Concurrent Edit Protection**
```bash
# Get current document hash
CURRENT_HASH=$(officellm sync diff --base empty.docx --target current.docx --json | jq -r '.Data.TargetHash')

# Include hash in decisions for concurrency protection
cat > decisions.json << EOF
{
  "ExpectedHeadHash": "$CURRENT_HASH",
  "Decisions": [...]
}
EOF

# If hash mismatch (exit code 4), someone else edited the document
```

**Scenario 3: Validation Failures**
```bash
# Get detailed validation report
officellm sync validate --input doc.docx --level strict --json report.json

# Check specific issues
jq '.Data.Issues[] | {Code, Message, Location}' report.json

# Common issues:
# - Conflict markers still present (<<<<<<< ======= >>>>>>>)
# - Duplicate paragraph IDs
# - Corrupted ZIP structure
```

#### Design Philosophy

The sync command family follows these principles:

1. **File-Driven**: All inputs and outputs through files - no session state
2. **Structured Output**: JSON formats for machine processing
3. **Predictable Exit Codes**: Consistent codes across all sync commands
4. **Incremental Resolution**: Supports partial conflict resolution
5. **Concurrency Safe**: Hash validation prevents lost updates
6. **Graceful Degradation**: Best-effort application when documents diverge

This design makes sync commands ideal for:
- Automated CI/CD pipelines
- Multi-user collaboration workflows
- Version control integration
- AI agent orchestration
- Batch document processing

### 11. Workspace System

The workspace system converts a DOCX into an editable Markdown workspace, allowing agents to read and rewrite entire documents as text. After editing, the workspace is rebuilt back into a DOCX that preserves the original styles.

**Workspace directory structure**:
```
workspace/
├── content.qmd          # Document body (Quarto Markdown) — EDIT THIS
├── manifest.json        # Asset manifest — DO NOT EDIT
├── reference.docx       # Original DOCX (style source) — DO NOT EDIT
├── media/               # Extracted images (referenced from content.qmd)
└── vault/               # Complex objects (charts, OLE) — DO NOT EDIT
```

| Command | Purpose | Key Features |
|---------|---------|--------------|
| `to-workspace` | Export DOCX → workspace | • Converts to editable Markdown<br>• `--with-map` generates content-map.json<br>• `--incremental` for text-only updates<br>• `--fidelity-check` scans for at-risk elements |
| `from-workspace` | Rebuild workspace → DOCX | • Preserves styles from reference.docx<br>• `--template` for custom style source<br>• `--fidelity-report` quantifies round-trip changes |
| `diff-text` | Paragraph-level text diff | • Structured add/remove/modify output<br>• Useful for verifying workspace edits |
| `workspace-diff` | Compare workspace vs original | • Rebuilds temp DOCX and diffs against reference<br>• `--include-fidelity` adds risk analysis |
| `workspace` | Manage workspaces | • `list`: show active workspaces<br>• `clean`: remove all workspaces |

**Key constraints**:
- Only edit `content.qmd` — never modify `vault/`, `manifest.json`, or `reference.docx`
- Inline character formatting (bold/italic within a run) may simplify during round-trip; complex run-level formatting is best handled with direct commands
- Workspace edits are not atomic — always keep the original DOCX as backup

---

## 4. Typical Workflows

### Workflow 1: Safe Text Replacement

**Goal**: Replace all occurrences of "Client" with "Customer" without breaking "ClientServer"

```bash
# Step 1: Preview the changes
officellm replace-text -i contract.docx \
  --find "Client" \
  --replace "Customer" \
  --dry-run

# Step 2: Review the output (JSON with all matches)
# If correct, proceed:

# Step 3: Execute the replacement (Simple mode - preserves formatting)
officellm replace-text -i contract.docx \
  --find "Client" \
  --replace "Customer" \
  -o contract_updated.docx

# Alternative: Replace with formatting changes (Markdown mode)
officellm replace-text -i contract.docx \
  --find "Client" \
  --replace "**IMPORTANT CUSTOMER**" \
  --replace-markdown \
  -o contract_updated.docx
```

**Agent Action**: Always parse the dry-run output to verify matches before executing.

> **NO_MATCH Check**: If dry-run output shows `matched_count: 0` or `status: "partial"`, the find text does not exist. Do not proceed. Use `search` to investigate.

---

### Workflow 2: Data Extraction & Analysis

**Goal**: Extract all tables from a report and analyze the data

```bash
# Step 1: List document structure to find tables
officellm list-structure -i report.docx

# Step 2: Extract specific table data
officellm get-table-data -i report.docx --table-index 0 -o table0.json

# Step 3: Process the JSON data (external script/AI analysis)
# table0.json contains: {"rows": [[cell1, cell2, ...], ...]}
```

---

### Workflow 3: Template Filling with Validation

**Goal**: Fill a contract template with client data

```bash
# Step 1: Discover all placeholders
officellm list-placeholders -i template.docx

# Step 2: Fill template with data
officellm fill-template -i template.docx \
  --data-inline '{"CLIENT_NAME": "Acme Corp", "DATE": "2026-02-21", "AMOUNT": "$50,000"}' \
  -o filled_contract.docx

# Step 3: For rich content (markdown rendering)
officellm fill-template -i template.docx \
  --data data.json \
  --rich \
  -o filled_contract.docx
```

> **Batch mode**: For large-scale template filling, use `execute` with `FillPlaceholder` ops and `placeholder_prefix`/`placeholder_suffix` at batch level. See [Template System Guide](resources/TEMPLATE_GUIDE.md).

---

### Workflow 4: Table Formatting & Highlighting

**Goal**: Highlight header row and mark errors in a data table

```bash
# Step 1: Format header row (row 1, all columns)
officellm format-table-cell -i report.docx \
  --table-index 0 \
  --row 1 \
  --col all \
  --background "FFFF00" \
  --bold

# Step 2: Find cells with "Error" and highlight them
# First, extract table data to find error locations
officellm get-table-data -i report.docx --table-index 0 -o table.json

# Step 3: Parse JSON to find error cells (external script)
# Then format each error cell:
officellm format-table-cell -i report.docx \
  --table-index 0 \
  --row 3 \
  --col 2 \
  --color "FF0000" \
  --bold \
  -o report_formatted.docx
```

---



### Workflow 6: Markdown to DOCX with Formatting

**Goal**: Convert Markdown content to a formatted Word document

```bash
# Step 1: Convert Markdown to DOCX
cat > content.md << 'EOF'
# Executive Summary

This is a **bold** statement with *emphasis*.

## Key Points

- Point 1
- Point 2
- Point 3

| Metric | Q1 | Q2 |
|--------|----|----|
| Revenue | 100K | 150K |
EOF

officellm from-markdown -i content.md -o report.docx

# Step 2: Apply additional formatting
officellm apply-format -i report.docx \
  --find "Executive Summary" \
  --color "0000FF" \
  --font-size 16

# Step 3: Format the table
officellm apply-table-style -i report.docx \
  --table-index 0 \
  --style "Grid Table 4 - Accent 1" \
  -o report_final.docx
```

---

### Workflow 7: Precise Insertion with XPath

**Goal**: Insert specialized content exactly after a specific paragraph (e.g., "Analysis Result") that might appear multiple times or in complex structures.

```bash
# Step 1: Search for the target text to get its XPath
officellm search -i doc.docx --find "Analysis Result"
# Output example: 
# { "matches": [ { "text": "Analysis Result", "xpath": "/w:document/w:body/w:p[15]", "index": 0 } ] }

# Step 2: Use the XPath to insert content precisely
officellm insert -i doc.docx \
  --markdown "## AI Analysis\n\nThe result indicates..." \
  --xpath "/w:document/w:body/w:p[15]" \
  --position after
```

---

### Workflow 8: Quick PR Review Comment

**Goal**: Post a review comment to a GitHub pull request in one step

```bash
# Single command to post a review comment
gh pr comment <PR#> --body-file - <<'EOF'
## Review Summary

**Overall**: Good work! The changes look solid.

**Suggestions**:
1. Consider adding error handling for edge cases
2. Update the README with new configuration options
3. Add a test for the new validation logic

**Questions**:
- How does this handle concurrent requests?
- Are there any performance implications?

**Approval**: ✅ LGTM with minor suggestions
EOF
```

**Notes**:
- Replace `<PR#>` with the actual pull request number
- The heredoc (`<<'EOF'`) allows multi-line comments without escaping
- Use `--body-file -` to read from stdin
- Format with Markdown for better readability in GitHub

---

### Workflow 9: Visual QA After Edits

**Goal**: Verify that layout-sensitive edits (tables, images, page breaks) render correctly by converting to PDF, rasterizing pages, and inspecting them visually.

**Prerequisite**: `pdftoppm` from **poppler-utils** (`brew install poppler` / `apt-get install poppler-utils`).

```bash
# One-step render (recommended)
officellm render-pages -i edited.docx
# Output: ~/.officellm/render/edited-*.png

# Or with custom options
officellm render-pages -i edited.docx --output-dir qa_pages --dpi 200 --format jpeg

# Review each page image (agent inspects visually)
# Check for: pagination drift, table overflow, image misplacement,
#            header/footer issues, line-wrap problems

# Report layout_risk result
# Construct a layout_risk JSON object summarising findings:
# {
#   "layout_risk": false,
#   "risk_reason": null,
#   "visual_checks_executed": true,
#   "pages_checked": 5,
#   "issues_found": [],
#   "missing_dependencies": []
# }
```

**When to use**: After any operation that changes pagination or spatial layout — inserting/deleting tables, images, equations, page/section breaks, or large text blocks.

**Fallback** (no `pdftoppm`): Use structural validation (`list-structure`, `extract-text`) to verify element counts and order, then report `layout_risk: true` with `visual_checks_executed: false` and `missing_dependencies: ["pdftoppm"]`.

See [`resources/VISUAL_QA_GUIDE.md`](resources/VISUAL_QA_GUIDE.md) for the full schema, check-item list, and end-to-end examples.

### Workflow 10: Agent Orchestration Contract (5-Stage Pipeline)

Every document edit session should follow the deterministic 5-stage pipeline defined in the [Agent Orchestration Guide](resources/AGENT_ORCHESTRATION_GUIDE.md):

| # | Stage | Goal | Key Commands |
|---|-------|------|--------------|
| 1 | **Inspect** | Baseline document state | `extract-text`, `list-structure`, `search` |
| 2 | **Edit** | Apply changes safely | `--dry-run` first, then `execute` / edit commands |
| 3 | **Structural Verify** | Validate post-edit structure | `list-structure`, `validate`, `extract-text` |
| 4 | **Visual Verify** | Confirm rendered layout | `render-pages` + visual inspection |
| 5 | **Decide** | Emit machine-readable result | Decision matrix (pass / fix / abort) |

**Decision rules**:
- **pass**: No errors, visual checks clean (or skipped with `layout_risk: true`)
- **fix**: Errors found, retry count < 3 — return to Stage 2 with corrective edit
- **abort**: 3 retries exhausted or structural corruption detected

The pipeline produces a JSON result conforming to [`schemas/orchestration-result.schema.json`](resources/schemas/orchestration-result.schema.json). See the orchestration guide for complete examples and the full output contract.

### Workflow 11: Workspace-Based Document Rewrite

**Goal**: Rewrite or restructure an entire document while preserving styles

```bash
# Step 1: Export to workspace (--fidelity-check warns about at-risk elements)
officellm to-workspace -i thesis.docx -o ./ws_thesis --fidelity-check

# Step 2: Edit content.qmd (agent reads and rewrites the Markdown)
# - Reorder sections, rewrite paragraphs, add/remove content
# - Reference images: ![caption](media/image1.png)
# - Do NOT touch vault/ or manifest.json

# Step 3: Preview changes before rebuilding
officellm workspace-diff -i ./ws_thesis

# Step 4: Rebuild DOCX from edited workspace (--fidelity-report quantifies changes)
officellm from-workspace -i ./ws_thesis -o thesis_v2.docx --fidelity-report

# Step 5: Verify changes with paragraph-level diff
officellm diff-text --original thesis.docx --revised thesis_v2.docx

# Step 6: Clean up workspace when done
officellm workspace clean
```

**When to use this workflow**: Full-document translation, major restructuring, content review + rewrite, or generating a new document that reuses an existing document's styles.

**When NOT to use this workflow**: For targeted edits (a few replacements, single paragraph updates, table cell changes), use direct commands or `execute` batch instead — they are faster and preserve all formatting precisely.

---

## 5. Best Practices for AI Agents

### 1. Always Use --dry-run First

```bash
# ❌ WRONG: Direct execution without preview
officellm replace-text -i doc.docx --find "old" --replace "new"

# ✅ CORRECT: Preview first, then execute
officellm replace-text -i doc.docx --find "old" --replace "new" --dry-run
# Review output...
officellm replace-text -i doc.docx --find "old" --replace "new" -o doc_updated.docx
```

### 2. Prefer Markdown for Structured Content

```bash
# ❌ WRONG: Plain text loses structure
officellm insert -i doc.docx --text "Title\nPoint 1\nPoint 2"

# ✅ CORRECT: Use Markdown for proper formatting
officellm insert -i doc.docx --markdown "# Title\n\n- Point 1\n- Point 2"
```

### 3. Use XPath for Precise Targeting

```bash
# ❌ RISKY: May replace unintended matches
officellm replace-text -i doc.docx --find "Section 1" --replace "Chapter 1"

# ✅ SAFER: Use XPath from search results
officellm search -i doc.docx --find "Section 1"
# Get XPath from output, then:
officellm replace-text -i doc.docx --xpath "/w:document/w:body/w:p[5]" --replace "Chapter 1"
```

### 4. Handle Sequential Edits Carefully

```bash
# ❌ WRONG: Multiple edits may invalidate indices
officellm delete-row -i doc.docx --table-index 0 --row 2
officellm delete-row -i doc.docx --table-index 0 --row 3  # Row 3 is now row 2!

# ✅ CORRECT: Use batch operations or re-read structure
officellm execute -f batch_deletes.json -i doc.docx
# OR re-read structure between operations
```

### 5. Check Command Help When Unsure

```bash
# Always available for every command
officellm <command> --help

# Examples:
officellm replace-text --help
officellm format-table-cell --help
```

### 6. Parse JSON Output Properly

All commands return JSON with this structure:

```json
{
  "status": "success",  // or "failure"
  "data": { ... },      // command-specific results
  "error": { ... }      // only present on failure
}
```

**Error handling**:
```json
{
  "status": "failure",
  "error": {
    "code": "UNEXPECTED_ERROR",
    "message": "...",
    "details": {
      "crash_report_path": "/path/to/crash/report"  // Check this for debugging
    }
  }
}
```

### 7. Verify Layout with Visual QA

After layout-sensitive edits, render pages and inspect visually:

```bash
officellm render-pages -i edited.docx
# Review page images in ~/.officellm/render/, then report layout_risk JSON
```

**Operations that warrant visual QA**:
- Inserting or deleting tables, rows, or columns
- Inserting images or equations
- Adding page or section breaks
- Large text insertions or deletions
- Header/footer changes that may affect pagination

See [`resources/VISUAL_QA_GUIDE.md`](resources/VISUAL_QA_GUIDE.md) for the full workflow, fallback strategy, and `layout_risk` schema.

### 8. Detect NO_MATCH in Write Commands

**Affected commands**: `replace-text`, `replace-pattern`, `insert` (with `after`/`before` position)

When the search text is not found, these commands return:
- **Default mode**: exit code `0`, `status: "partial"`, `error.code: "NO_MATCH"` — document unchanged
- **Strict mode** (`--strict`): exit code `2`, `status: "failure"`, `error.code: "NO_MATCH"`

**Detection (check response JSON)**:
```json
{
  "status": "partial",
  "error": { "code": "NO_MATCH" },
  "stats": { "matched_count": 0, "changed_count": 0 }
}
```

**Recovery workflow**:
```bash
# 1. Search to verify text exists
officellm search -i doc.docx --find "target text"

# 2. If 0 matches — check spelling, whitespace, or try regex
officellm search -i doc.docx --find "target.*text" --regex

# 3. Use --strict for automation (exit 2 on NO_MATCH)
officellm replace-text -i doc.docx --find "old" --replace "new" --strict
```

**Recommendation**: For automated pipelines, always use `--strict` or `--agent-mode`.

---

## 6. Programmatic Usage

Agents call OfficeLLM as a subprocess. This section provides quick-start helpers; for complete patterns and examples, see the [Programmatic Usage Guide](resources/PROGRAMMATIC_USAGE_GUIDE.md).

### Quick Start

#### Python

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

Bash and JavaScript helpers are available in the [Programmatic Usage Guide](resources/PROGRAMMATIC_USAGE_GUIDE.md).

### Exit Code Handling

| Exit Code | Meaning | Action |
|-----------|---------|--------|
| 0 | Success | Parse `data` from JSON |
| 1 | Error | Read `errors[0].message` and `errors[0].suggestions` |
| 2 | NO_MATCH (strict only) | Text not found — decide: retry, skip, or abort |

See **Status Codes & Output Format** below for the full V2 envelope reference and sync command exit codes.

For common automation patterns (search-conditional-format, extract-table-process-update, multi-doc-batch, error-retry), see the [Programmatic Usage Guide](resources/PROGRAMMATIC_USAGE_GUIDE.md).

### Server Mode

For workflows with **4+ commands on the same document**, server mode eliminates repeated startup and file-load overhead (~200ms per call). The server uses JSON-RPC 2.0 over stdio.

#### Lifecycle Example (Python)

```python
import subprocess, json

proc = subprocess.Popen(
    ["officellm", "serve"],
    stdin=subprocess.PIPE, stdout=subprocess.PIPE, text=True
)

def rpc(method, params=None, req_id=1):
    """Send a JSON-RPC request and return the result."""
    req = {"jsonrpc": "2.0", "id": req_id, "method": method}
    if params:
        req["params"] = params
    proc.stdin.write(json.dumps(req) + "\n")
    proc.stdin.flush()
    resp = json.loads(proc.stdout.readline())
    if "error" in resp:
        raise RuntimeError(f"RPC error {resp['error']['code']}: {resp['error']['message']}")
    return resp["result"]

# Open a document session
rpc("open", {"path": "report.docx"})

# Execute multiple commands without reloading
rpc("call", {"command": "replace-text", "args": ["--find", "2024", "--replace", "2025"]})
rpc("call", {"command": "replace-text", "args": ["--find", "Draft", "--replace", "Final"]})
rpc("call", {"command": "apply-format", "args": ["--xpath", "//w:p[1]", "--bold", "true"]})

# Check session state
status = rpc("status")
print(f"Dirty: {status['dirty']}")  # True — unsaved changes

# Save and clean up
rpc("save")             # saves to original path
rpc("close")            # closes the document session
rpc("shutdown")         # stops the server
proc.wait()
```

#### Available Methods

| Method | Parameters | Description |
|--------|-----------|-------------|
| `open` | `path` (required) | Load a document into the session |
| `call` | `command`, `args[]` (required) | Execute any CLI command on the loaded document |
| `save` | `path` (optional) | Save document (default: overwrite original) |
| `close` | — | Close the current document session |
| `status` | — | Query session state (`has_document`, `file_path`, `dirty`) |
| `shutdown` | — | Stop the server process |

For error codes, Bash/Node.js examples, and concurrency details, see the [Server Mode Guide](resources/SERVER_MODE_GUIDE.md).

---

## 7. Troubleshooting Guide

### Common Issues

#### 1. "File is locked or in use"

**Cause**: Document is open in Word or another process

**Solution**:
```bash
# Close the document in Word
# Or use a different output file:
officellm replace-text -i doc.docx --find "old" --replace "new" -o doc_new.docx
```

#### 2. "XPath not found"

**Cause**: Document structure changed or XPath is incorrect

**Solution**:
```bash
# Re-scan document structure
officellm list-structure -i doc.docx

# Use search to find current XPath
officellm search -i doc.docx --find "target text"
```

#### 3. "Table index out of range"

**Cause**: Table doesn't exist at specified index

**Solution**:
```bash
# List all tables first
officellm list-structure -i doc.docx
# Tables are 0-indexed: first table is --table-index 0
```

#### 4. "Regex pattern invalid"

**Cause**: Invalid regex syntax

**Solution**:
```bash
# Test regex pattern first
officellm search -i doc.docx --find "pattern" --regex --dry-run

# Escape special characters: . * + ? [ ] ( ) { } ^ $ | \
# Example: Find literal "." → use "\."
```

#### 5. "Unexpected crash" with crash report

**Cause**: Internal error in officellm

**Solution**:
```bash
# Check the crash report path in error output
# Example error:
# {
#   "error": {
#     "code": "UNEXPECTED_ERROR",
#     "details": {
#       "crash_report_path": "/tmp/officellm-crash-20260123-143000"
#     }
#   }
# }

# The crash report contains:
# - error.log: Stack trace and error details
# - input.docx: The document that caused the crash (if available)
# - command.json: The exact command that was executed

# Report the issue with these files
```

#### 6. "Permission denied"

**Cause**: No write access to output location

**Solution**:
```bash
# Check file permissions
ls -la doc.docx

# Use a different output location
officellm replace-text -i doc.docx --find "old" --replace "new" -o ~/Documents/output.docx
```

### Getting Help

1. **Check command help**: `officellm <command> --help`
2. **Review error JSON**: All errors include `error.code` and `error.message`
3. **Use --dry-run**: Preview changes before applying
4. **Check crash reports**: Located at path in `error.details.crash_report_path`
5. **Consult resources**: See `skills/resources/` for detailed guides

---

## 8. Command Reference (Complete)

### Conversion Commands

| Command | Description | Example |
|---------|-------------|---------|
| `from-doc` | .doc → DOCX | `officellm from-doc -i input.doc -o output.docx` |
| `from-html` | HTML → DOCX | `officellm from-html -i input.html -o output.docx` |
| `from-markdown` | Markdown → DOCX | `officellm from-markdown -i input.md -o output.docx` |
| `to-pdf` | DOCX → PDF | `officellm to-pdf -i input.docx -o output.pdf [--engine quarto]` |
| `render-pages` | DOCX/PDF → page images | `officellm render-pages -i input.docx [--dpi 150] [--format png]` |
| `to-html` | DOCX → HTML (use `--include-metadata` for metadata, `--include-headers` / `--include-footers` for page content, and `--preserve-sections` for wrapping content in &lt;section&gt; tags) | `officellm to-html -i input.docx -o output.html` |

### Analysis Commands

| Command | Description | Example |
|---------|-------------|---------|
| `describe-document` | Get document stats (pages, words, headings, images, etc.) | `officellm describe-document -i doc.docx` |
| `extract-text` | Extract text/structure | `officellm extract-text -i doc.docx -o output.json` |
| `list-structure` | List headings/tables/images | `officellm list-structure -i doc.docx` |
| `list-fields` | List merge fields | `officellm list-fields -i doc.docx` |
| `list-placeholders` | Scan text placeholders | `officellm list-placeholders -i template.docx` |
| `list-styles` | List paragraph styles | `officellm list-styles -i doc.docx` |
| `list-numbering` | List numbering definitions and paragraph usage | `officellm list-numbering -i doc.docx` |
| `list-table-styles` | List table styles | `officellm list-table-styles -i doc.docx` |
| `search` | Search with XPath results | `officellm search -i doc.docx --find "text" --regex --context-length 300 --before-after-length 100` |
| `find-location` | Semantic location | `officellm find-location -i doc.docx --query-json '{"anchor":"Chapter 1","target":"table","relation":"after"}'` |

### Editing Commands

| Command | Description | Example |
|---------|-------------|---------|
| `replace-text` | Replace text/regex | `officellm replace-text -i doc.docx --find "old" --replace "new" --dry-run` |
| `insert` | Insert content | `officellm insert -i doc.docx --markdown "# Title" --position append` |
| `insert-image` | Insert image | `officellm insert-image -i doc.docx --image chart.png --index 3 --caption "Sales"` |
| `set-list-level` | Change list paragraph level; supports `--dry-run` | `officellm set-list-level -i doc.docx --index 3 --level 1` |
| `apply-list-style` | Apply numbering style to paragraph; supports `--dry-run` | `officellm apply-list-style -i doc.docx --index 5 --style decimal` |
| `remove-list-style` | Remove list formatting from paragraph; supports `--dry-run` | `officellm remove-list-style -i doc.docx --index 5` |
| `insert-equation` | Insert formula | `officellm insert-equation -i doc.docx --latex "E = mc^2" --number "1-1"` |
| `execute` | Batch operations | `officellm execute -f instructions.json -i doc.docx` |

**Note**: All text search/replace commands support `--no-normalize` to disable automatic XML cleanup.

### Table Commands

| Command | Description | Example |
|---------|-------------|---------| 
| `insert-table` | Create table | `officellm insert-table -i doc.docx --data table.json` |
| `get-table-data` | Extract table | `officellm get-table-data -i doc.docx --table-index 0` |
| `extract-table` | Structured extraction | `officellm extract-table -i doc.docx --table-index 0 --format json` |
| `apply-table-style` | Apply style | `officellm apply-table-style -i doc.docx --table-index 0 --style "Grid Table 4"` |
| `format-table-cell` | Format cell | `officellm format-table-cell -i doc.docx --table-index 0 --row 1 --col 2 --highlight yellow` |
| `set-table-cell` | Set content | `officellm set-table-cell -i doc.docx -o output.docx --table-index 0 --row 1 --col 2 --value "New"` |
| `set-table-cells` | Batch set | `officellm set-table-cells -i doc.docx -o out.docx --table-index 0 --cells '[{"row":1,"col":1,"value":"A"}]'` |
| `insert-row` | Add row | `officellm insert-row -i doc.docx --table-index 0 --position 2` |
| `delete-row` | Remove row | `officellm delete-row -i doc.docx --table-index 0 --row 2` |
| `insert-column` | Add column | `officellm insert-column -i doc.docx --table-index 0 --position 2` |
| `delete-column` | Remove column | `officellm delete-column -i doc.docx --table-index 0 --column 2` |
| `delete-table` | Delete table | `officellm delete-table -i doc.docx --table-index 0` |
| `merge-cells` | Merge cells | `officellm merge-cells -i doc.docx --table-index 0 --range "1,1:1,3"` |
| `split-cells` | Split merged cells | `officellm split-cells -i doc.docx --table-index 0 --row 1 --col 1` |
| `set-row-height` | Set row height | `officellm set-row-height -i doc.docx -o out.docx --table-index 0 --row 1 --height 0.5 --unit inches --rule exact` |
| `set-column-width` | Set column width | `officellm set-column-width -i doc.docx -o out.docx --table-index 0 --column 0 --width 2 --unit inches` |

### Formatting Commands

| Command | Description | Example |
|---------|-------------|---------|
| `apply-style` | Apply paragraph style (by text, index, or range); supports `--dry-run` | `officellm apply-style -i doc.docx --index 3 --style Heading1` |
| `modify-style` | Modify style definition (font, size, color, alignment, spacing); supports `--dry-run` | `officellm modify-style -i doc.docx --style Heading1 --font-size 16 --bold` |
| `create-style` | Create a new paragraph, character, or table style definition; supports `--dry-run` | `officellm create-style -i doc.docx -o out.docx --name "Callout" --type paragraph --bold` |
| `import-styles` | Import styles from another document | `officellm import-styles -i doc.docx --from template.docx` |
| `delete-style` | Delete a custom style (--force to reassign usages); supports `--dry-run` | `officellm delete-style -i doc.docx --style MyCustomStyle` |
| `apply-format` | Direct formatting (character + paragraph); supports `--dry-run` | `officellm apply-format -i doc.docx --find "Important" --highlight yellow --bold` |
| `remove-direct-formatting` | Strip inline run formatting, keeping only style references; supports `--find`, `--style`, `--index`, `--preserve`, `--dry-run` | `officellm remove-direct-formatting -i doc.docx --find "摘要" --preserve bold,color` |

### TOC & Structure Commands

| Command | Description | Example |
|---------|-------------|---------|
| `insert-toc` | Insert Table of Contents | `officellm insert-toc -i doc.docx --position prepend` |
| `update-toc` | Update TOC | `officellm update-toc -i doc.docx` |
| `remove-toc` | Remove Table of Contents | `officellm remove-toc -i doc.docx` |

### Header & Footer Commands

| Command | Description | Example |
|---------|-------------|---------|
| `set-header` | Set header content | `officellm set-header -i doc.docx --content "Title"` |
| `set-footer` | Set footer content | `officellm set-footer -i doc.docx --page-number` |
| `list-headers` | List headers | `officellm list-headers -i doc.docx` |
| `list-footers` | List footers | `officellm list-footers -i doc.docx` |
| `remove-header` | Remove header | `officellm remove-header -i doc.docx --section 0` |
| `remove-footer` | Remove footer | `officellm remove-footer -i doc.docx` |
| `add-watermark` | Add watermark | `officellm add-watermark -i doc.docx --text "DRAFT"` |
| `list-watermarks` | List watermarks | `officellm list-watermarks -i doc.docx` |
| `remove-watermark` | Remove watermarks | `officellm remove-watermark -i doc.docx` |

### Section Layout Commands

| Command | Description | Example |
|---------|-------------|---------|
| `list-sections` | List sections | `officellm list-sections -i doc.docx` |
| `set-section-layout` | Set section layout | `officellm set-section-layout -i doc.docx --section 0 --orientation landscape` |

### Page Layout Commands

| Command | Description | Example |
|---------|-------------|---------|
| `get-page-layout` | Get page layout | `officellm get-page-layout -i doc.docx` |
| `set-page-layout` | Set page layout | `officellm set-page-layout -i doc.docx --paper A4 --orientation landscape` |

### Document Properties Commands

| Command | Description | Example |
|---------|-------------|---------|
| `get-document-properties` | Get document metadata | `officellm get-document-properties -i doc.docx --extended` |
| `set-document-properties` | Set document metadata | `officellm set-document-properties -i doc.docx --title "Report" --creator "AI"` |

### Revision Commands

| Command | Description | Example |
|---------|-------------|---------|

| `list-revisions` | List revisions | `officellm list-revisions -i doc.docx --author "AI"` |
| `accept-revisions` | Accept changes | `officellm accept-revisions -i doc.docx --author "AI"` |
| `reject-revisions` | Reject changes | `officellm reject-revisions -i doc.docx --author "Unknown"` |
| `disable-track-changes` | Turn off tracking | `officellm disable-track-changes -i doc.docx` |
| `enable-track-changes` | Turn on tracking | `officellm enable-track-changes -i doc.docx` |
| `add-comment` | Add comment | `officellm add-comment -i doc.docx --text "Review this" --find "Section 1"` |
| `remove-comments` | Remove all comments | `officellm remove-comments -i doc.docx` |
| `list-comments` | List comments | `officellm list-comments -i doc.docx [--author "AI"]` |
| `reply-comment` | Reply to comment | `officellm reply-comment -i doc.docx --id 1 --text "Addressed in v2"` |
| `resolve-comment` | Mark comment resolved | `officellm resolve-comment -i doc.docx --comment-id 1` |

### Sync Commands

| Command | Description | Example |
|---------|-------------|---------|
| `sync` | Sync command family | `officellm sync --help` |
| `sync diff` | Structured patch diff | `officellm sync diff --base old.docx --target new.docx --patch patch.json` |
| `sync merge3` | Three-way merge (file) | `officellm sync merge3 --base base.docx --ours a.docx --theirs b.docx --out merged.docx --conflicts conflicts.json` |
| `sync resolve` | Apply conflict decisions | `officellm sync resolve --input merged.docx --conflicts conflicts.json --decisions decisions.json --out resolved.docx` |
| `sync apply-patch` | Apply sync diff patch | `officellm sync apply-patch --input head.docx --patch patch.json --out replay.docx` |
| `sync validate` | Validate document structure | `officellm sync validate --input replay.docx --level strict --json validate.json` |

### Advanced Commands

| Command | Description | Example |
|---------|-------------|---------|
| `raw-xml` | XPath XML operations | `officellm raw-xml -i doc.docx --xpath "//w:p[1]" --query` |
| `fill-template` | Fill text placeholders with data (supports --rich markdown) | `officellm fill-template -i template.docx --data data.json --rich` |
| `simplify-markup` | Clean XML structure | `officellm simplify-markup -i doc.docx` |

### Management Commands

| Command | Description | Example |
|---------|-------------|---------|
| `audit` | Query or manage the operation audit log | `officellm audit --list --since 2h` |
| `undo` | Undo writes by restoring from backup (supports multi-step undo) | `officellm undo -i doc.docx --steps 3` |

> **See also**: [Audit & Undo Guide](resources/AUDIT_UNDO_GUIDE.md) for time filters, backup management, and end-to-end safety workflows.

| `info` | Show info/repo | `officellm info` |
| `merge` | Merge documents | `officellm merge -i doc1.docx doc2.docx -o merged.docx` |
| `split` | Split document | `officellm split -i doc.docx --by-heading 1` |
| `transfer` | Transfer section or table from one document to another | `officellm transfer --from source.docx --content section --index 0 --to target.docx -o out.docx` |
| `config` | Manage configuration, defaults, and paths | `officellm config --show-defaults` |
| `get-skills` | Get skill documentation | `officellm get-skills --name officellm` |
| `check-skills` | Check skill compatibility | `officellm check-skills --custom-only` |
| `doctor` | Check dependencies and validate test fixtures | `officellm doctor` or `officellm doctor --fixtures test-fixtures/` |
| `get-command-schema` | Get command schema with capabilities metadata; filter by capability; export as OpenAI/Claude/JSON Schema tool-use format | `officellm get-command-schema --command replace-text --format openai` |
| `list-commands` | List all commands as a compact JSON index; filter by category | `officellm list-commands` or `officellm list-commands --category Tables` |
| `to-workspace` | Export to workspace | `officellm to-workspace -i doc.docx -o workspace/` |
| `from-workspace` | Rebuild DOCX from workspace | `officellm from-workspace -i workspace/ -o output.docx` |
| `diff-text` | Paragraph-level text diff | `officellm diff-text --original old.docx --revised new.docx` |
| `workspace-diff` | Compare workspace vs original | `officellm workspace-diff -i ./workspace` |
| `workspace` | Manage workspaces | `officellm workspace list` |

### Server

| Command | Description | Example |
|---------|-------------|---------|
| `serve` | Start persistent server mode for document sessions (JSON-RPC 2.0 over stdio) | `officellm serve` |

---

## 9. Status Codes & Output Format

### Global Options

| Option | Description |
|--------|-------------|
| `--result-schema v1\|v2` | Set output envelope format (default: v2) |
| `--strict` / `--agent-mode` | Strict matching: write commands with NO_MATCH semantics return exit 2 on NO_MATCH instead of partial success |
| `--backup` | Create backup (`.bak-{timestamp}`) before overwriting an existing output file |
| `--log-level debug\|info\|warn\|error\|off` | Set diagnostic log level |

### Config Defaults

Set global/per-command defaults in `~/.officellm/config.json` to avoid repeating flags:

```json
{
  "defaults": {
    "strict": true,
    "resultSchema": "v2",
    "normalize": true,
    "backup": false,
    "logLevel": "warn"
  }
}
```

CLI flags always override config defaults. Use `officellm config --show-defaults` to inspect active defaults.

**Recommended for agents**: Run `officellm config --init-agent-profile` to set `strict=true`, `resultSchema=v2`, and `backup=true` in one step. This ensures write commands return exit 2 on NO_MATCH, making failures detectable by exit code alone.

Use `officellm get-command-schema --command <name>` to check if a command has `no_match_behavior` and `capabilities` — commands with `supports_strict: true` can return NO_MATCH when no content matches the selector. Use `--all --filter "capability=value"` to discover commands by capability (e.g. `--filter "batch_compatible=true"`).

### Exit Codes

**Standard/write commands**:
- `0`: Success (or partial success in default mode — check `status` field)
- `1`: Error (check JSON output for details)
- `2`: No match found (`--strict` mode only, write commands)

**Sync commands** (`sync-diff`, `sync-merge3`, `sync-resolve`, `sync-apply-patch`, `sync-validate`):
- `0`: Success
- `1`: Runtime error
- `2`: Argument error
- `3`: Unresolved conflicts
- `4`: Hash mismatch
- `5`: Validation failed

### JSON Output Structure

#### V1 Output (Legacy, `--result-schema v1`)

**Success** (with match statistics for write commands):
```json
{
  "status": "success",
  "output_path": "/path/to/output.docx",
  "stats": {
    "matched_count": 3,
    "changed_count": 3
  }
}
```

**Partial** (no match found, default mode):
```json
{
  "status": "partial",
  "message": "No matches found; document unchanged.",
  "error": {
    "code": "NO_MATCH",
    "message": "No matches found for the specified search criteria."
  },
  "stats": {
    "matched_count": 0,
    "changed_count": 0
  }
}
```

**Failure**:
```json
{
  "status": "failure",
  "error": {
    "code": "ERROR_CODE",
    "message": "Human-readable error message",
    "suggestions": [
      "Check if file exists",
      "Verify command arguments"
    ],
    "details": {
      "crash_report_path": "/path/to/crash/report"
    }
  }
}
```

#### V2 Envelope (Default)

Standard and write commands return a unified envelope by default. Null fields are omitted from output. Use `--result-schema v1` to revert to legacy format. **Note**: `sync-merge3`, `sync-resolve`, and `sync-apply-patch` are compatibility exceptions — they retain their existing JSON structure and use dedicated exit codes (see above).

**Success** (write command with matches):
```json
{
  "version": "2.0",
  "status": "success",
  "code": "OK",
  "command": "replace-text",
  "data": { "applied": true },
  "metrics": { "matched_count": 3, "changed_count": 3 },
  "meta": { "output_path": "/path/to/output.docx", "schema": "v2" }
}
```

**Partial / NO_MATCH** (default mode, exit 0):
```json
{
  "version": "2.0",
  "status": "partial",
  "code": "NO_MATCH",
  "message": "No matches found; document unchanged.",
  "command": "replace-text",
  "data": { "applied": false },
  "metrics": { "matched_count": 0, "changed_count": 0 },
  "errors": [{ "code": "NO_MATCH", "message": "No matches found for the specified search criteria." }],
  "meta": { "output_path": "/path/to/output.docx", "schema": "v2" }
}
```

**Dry-run** (preview mode, no file written):
```json
{
  "version": "2.0",
  "status": "success",
  "code": "OK",
  "command": "replace-text",
  "data": {
    "applied": false,
    "changes": [
      { "location": "paragraph 3", "old_text": "hello", "new_text": "world" }
    ]
  },
  "metrics": { "matched_count": 1, "changed_count": 1 },
  "meta": { "dry_run": true, "schema": "v2" }
}
```

**V2 Field Reference**:

| Field | Type | Description |
|-------|------|-------------|
| `version` | string | Always `"2.0"` |
| `status` | string | `"success"`, `"partial"`, or `"failure"` |
| `code` | string | `"OK"` on success, error code otherwise (e.g. `"NO_MATCH"`, `"FILE_NOT_FOUND"`) |
| `message` | string? | Human-readable message (omitted when null) |
| `command` | string? | Command name that produced this result |
| `data` | object? | Command-specific payload (e.g. `{ "applied": true }`) |
| `metrics` | object? | `{ "matched_count": int, "changed_count": int }` for write commands |
| `errors` | array? | List of `{ "code", "message", "suggestions"?, "details"? }` objects |
| `meta` | object? | `{ "input_path"?, "output_path"?, "dry_run"?, "strict"?, "schema" }` |

**Agent Parsing Guidance**:

- **Check `status` first**: `"success"` = done, `"partial"` = completed with warnings, `"failure"` = error
- **Check `code` for specifics**: `"NO_MATCH"` means search text was not found in the document
- **Dry-run parity**: Dry-run output has the same shape as apply output — `data.applied` is `false` and `meta.dry_run` is `true`, but `metrics` contains real match counts
- **Strict mode**: With `--strict`, NO_MATCH becomes `status: "failure"` with exit code 2 instead of `status: "partial"` with exit code 0

### Per-Command Output Schemas

Each command returns a specific data shape in the `Data` field. The most common patterns:

| Return Type | Description | Used By |
|-------------|-------------|---------|
| **WriteSuccess** | `Status` + `OutputPath` only | Most write/mutation commands (50+) |
| **WriteResult** | `Stats` (matched/changed counts) + `Data.applied` | `replace-text`, `replace-pattern`, `insert` |
| **ExtractTextResult** | `text` + `paragraphs[]` with styles | `extract-text` |
| **SearchResult** | `matches[]` with XPath + context | `search` |
| **StructureResult** | `structure[]` tree of headings/tables/images | `list-structure` |
| **DiffResult** | `Entries[]` with change types + stats | `diff`, `diff-text` |
| **Merge3Result** | Merge status + `Conflicts[]` | `merge3` |
| **ValidateResult** | `IsValid` + `Issues[]` | `validate`, `sync-validate` |

Full reference with JSON examples: [`docs/output-schemas.md`](../docs/output-schemas.md)

The `<Returns>` element in `help-text.xml` specifies the return type for each command.

### Common Error Codes

| Code | Meaning | Action |
|------|---------|--------|
| `NO_MATCH` | No matches found for write command | Verify search text exists in document |
| `FILE_NOT_FOUND` | Input file doesn't exist | Check file path |
| `FILE_LOCKED` | File is open elsewhere | Close file or use different output |
| `INVALID_XPATH` | XPath syntax error | Verify XPath syntax |
| `TABLE_NOT_FOUND` | Table index invalid | Use `list-structure` to find tables |
| `INVALID_REGEX` | Regex pattern error | Check regex syntax |
| `UNEXPECTED_ERROR` | Internal error | Check crash report path in error details |

---

## 10. Additional Resources

The `skills/resources/` directory contains 23 detailed guides:

### Resource Guide Index

| File | Purpose | When to Read |
|------|---------|-------------|
| **Core Operations** | | |
| [`EXECUTE_BATCH_GUIDE.md`](resources/EXECUTE_BATCH_GUIDE.md) | Batch operations: 22 op types, conditions, atomic mode | Before using `execute` with complex instructions |
| [`PAGINATION_GUIDE.md`](resources/PAGINATION_GUIDE.md) | Pagination with `--limit`/`--offset`/`--page` | When processing large documents in chunks |
| [`TEMPLATE_GUIDE.md`](resources/TEMPLATE_GUIDE.md) | Placeholder-based template filling and rich text rendering | When filling templates with data |
| [`TABLE_OPERATIONS_GUIDE.md`](resources/TABLE_OPERATIONS_GUIDE.md) | Table creation, extraction, formatting, batch cell updates | When working with tables extensively |
| **Targeting & Formatting** | | |
| [`XPATH_INSERT_GUIDE.md`](resources/XPATH_INSERT_GUIDE.md) | Precise content insertion using XPath | When using `--xpath` for targeted inserts |
| [`PRECISE_REPLACEMENT_GUIDE.md`](resources/PRECISE_REPLACEMENT_GUIDE.md) | XPath and precise targeting for replacements | When `--find` is ambiguous; need exact location |
| [`FORMATTING_BEST_PRACTICES.md`](resources/FORMATTING_BEST_PRACTICES.md) | Table and text formatting best practices | Before complex formatting operations |
| [`FONT_MANAGEMENT_GUIDE.md`](resources/FONT_MANAGEMENT_GUIDE.md) | Font management, CJK rendering, compliance | When dealing with font issues or CJK documents |
| [`IMAGE_LAYOUT_GUIDE.md`](resources/IMAGE_LAYOUT_GUIDE.md) | Image text wrapping and side-by-side layout | Before image insertion with layout control |
| [`WATERMARK_GUIDE.md`](resources/WATERMARK_GUIDE.md) | Watermark operations (add, list, remove) | When managing document watermarks |
| **Document Structure** | | |
| [`HEADER_FOOTER_GUIDE.md`](resources/HEADER_FOOTER_GUIDE.md) | Headers, footers, and page numbering | When setting up headers/footers by section |
| [`CROSS_REFERENCE_GUIDE.md`](resources/CROSS_REFERENCE_GUIDE.md) | Academic cross-referencing and dynamic links | When building documents with figure/table references |
| **Safety & Verification** | | |
| [`VALIDATE_REPAIR_GUIDE.md`](resources/VALIDATE_REPAIR_GUIDE.md) | Document validation levels, repair auto-fixes, pre-flight | Before/after edits to check document health |
| [`AUDIT_UNDO_GUIDE.md`](resources/AUDIT_UNDO_GUIDE.md) | Operation audit log, multi-step undo, backup management | When tracking changes or reverting operations |
| [`VISUAL_QA_GUIDE.md`](resources/VISUAL_QA_GUIDE.md) | Visual QA workflow for layout verification | After layout-sensitive edits (tables, images, breaks) |
| [`AGENT_RELIABILITY_GUIDE.md`](resources/AGENT_RELIABILITY_GUIDE.md) | Revision handling, stable targeting, dry-run safety | When building reliable automation pipelines |
| [`FINE_GRAINED_OPS_BEST_PRACTICES.md`](resources/FINE_GRAINED_OPS_BEST_PRACTICES.md) | High-reliability fine-grained document operations | For mission-critical edit accuracy |
| **Agent Architecture** | | |
| [`AGENT_ORCHESTRATION_GUIDE.md`](resources/AGENT_ORCHESTRATION_GUIDE.md) | 5-stage pipeline contract, JSON schema, examples | When implementing an end-to-end edit pipeline |
| [`MODEL_ROUTING_GUIDE.md`](resources/MODEL_ROUTING_GUIDE.md) | Model routing for Stage 4 visual verification | When routing visual QA to appropriate models |
| [`SELF_REPORTING_ISSUES.md`](resources/SELF_REPORTING_ISSUES.md) | Agent self-reporting for issue diagnosis | When agents need to report problems independently |
| **Integration** | | |
| [`SERVER_MODE_GUIDE.md`](resources/SERVER_MODE_GUIDE.md) | JSON-RPC server: protocol, lifecycle, error codes | When using 4+ commands on the same document |
| [`PROGRAMMATIC_USAGE_GUIDE.md`](resources/PROGRAMMATIC_USAGE_GUIDE.md) | Subprocess helpers, V2 parsing, automation patterns | When building Python/Bash/JS integrations |
| [`ERROR_TROUBLESHOOTING.md`](resources/ERROR_TROUBLESHOOTING.md) | Comprehensive error troubleshooting | When encountering unfamiliar errors |

## 11. Learning Path for New Agents

1. **Start Simple**: Use `extract-text` and `search` to understand document structure
2. **Practice Safety**: Always use `--dry-run` for modifications
3. **Master Tables**: Table operations are the most complex but powerful
4. **Learn XPath**: Precise targeting requires XPath understanding
5. **Batch Operations**: Use `execute` for complex multi-step workflows (see [Execute Batch Guide](resources/EXECUTE_BATCH_GUIDE.md))
6. **Workspace System**: Use `to-workspace`/`from-workspace` for full-document rewrites (see Section D for when to choose workspace vs. direct commands)
7. **Validate & Repair**: Use `validate --pre-flight` before edits and `repair` to fix broken documents (see [Validate & Repair Guide](resources/VALIDATE_REPAIR_GUIDE.md))
8. **Audit & Undo**: Enable `--backup` and use `audit --list` / `undo` for safe rollbacks (see [Audit & Undo Guide](resources/AUDIT_UNDO_GUIDE.md))
9. **Server Mode**: Use `officellm serve` for 4+ commands on the same file (see [Server Mode Guide](resources/SERVER_MODE_GUIDE.md))
10. **Pagination**: Use `--limit`/`--offset`/`--page` for large documents (see [Pagination Guide](resources/PAGINATION_GUIDE.md))
11. **Read Resources**: Check the [Resource Guide Index](#resource-guide-index) for all 23 detailed guides

---

## 12. Support

- **Command Help**: `officellm <command> --help`
- **Crash Reports**: Check `error.details.crash_report_path` in error output
- **Resources**: `skills/resources/`

---

**Last Updated**: 2026-02-23
**Version**: 2.11
**Maintainer**: OfficeLLM Team
