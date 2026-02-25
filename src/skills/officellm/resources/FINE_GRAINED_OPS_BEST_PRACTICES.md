# OfficeLLM Fine-Grained Operations Best Practices Guide

This guide describes how Developers and Prompt Engineers can better leverage OfficeLLM to design fine-grained, highly reliable document manipulation workflows for Agents.

## Core Principles

When letting an LLM manipulate documents, the biggest challenges are **Hallucination** and **Imprecise Targeting**. To achieve fine-grained operations, we follow these principles:

1.  **Locate then Act**: Do not blind guess and replace. First, use `search` to get precise coordinates (XPath/ID).
2.  **Atomic Execution**: Break down complex tasks into single-step atomic operations, where each step can be verified.
3.  **Dry Run Mechanism**: Before any modification operation, it is strongly recommended to perform a Dry Run to check the scope of impact.

---

## Best Practice Workflows

### 1. Abandon Fuzzy Matching, Embrace XPath

Traditional "Find & Replace" is often inadequate when facing structured documents (e.g., modifying "Date" only in a table, not in the body text).

**❌ Wrong Approach (LLM guesses context):**
"Change all 2023 in the table to 2024" -> Directly running `replace-text --find "2023" --replace "2024"`.
*Risk: May accidentally change years in the body text, headers, or footers.*

**✅ Recommended Workflow (Precision Strike based on Coordinates):**

1.  **Scan Structure**:
    ```bash
    officellm list-structure -i doc.docx
    # Get table index, assume target table is Index 0
    ```

2.  **Precise Location**:
    ```bash
    officellm search -i doc.docx --find "2023" --xpath "//w:tbl[1]"
    # Search within the first table to get specific XPath
    ```

3.  **Targeted Replacement**:
    ```bash
    officellm replace-text -i doc.docx \
      --target-xpath "/w:document/w:body/w:tbl[1]/w:tr[2]/w:tc[3]/w:p[1]/w:r[1]/w:t[1]" \
      --replace "2024"
    ```

### 2. Coordinate System Operations for Complex Tables

For table data filling or formatting, **do not** try to "fix" the table using text replacement. Use row and column coordinates directly.

**Scenario**: Highlight the cell at the second row and third column in red.

**✅ Recommended Approach**:
```bash
officellm format-table-cell -i doc.docx \
  --table-index 0 \
  --row 2 \
  --col 3 \
  --background "FF0000"
```

**Tip**:
If the LLM is unsure which row is the target, first have the LLM call `get-table-data` to read the data, analyze the `(Row, Col)` coordinates in memory, and then issue the command.

### 3. Markdown is the Best Choice for Structured Insertion

When you need to insert a whole segment of content with formatting (titles, lists, bold text), do not use plain text concatenation.

**✅ Recommended Approach**:
```bash
officellm insert -i doc.docx \
  --position append \
  --markdown "## Summary\n\nThe **core** conclusions of this meeting are as follows:\n- Efficiency increased by 20%\n- Costs reduced by 15%"
```
OfficeLLM will automatically render Markdown into native Word styles.

### 4. Atomicity and Order of Batch Operations

When a series of related operations need to be performed (e.g., translating an entire document), using the `execute` command with a JSON instruction set is faster and safer than calling the CLI multiple times.

**✅ Recommended Approach**:
Construct `batch_ops.json`:
```json
{
  "version": "1.0",
  "ops": [
    { "op": "ReplaceText", "target": "Old", "payload": "New" },
    { "op": "Format", "target": "New", "color": "Blue" }
  ]
}
```
Run: `officellm execute -f batch_ops.json -i doc.docx`

**⚠️ Note Index Shifts**:
If performing consecutive delete operations (Delete Row), subsequent row numbers will change.
*   **Strategy A**: Delete from back to front (Delete Row 5, then Delete Row 3).
*   **Strategy B**: Use `execute` batch command, which typically handles atomicity internally (depends on implementation, testing suggested).
*   **Strategy C**: Re-read the structure after each operation (slowest but most reliable).

### 5. Separation of Styles and Formatting

*   **Global Unity**: Use `apply-style` or `apply-table-style` (e.g., "Grid Table 4") to establish the tone.
*   **Local Emphasis**: Use `apply-format` or `format-table-cell` for "fine-tuning" (e.g., highlighting negative numbers in red).

Do not try to build the overall style using local formatting.

---

## Debugging and Troubleshooting

When the LLM reports "Target not found" or "Operation didn't take effect":

1.  **Check Search Results**: Has the target's XPath changed due to previous edits?
2.  **Use Dry Run**: Check if the `changes` array in the JSON output of `replace-text --dry-run` is empty.
3.  **Confirm Scope**: Are you operating in this `context` (e.g., Header/Footer)? Default search is usually in the Body.
