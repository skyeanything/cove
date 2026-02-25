# Visual QA Guide

> **Context**: This guide covers **Stage 4 (Visual Verify)** of the [Agent Orchestration Contract](AGENT_ORCHESTRATION_GUIDE.md). For the full 5-stage pipeline, output schema, and decision rules, see the orchestration guide.

This guide describes how to verify that layout-sensitive document edits render correctly. It combines the existing `to-pdf` command with the `pdftoppm` rasterizer to enable page-by-page visual inspection, and defines a machine-readable `layout_risk` schema for reporting results.

## When to Use Visual QA

| Operation Category | Examples | Risk Level |
|--------------------|----------|------------|
| Table edits | `insert-table`, `insert-row`, `delete-row`, `merge-cells` | High |
| Image operations | `insert-image`, `insert-images`, `replace-image`, `set-image-wrap` | High |
| Equation insertion | `insert-equation` | Medium |
| Page/section breaks | `insert-break` (page, section-next-page) | High |
| Large text changes | `insert` with long Markdown, bulk `replace-text` | Medium |
| Header/footer changes | `set-header`, `set-footer`, `add-watermark` | Medium |
| Style modifications | `modify-style` (font-size changes), `apply-format` (pagination properties) | Low-Medium |

**Rule of thumb**: If the edit could change how content flows across pages, run visual QA.

## Prerequisites

### pdftoppm (from poppler-utils)

| Platform | Install Command |
|----------|----------------|
| macOS | `brew install poppler` |
| Debian/Ubuntu | `apt-get install poppler-utils` |
| Alpine | `apk add poppler-utils` |
| Windows | Download from [poppler releases](https://github.com/oschwartz10612/poppler-windows/releases) or use `choco install poppler` |

### LibreOffice

Required by the `to-pdf` command. See `officellm to-pdf --help` for details.

## Full Workflow

```bash
# 1. Convert the edited document to PDF
officellm to-pdf -i edited.docx -o edited.pdf

# 2. Create output directory and rasterize pages at 150 DPI
mkdir -p qa_pages
pdftoppm -png -r 150 edited.pdf qa_pages/page
# Produces: qa_pages/page-1.png, qa_pages/page-2.png, ...

# 3. Review each page image
# Inspect for the check items listed below.

# 4. Construct and report the layout_risk JSON (see schema below)
```

## Fallback Workflow (No pdftoppm)

When `pdftoppm` is not available, use structural validation instead:

```bash
# Verify element counts and ordering
officellm list-structure -i edited.docx
officellm extract-text -i edited.docx

# Check table integrity
officellm get-table-data -i edited.docx --table-index 0
```

In the fallback case, always report `layout_risk: true` because visual verification was not performed:

```json
{
  "layout_risk": true,
  "risk_reason": "visual_checks_unavailable",
  "visual_checks_executed": false,
  "pages_checked": 0,
  "issues_found": [],
  "missing_dependencies": ["pdftoppm"]
}
```

## Check Items

When reviewing rasterized page images, inspect for these issues:

1. **Pagination drift** — Did content shift to unexpected pages? Compare page count before and after edits.
2. **Line-wrap overflow** — Do any lines or paragraphs extend beyond the printable area or clip at margins?
3. **Table clipping** — Are table columns cut off at the right margin? Do rows split awkwardly across pages?
4. **Header/footer consistency** — Are headers and footers present on every page as expected? Do page numbers sequence correctly?
5. **Image/equation placement** — Are images and equations positioned where intended? Do they overlap text or extend beyond margins?

## `layout_risk` Schema

Agents construct this JSON object to report visual QA results.

```json
{
  "layout_risk": false,
  "risk_reason": null,
  "visual_checks_executed": true,
  "pages_checked": 5,
  "issues_found": [],
  "missing_dependencies": []
}
```

### Field Definitions

| Field | Type | Description |
|-------|------|-------------|
| `layout_risk` | `boolean` | `true` if any issue was detected OR visual checks could not run |
| `risk_reason` | `string\|null` | Short machine-readable reason (e.g., `"table_overflow_page_3"`, `"visual_checks_unavailable"`). `null` when no risk |
| `visual_checks_executed` | `boolean` | `true` if `pdftoppm` was available and pages were reviewed |
| `pages_checked` | `integer` | Number of pages visually inspected. `0` if checks did not run |
| `issues_found` | `string[]` | List of issue descriptions (empty when clean) |
| `missing_dependencies` | `string[]` | Missing tools (e.g., `["pdftoppm"]`). Empty when all available |

### Key Rules

- `layout_risk` MUST be `true` when **any** issue is found in `issues_found`
- `layout_risk` MUST be `true` when `visual_checks_executed` is `false`
- `visual_checks_executed: false` requires `missing_dependencies` to be non-empty
- `risk_reason` should use snake_case identifiers (e.g., `"pagination_drift"`, `"image_overlap_page_2"`)

## Examples

### Clean Result (No Issues)

```json
{
  "layout_risk": false,
  "risk_reason": null,
  "visual_checks_executed": true,
  "pages_checked": 3,
  "issues_found": [],
  "missing_dependencies": []
}
```

### Issue Detected

```json
{
  "layout_risk": true,
  "risk_reason": "table_overflow_page_3",
  "visual_checks_executed": true,
  "pages_checked": 5,
  "issues_found": [
    "Table on page 3 extends beyond right margin",
    "Page count increased from 5 to 6 after edit"
  ],
  "missing_dependencies": []
}
```

### Fallback (No pdftoppm)

```json
{
  "layout_risk": true,
  "risk_reason": "visual_checks_unavailable",
  "visual_checks_executed": false,
  "pages_checked": 0,
  "issues_found": [],
  "missing_dependencies": ["pdftoppm"]
}
```

## End-to-End Example

**Scenario**: Insert a table and an image into a report, then verify layout.

```bash
# 1. Insert a data table after "Results" heading
officellm insert-table -i report.docx \
  --data '[["Metric","Q1","Q2"],["Revenue","100K","150K"]]' \
  --after "Results" \
  -o report_edited.docx

# 2. Insert a chart image after the table
officellm insert-image -i report_edited.docx \
  --image chart.png \
  --wrap square \
  --after "Revenue" \
  -o report_edited.docx

# 3. Convert to PDF
officellm to-pdf -i report_edited.docx -o report_edited.pdf

# 4. Rasterize pages
mkdir -p qa_pages
pdftoppm -png -r 150 report_edited.pdf qa_pages/page

# 5. Review page images for check items:
#    - Table fits within margins?
#    - Image positioned correctly with text wrapping?
#    - No unexpected page breaks introduced?
#    - Headers/footers still consistent?

# 6. Report result (example: all clean)
# {
#   "layout_risk": false,
#   "risk_reason": null,
#   "visual_checks_executed": true,
#   "pages_checked": 4,
#   "issues_found": [],
#   "missing_dependencies": []
# }
```
