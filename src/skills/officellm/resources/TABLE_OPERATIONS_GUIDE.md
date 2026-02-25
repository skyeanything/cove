# Table Operations Guide

This guide details the complete set of table manipulations available in OfficeLLM.

## Command Overview

| Command | Description |
|---------|-------------|
| `insert-table` | Create tables from JSON data |
| `get-table-data` | Extract table data as JSON |
| `apply-table-style` | Apply usage of built-in or custom table styles |
| `format-table-cell` | cell-level formatting (bold, color, shading) |
| `set-table-cell` | Set/Overwrite cell content |
| `insert-row` | Add a new row |
| `delete-row` | Remove a row |
| `insert-column` | Add a new column |
| `delete-column` | Remove a column |
| `merge-cells` | Merge cells horizontally or vertically |
| `set-table-header` | Set Repeating Header Rows |
| `set-row-height` | Set row height with unit and rule control |
| `set-column-width` | Set column width with unit and grid definition update |

For basic commands, refer to the CLI help text (`officellm <command> --help`). This guide focuses on advanced operations.

## Merging Cells

You can merge cells horizontally (same row) or vertically (same column).

**Command**: `merge-cells`

**Parameters**:
- `--input`: Path to input DOCX.
- `--table-index`: Index of the table (0-based).
- `--range`: The range of cells to merge. Support two formats:
  - Coordinate format: `row,col:row,col` (1-based, inclusive). Example: `1,1:1,3` merges first 3 cells in row 1.
  - Excel format: `A1:C1` (letters for columns, numbers for rows).

**Examples**:

1. **Horizontal Merge**: Merge first row, columns A to C.
   ```bash
   officellm merge-cells -i input.docx --table-index 0 --range "A1:C1"
   ```

2. **Vertical Merge**: Merge first column, rows 1 to 3.
   ```bash
   officellm merge-cells -i input.docx --table-index 0 --range "1,1:3,1"
   ```

## Repeating Table Headers

For long tables that span multiple pages, you can set the header row(s) to repeat at the top of each page.

**Command**: `set-table-header`

**Parameters**:
- `--input`: Path to input DOCX.
- `--table-index`: Index of the table (0-based).
- `--rows`: Number of rows from the top to treat as headers. Set to `0` to disable repeating headers.

**Examples**:

1. **Set Top Row as Header**:
   ```bash
   officellm set-table-header -i input.docx --table-index 0 --rows 1
   ```

2. **Set Top 2 Rows as Header**:
   ```bash
   officellm set-table-header -i input.docx --table-index 0 --rows 2
   ```

3. **Disable Header Repetition**:
   ```bash
   officellm set-table-header -i input.docx --table-index 0 --rows 0
   ```

## Setting Row Height

`set-row-height` controls the height of a specific table row, with choice of measurement unit and height rule.

**Command**: `set-row-height`

**Parameters**:
- `--input` / `-i`: Path to input DOCX.
- `--output` / `-o`: Path to output DOCX.
- `--table-index`: Index of the table (0-based).
- `--row`: Row index (0-based).
- `--height`: Height value (numeric).
- `--unit`: Unit of measurement — `inches` (default), `cm`, or `emu`.
- `--rule`: Height rule — `atLeast` (default), `exact`, or `auto`.

**Height rules**:

| Rule | Behavior |
|------|----------|
| `exact` | Row is fixed at the specified height; content may be clipped |
| `atLeast` | Row is at least the specified height; grows if content requires it |
| `auto` | Row height is determined by content; removes any fixed constraint |

**Examples**:

1. **Set minimum height of first row to 1 cm**:
   ```bash
   officellm set-row-height -i doc.docx -o doc.docx --table-index 0 --row 0 --height 1 --unit cm --rule atLeast
   ```

2. **Fix second row height at exactly 0.5 inches** (content may be clipped):
   ```bash
   officellm set-row-height -i doc.docx -o doc.docx --table-index 0 --row 1 --height 0.5 --unit inches --rule exact
   ```

3. **Remove height constraint from third row** (let content determine height):
   ```bash
   officellm set-row-height -i doc.docx -o doc.docx --table-index 0 --row 2 --rule auto
   ```

Supports `--dry-run` to preview changes without writing.

## Setting Column Width

`set-column-width` sets the width of a specific table column. It updates both the table's grid definition and the individual cell widths in every row of that column.

**Command**: `set-column-width`

**Parameters**:
- `--input` / `-i`: Path to input DOCX.
- `--output` / `-o`: Path to output DOCX.
- `--table-index`: Index of the table (0-based).
- `--column`: Column index (0-based).
- `--width`: Width value (numeric).
- `--unit`: Unit of measurement — `inches` (default), `cm`, `emu`, or `pct` (percentage of table width).

**Units**:

| Unit | Notes |
|------|-------|
| `inches` | Default. Absolute width in inches. |
| `cm` | Absolute width in centimeters. |
| `emu` | English Metric Units (raw OpenXML unit). |
| `pct` | Percentage of total table width. Unique to `set-column-width`; not available on `set-row-height`. |

**Examples**:

1. **Set first column to 2 inches**:
   ```bash
   officellm set-column-width -i doc.docx -o doc.docx --table-index 0 --column 0 --width 2 --unit inches
   ```

2. **Set second column to 30% of table width**:
   ```bash
   officellm set-column-width -i doc.docx -o doc.docx --table-index 0 --column 1 --width 30 --unit pct
   ```

3. **Set third column width in centimeters**:
   ```bash
   officellm set-column-width -i doc.docx -o doc.docx --table-index 0 --column 2 --width 4.5 --unit cm
   ```

Supports `--dry-run` to preview changes without writing.
