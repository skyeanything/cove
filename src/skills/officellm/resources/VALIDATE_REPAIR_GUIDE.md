# Validate & Repair Guide

> **Relationship**: This guide expands on [SKILL.md Section 3](../SKILL.md) (Core Capabilities → Document Comparison & Revisions). For the full command index, see SKILL.md.

OfficeLLM provides document health checking (`validate`) and automatic repair (`repair`) to catch and fix structural issues before they cause downstream failures.

## Validate

### Basic Usage

```bash
# Quick structure check (default: basic level)
officellm validate --input doc.docx

# Full schema + enhanced checks
officellm validate --input doc.docx --level strict

# Pre-flight readiness assessment
officellm validate --input doc.docx --pre-flight

# Save report to file
officellm validate --input doc.docx --level strict --json report.json
```

### Parameters

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `--input` / `-i` | file path | required | Document to validate |
| `--level` / `-l` | `basic` or `strict` | `basic` | Validation strictness |
| `--pre-flight` | flag | — | Enables readiness scoring (forces strict level) |
| `--json` | file path | — | Output validation report as JSON |

### Validation Levels

#### Basic (default)

| Check | Description |
|-------|-------------|
| ZIP integrity | `[Content_Types].xml` exists and is readable |
| Required parts | MainDocumentPart and Body element present |
| Content statistics | Paragraph, table, and image counts |
| Duplicate paragraph IDs | Detects duplicate `w14:paraId` values |
| Schema validation | OpenXML SDK schema compliance (first 20 errors) |

#### Strict

All basic checks plus:

| Check | Description |
|-------|-------------|
| Orphaned image references | Blip elements pointing to non-existent image parts |
| Broken bookmarks | Unmatched BookmarkStart/BookmarkEnd pairs |
| Numbering inconsistencies | Paragraphs referencing non-existent numbering definitions |
| Orphaned styles | Defined styles never referenced in document (excludes built-in) |
| Table structure | Rows with mismatched cell counts |
| Missing optional parts | Absence of StyleDefinitionsPart, FontTablePart, ThemePart |
| Encoding issues | Replacement characters (U+FFFD) or null bytes indicating corruption |
| Unused embedded resources | Image parts with no Blip references |

### Pre-Flight Mode

`--pre-flight` automatically sets `--level strict` and adds a readiness score:

```json
{
  "pre_flight": {
    "readiness_score": 85,
    "readiness_level": "ready",
    "recommendations": []
  }
}
```

#### Scoring

| Deduction | Amount |
|-----------|--------|
| Per error | -15 points |
| Per warning | -5 points |
| Per info | -1 point |

#### Readiness Levels

| Level | Score | Meaning |
|-------|-------|---------|
| `ready` | >= 80 | Safe for processing |
| `caution` | 50–79 | Has issues but manageable |
| `not-ready` | < 50 | Requires repairs first |

When issues are detected, `recommendations` includes actionable suggestions (e.g., "Run 'repair' to fix orphaned image references").

### Issue Severity

| Severity | Meaning | Blocks Processing? |
|----------|---------|-------------------|
| `error` | Structural problem that may cause failures | Yes |
| `warning` | Non-critical issue, may affect quality | No |
| `info` | Informational, no action needed | No |

### Exit Codes

| Code | Meaning |
|------|---------|
| 0 | Valid (no errors, may have warnings/info) |
| 1 | Invalid (errors detected) |

## Repair

### Basic Usage

```bash
# Preview repairs without modifying
officellm repair --input broken.docx --dry-run

# Repair and save to new file
officellm repair --input broken.docx -o fixed.docx

# Repair in-place
officellm repair --input broken.docx
```

### Parameters

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `--input` / `-i` | file path | required | Document to repair |
| `--output` / `-o` | file path | overwrites input | Output path for repaired file |
| `--dry-run` | flag | — | Preview repairs without writing |

### Auto-Fixes

| Fix | Code | Severity | Description |
|-----|------|----------|-------------|
| Orphaned image references | `FIX_ORPHANED_IMAGE_REF` | error | Removes Drawing elements with broken image relationship IDs |
| Broken bookmark ends | `FIX_ORPHANED_BOOKMARK_END` | warning | Removes BookmarkEnd elements without matching BookmarkStart |
| Broken bookmark starts | `FIX_ORPHANED_BOOKMARK_START` | warning | Removes BookmarkStart elements without matching BookmarkEnd |
| Invalid numbering | `FIX_INVALID_NUM_REFERENCE` | error | Removes NumberingProperties referencing non-existent definitions |
| Duplicate paragraph IDs | `FIX_DUPLICATE_PARA_ID` | warning | Regenerates duplicate `w14:paraId` values with unique IDs |
| Unused embedded resources | `FIX_UNUSED_RESOURCE` | info | Deletes image parts not referenced by any Blip element |

### Output

```json
{
  "status": "success",
  "data": {
    "applied": true,
    "actions": [
      {
        "code": "FIX_ORPHANED_IMAGE_REF",
        "description": "Removed orphaned image reference: rId15",
        "severity": "error"
      }
    ]
  },
  "metrics": {
    "issues_found": 3,
    "issues_fixed": 3,
    "processing_time_ms": 120
  }
}
```

In `--dry-run` mode, `applied` is `false` and `issues_fixed` is 0, but `issues_found` and `actions` still report what would be fixed.

## `validate` vs `sync validate`

| Aspect | `validate` | `sync validate` |
|--------|-----------|-----------------|
| **Purpose** | General document health | Post-sync integrity |
| **Basic checks** | ZIP + required parts + duplicate paraIds + schema | ZIP + required parts + content stats |
| **Strict checks** | 8 enhanced checks (images, bookmarks, numbering, etc.) | Duplicate paraIds + sync conflict markers + schema |
| **Pre-flight** | Yes (readiness score + recommendations) | No |
| **Conflict markers** | Not checked | Detects `urn:officellm:sync` attributes |
| **Repairable flag** | Yes (links issues to `repair`) | No |
| **Exit code 5** | Not used (uses 0/1) | Yes (validation failure) |

**When to use which**:
- After `sync merge3` / `sync apply-patch` → `sync validate`
- Before/after direct edits → `validate`
- Pre-edit assessment → `validate --pre-flight`

## Pre-Edit Validation Workflow

```bash
# 1. Check document health before editing
officellm validate --input doc.docx --pre-flight

# 2. If not-ready, repair first
officellm repair --input doc.docx --dry-run    # preview
officellm repair --input doc.docx -o doc.docx  # apply

# 3. Re-validate
officellm validate --input doc.docx --pre-flight

# 4. Proceed with edits
officellm replace-text -i doc.docx --find "old" --replace "new" -o doc.docx

# 5. Post-edit validation
officellm validate --input doc.docx --level strict
```

## Integration with the 5-Stage Pipeline

In the [Agent Orchestration Contract](AGENT_ORCHESTRATION_GUIDE.md):

| Stage | Validate/Repair Role |
|-------|---------------------|
| **Stage 1 (Inspect)** | `validate --pre-flight` to assess document readiness |
| **Stage 2 (Edit)** | `repair` if pre-flight score is low |
| **Stage 3 (Verify)** | `validate --level strict` to confirm structural integrity |
| **Stage 5 (Decide)** | Include validation result in decision matrix |

## Troubleshooting

| Symptom | Cause | Fix |
|---------|-------|-----|
| Low readiness score | Multiple structural issues | Run `repair` first, then re-validate |
| Schema errors after edit | Edit introduced invalid XML | Check the specific operation that caused the issue |
| Orphaned images after delete | Image was removed but Drawing element remains | `repair` fixes this automatically |
| Duplicate paraIds | Copy-paste or merge introduced duplicates | `repair` regenerates unique IDs |
| `sync validate` fails (exit 5) | Unresolved conflict markers | Run `sync resolve` to handle remaining conflicts |
