# Best Practices: Table Formatting & Styling

This guide provides optimal patterns for Agents to format tables in Word documents using `officellm`.

## 1. Principles

1.  **Preview First**: Tables are complex structures. Always use `list-structure` or `get-table-data` first to confirm the `table-index` and row/column structure.
2.  **Atomic Operations**: When formatting multiple disparate cells, apply them sequentially.
3.  **Use Styles When Possible**: Prefer `apply-table-style` for uniform looks (e.g., "Grid Table 4 Accent 1") over manual cell-by-cell formatting. Use `format-table-cell` for **exceptions** (e.g., highlighting specific data).

## 2. Common Scenarios

### Scenario A: Highlighting a Header Row
**Goal**: Make the first row (header) bold with a grey background.

```bash
# table-index 0, row 1 (1-based), all columns
officellm format-table-cell \
    -i doc.docx \
    --table-index 0 \
    --row 1 \
    --col all \
    --bold \
    --background "E0E0E0"
```

### Scenario B: Conditional Formatting (Highlighting "Error" or "Review")
**Goal**: Find cells containing "Error" and highlight them in red.

**Agent Workflow**:
1.  **Extract Data**: `officellm get-table-data -i doc.docx --table-index 0`
2.  **Analyze (Internal)**: Parse JSON, find coordinates (e.g., Row 3, Col 2 contains "Error").
3.  **Apply Format**:
    ```bash
    officellm format-table-cell \
        -i doc.docx \
        --table-index 0 \
        --row 3 \
        --col 2 \
        --color "FF0000" \
        --bold
    ```

### Scenario C: Standardizing Table Appearance
**Goal**: Reset a messy table to a professional standard.

```bash
# Step 1: Apply a clean global style
officellm apply-table-style \
    -i doc.docx \
    --table-index 0 \
    --style "Grid Table 4 Accent 1"

# Step 2: Highlight specific key cells if needed
officellm format-table-cell ...
```

## 3. Formatting Reference

| Option | Value Format | Example |
| :--- | :--- | :--- |
| `--background` | Hex (no #) | `FF0000` (Red), `FFFF00` (Yellow) |
| `--color` | Hex (no #) | `0000FF` (Blue) |
| `--highlight` | Name | `yellow`, `green`, `cyan`, `magenta`, `darkBlue`, `red` |
| `--bold` | Flag | (Present = True) |
| `--italic` | Flag | (Present = True) |
| `--font-size` | Points (Int) | `12`, `14` |
| `--font` | ID/Name | `cn-fangsong`, `Arial` |

### Note on Color vs. Highlight
*   **`--background`**: Fills the entire cell (shading). Best for headers or status indicators.
*   **`--highlight`**: Highlights the *text* background only (like a highlighter pen). Best for specific words/phrases (currently applies to whole cell text in this command).
*   **`--color`**: Changes the font text color.

## 4. Font Selection
When setting fonts, especially for Chinese text, it is highly recommended to use **Font IDs** instead of free-text names. This ensures that the correct East Asian rendering properties are applied.

Refer to the [Font Management & CJK Rendering Guide](./FONT_MANAGEMENT_GUIDE.md) for a list of deterministic IDs and discovery instructions.
