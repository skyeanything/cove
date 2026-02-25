# Agent Orchestration Guide

This guide defines the **5-stage agent-first pipeline** for editing DOCX documents with OfficeLLM. Every document edit session follows the same deterministic sequence: **inspect, edit, structural verify, visual verify, decide**. The pipeline produces a machine-readable [orchestration result](#output-contract) so that callers can programmatically evaluate outcomes.

## Relationship to Other Resources

| Resource | Scope |
|----------|-------|
| [`SKILL.md`](../SKILL.md) | Full command reference and quick-start workflows |
| [`VISUAL_QA_GUIDE.md`](VISUAL_QA_GUIDE.md) | Deep-dive on Stage 4 (visual verify): rasterization, check items, `layout_risk` schema |
| **This guide** | End-to-end pipeline contract, output schema, decision rules, fallback behaviour |

The `layout_risk` object from VISUAL_QA_GUIDE.md is a strict subset of the orchestration result schema defined here.

---

## Pipeline Overview

```
Stage 1        Stage 2       Stage 3              Stage 4            Stage 5
INSPECT   -->  EDIT    -->  STRUCTURAL VERIFY --> VISUAL VERIFY --> DECIDE
                                                   (optional)
```

| # | Stage | Goal | Key Commands |
|---|-------|------|--------------|
| 1 | **Inspect** | Understand current document state | `extract-text`, `list-structure`, `search` |
| 2 | **Edit** | Apply requested changes | `--dry-run` first, then `execute` / individual commands |
| 3 | **Structural Verify** | Confirm edits produced valid structure | `list-structure`, `validate`, `extract-text` |
| 4 | **Visual Verify** | Confirm rendered layout is correct | `render-pages`, visual page inspection |
| 5 | **Decide** | Emit orchestration result | Decision matrix below |

---

## Stage 1 — Inspect

**Goal**: Build a baseline understanding of the document before making any changes.

```bash
# 1a. Extract full text for content overview
officellm extract-text -i input.docx -o baseline_text.json

# 1b. Record structural element count (headings, tables, images)
officellm list-structure -i input.docx -o baseline_structure.json

# 1c. Search for specific targets relevant to the edit
officellm search -i input.docx --find "target text" --context-length 200
```

**Record**: `element_count_before` from `list-structure` output (count of structural elements). This value goes into `structural_checks.element_count_before` in the final result.

---

## Stage 2 — Edit

**Goal**: Apply the requested changes safely.

```bash
# 2a. ALWAYS preview first
officellm replace-text -i input.docx --find "old" --replace "new" --dry-run

# 2b. Review dry-run output, then execute
officellm replace-text -i input.docx --find "old" --replace "new" -o output.docx

# 2c. For multi-step edits, use batch execution
officellm execute -f instructions.json -i input.docx -o output.docx
```

**Rules**:
- Always run `--dry-run` before any destructive operation.
- For multi-step edits, prefer `execute` with a JSON instruction file for atomicity.
- Use separate output file (`-o output.docx`) to preserve the original.

---

## Stage 3 — Structural Verify

**Goal**: Confirm the edited document has valid structure and expected element counts.

```bash
# 3a. Re-read structure
officellm list-structure -i output.docx -o post_structure.json

# 3b. Run schema validation
officellm validate --input output.docx

# 3c. Spot-check edited content
officellm extract-text -i output.docx -o post_text.json
```

**Record**:
- `element_count_after` from `list-structure` (compare with `element_count_before`)
- `validation_passed` from `validate` exit code (0 = passed, non-zero = failed)

**Check**: If `element_count_after` differs from `element_count_before` by more than expected, investigate. Unexpected changes may indicate content corruption.

---

## Stage 4 — Visual Verify

**Goal**: Render the document to page images and inspect layout visually.

This stage is **optional** — it runs only when external dependencies (`pdftoppm`, `libreoffice`) are available. See [Fallback Behaviour](#fallback-behaviour) for what happens when they are not.

```bash
# 4a. Render pages to images
officellm render-pages -i output.docx

# 4b. Review each page image for the check items below
```

**Check items** (from [VISUAL_QA_GUIDE.md](VISUAL_QA_GUIDE.md)):

1. **Pagination drift** — Did content shift to unexpected pages?
2. **Line-wrap overflow** — Do lines extend beyond the printable area?
3. **Table clipping** — Are table columns cut off at margins?
4. **Header/footer consistency** — Are headers/footers present and sequenced correctly?
5. **Image/equation placement** — Are images and equations positioned correctly?

For each issue found, create an issue object (see [Issue Types](#issue-types)).

For model selection strategies in this stage, see [MODEL_ROUTING_GUIDE.md](MODEL_ROUTING_GUIDE.md).

---

## Stage 5 — Decide

**Goal**: Evaluate all findings and emit the orchestration result.

### Decision Matrix

| Condition | Decision | `layout_risk` |
|-----------|----------|---------------|
| No issues found, visual checks passed | `pass` | `false` |
| No issues found, visual checks skipped (missing deps) | `pass` | `true` |
| Errors found, retry count < 3 | `fix` | `true` |
| Errors found, retry count >= 3 | `abort` | `true` |
| `validate` failed (structural corruption) | `abort` | `true` |

**Fix loop**: When `decision = "fix"`, return to Stage 2 with a corrective edit. The retry counter increments each time. After 3 failed attempts, escalate to `abort`.

**Abort**: The document is in an unrecoverable state. Return the result with `decision = "abort"` and all accumulated issues. Do not attempt further edits.

---

## Output Contract

The pipeline produces a single JSON object conforming to the schema at [`schemas/orchestration-result.schema.json`](schemas/orchestration-result.schema.json).

### Top-Level Fields

| Field | Type | Description |
|-------|------|-------------|
| `schema_version` | `"1.0"` | Always `"1.0"` for this version of the contract |
| `stages_completed` | `string[]` | Pipeline stages that executed (enum: inspect, edit, structural_verify, visual_verify, decide) |
| `decision` | `string` | Final outcome: `pass`, `fix`, or `abort` |
| `layout_risk` | `boolean` | `true` if any issue exists OR visual checks could not run |
| `risk_reason` | `string\|null` | Machine-readable snake_case reason; `null` when no risk |
| `visual_checks_executed` | `boolean` | `true` if `render-pages` ran and pages were inspected |
| `pages_checked` | `integer` | Number of pages visually inspected (0 if skipped) |
| `missing_dependencies` | `string[]` | Unavailable external tools (e.g. `["pdftoppm"]`) |
| `issues` | `issue[]` | All issues detected during the pipeline |

### Optional Fields

| Field | Type | Description |
|-------|------|-------------|
| `structural_checks` | `object` | `element_count_before`, `element_count_after`, `validation_passed` |
| `input_file` | `string` | Input document path |
| `output_file` | `string` | Output document path |

### Issue Types

Each issue object has these fields:

| Field | Type | Values |
|-------|------|--------|
| `severity` | enum | `error`, `warning`, `info` |
| `page` | `integer\|null` | Page number (null if not page-specific) |
| `type` | enum | See table below |
| `evidence` | `string` | Human-readable description |

**Issue type enum**:

| Type | Detected In | Typical Trigger |
|------|-------------|-----------------|
| `pagination_drift` | Stage 4 | Page count changed unexpectedly |
| `table_overflow` | Stage 4 | Table extends beyond margins |
| `image_overlap` | Stage 4 | Image overlaps text or another image |
| `image_misplacement` | Stage 4 | Image not at intended position |
| `header_footer_inconsistency` | Stage 4 | Missing or mis-sequenced header/footer |
| `line_wrap_overflow` | Stage 4 | Text exceeds printable area |
| `equation_clipping` | Stage 4 | Equation partially hidden |
| `missing_content` | Stage 3 | Expected content not found after edit |
| `structural_mismatch` | Stage 3 | Element count diverged unexpectedly |
| `other` | Any | Uncategorised issue |

### Key Rules

- `layout_risk` MUST be `true` when `issues` contains any item with `severity = "error"`.
- `layout_risk` MUST be `true` when `visual_checks_executed` is `false`.
- `visual_checks_executed: false` requires `missing_dependencies` to be non-empty.
- When `decision = "pass"`, there MUST be zero `error`-severity issues.
- When `decision = "fix"` or `"abort"`, there MUST be at least one `error` or `warning` issue (or `visual_checks_executed` is `false` for `"pass"` with `layout_risk: true`).

---

## Fallback Behaviour

When `pdftoppm` or `libreoffice` is not installed, Stage 4 (visual verify) is skipped.

**What happens**:
1. `stages_completed` omits `"visual_verify"`.
2. `visual_checks_executed` = `false`, `pages_checked` = `0`.
3. `missing_dependencies` lists the missing tool(s).
4. `layout_risk` = `true` (visual correctness is unconfirmed).
5. `risk_reason` = `"visual_checks_unavailable"`.

**The pipeline can still produce `decision = "pass"`** if structural checks pass and no errors are found. However, `layout_risk` remains `true` to signal that visual correctness is not guaranteed.

---

## Complete Examples

### Example 1: Clean Pass

**Scenario**: Replace "Q3" with "Q4" in a 3-page report. All stages pass.

```bash
# Stage 1 — Inspect
officellm extract-text -i report.docx
officellm list-structure -i report.docx       # element_count_before = 42

# Stage 2 — Edit
officellm replace-text -i report.docx --find "Q3" --replace "Q4" --dry-run
officellm replace-text -i report.docx --find "Q3" --replace "Q4" -o report_edited.docx

# Stage 3 — Structural Verify
officellm list-structure -i report_edited.docx  # element_count_after = 42 (no change expected)
officellm validate --input report_edited.docx   # exit code 0

# Stage 4 — Visual Verify
officellm render-pages -i report_edited.docx    # 3 pages rendered, no issues found

# Stage 5 — Decide
```

**Result**: [`examples/pass-clean.json`](schemas/examples/pass-clean.json)

### Example 2: Fix Loop (Table Overflow)

**Scenario**: Insert a wide data table into a quarterly report. Visual check detects overflow.

```bash
# Stage 1 — Inspect
officellm list-structure -i quarterly_report.docx  # element_count_before = 38

# Stage 2 — Edit (attempt 1)
officellm insert-table -i quarterly_report.docx \
  --data '[["Region","Q1","Q2","Q3","Q4","Total","YoY %"],["North","100","120","130","150","500","12%"]]' \
  --after "Results" -o quarterly_report_edited.docx

# Stage 3 — Structural Verify
officellm list-structure -i quarterly_report_edited.docx  # element_count_after = 45
officellm validate --input quarterly_report_edited.docx    # exit code 0

# Stage 4 — Visual Verify
officellm render-pages -i quarterly_report_edited.docx
# Issue detected: table on page 3 extends beyond right margin

# Stage 5 — Decide → decision = "fix"
```

**Result**: [`examples/fix-table-overflow.json`](schemas/examples/fix-table-overflow.json)

The agent would then return to Stage 2 with a corrective edit (e.g. reducing column widths or splitting the table), re-run Stages 3-5, and emit a new result.

### Example 3: Fallback (No Visual QA)

**Scenario**: Edit a memo on a system without `pdftoppm`. Structural checks pass.

```bash
# Stage 1 — Inspect
officellm list-structure -i memo.docx  # element_count_before = 20

# Stage 2 — Edit
officellm insert -i memo.docx --markdown "## Action Items\n\n- Review budget\n- Schedule meeting" \
  --position append -o memo_edited.docx

# Stage 3 — Structural Verify
officellm list-structure -i memo_edited.docx  # element_count_after = 22
officellm validate --input memo_edited.docx    # exit code 0

# Stage 4 — Visual Verify → SKIPPED (pdftoppm not found)

# Stage 5 — Decide → decision = "pass" (but layout_risk = true)
```

**Result**: [`examples/fallback-no-visual.json`](schemas/examples/fallback-no-visual.json)

---

## Backward Compatibility

The `layout_risk` schema defined in [VISUAL_QA_GUIDE.md](VISUAL_QA_GUIDE.md) is a strict subset of this orchestration result. Agents that already produce `layout_risk` JSON can migrate by:

1. Wrapping the existing fields into the orchestration result envelope.
2. Adding `schema_version`, `stages_completed`, `decision`, and `issues`.
3. Converting `issues_found` (string array) to `issues` (object array with severity/page/type/evidence).

The `issues_found` field from the visual QA schema maps to the `evidence` field in each issue object.
