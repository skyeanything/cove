# Template System Guide

This guide covers the placeholder-based template system for filling Word document templates with data. The system supports plain text replacement, rich text (Markdown) rendering, batch operations, and legacy MERGEFIELD compatibility.

## 1. Commands Overview

| Command | Purpose | Key Example |
|---------|---------|-------------|
| `list-placeholders` | Scan document for placeholders | `officellm list-placeholders -i template.docx` |
| `fill-template` | Fill placeholders with data | `officellm fill-template -i template.docx --data data.json` |
| `execute` (FillPlaceholder) | Batch fill via instruction JSON | `officellm execute -f instructions.json -i template.docx` |
| `list-fields` | Scan for MERGEFIELD fields | `officellm list-fields -i template.docx` |

## 2. Placeholder Conventions

**Default delimiters**: `【【key】】` (Chinese corner brackets U+3010/U+3011)

Override with `--prefix` / `--suffix`:

| Format | Prefix | Suffix | Example |
|--------|--------|--------|---------|
| Default | `【【` | `】】` | `【【CLIENT_NAME】】` |
| Double curly | `{{` | `}}` | `{{CLIENT_NAME}}` |
| Single curly | `{` | `}` | `{CLIENT_NAME}` |
| Angle | `<<` | `>>` | `<<CLIENT_NAME>>` |

**Naming**: Placeholder keys are case-sensitive. Use `UPPER_SNAKE_CASE` for clarity.

## 3. Workflow: Discover -> Fill -> Verify

### Step 1: Discover placeholders

```bash
officellm list-placeholders -i template.docx
# With custom delimiters:
officellm list-placeholders -i template.docx --prefix "{{" --suffix "}}"
```

Output: list of placeholder keys with occurrence counts and paragraph indices.

### Step 2: Fill placeholders

```bash
# From JSON file
officellm fill-template -i template.docx --data data.json -o filled.docx

# From inline JSON
officellm fill-template -i template.docx \
  --data-inline '{"CLIENT_NAME": "Acme Corp", "DATE": "2026-02-21"}' \
  -o filled.docx

# With custom delimiters
officellm fill-template -i template.docx --data data.json \
  --prefix "{{" --suffix "}}" -o filled.docx
```

**Data format**: `Dictionary<string, string>` — keys match placeholder names (without delimiters), values are replacement text.

```json
{
  "CLIENT_NAME": "Acme Corp",
  "DATE": "2026-02-21",
  "AMOUNT": "$50,000"
}
```

### Step 3: Verify output

```bash
# Check text content
officellm extract-text -i filled.docx

# Search for remaining placeholders (should return empty)
officellm list-placeholders -i filled.docx
```

## 4. Rich Text Mode

Enable `--rich` to render Markdown values as formatted OpenXML content:

```bash
officellm fill-template -i template.docx --data data.json --rich -o filled.docx
```

**How it works**:
- Each value is checked: plain text is inserted as-is, Markdown is rendered as formatted content
- Markdown detection is automatic (uses Markdig parser)
- Block structure is preserved (headings, lists, paragraphs remain separate elements)

**Supported Markdown**:
- **Bold** (`**text**`), *italic* (`*text*`), inline code
- Headings (`# H1`, `## H2`, etc.)
- Bulleted and numbered lists
- Paragraphs and line breaks

**Example data.json**:
```json
{
  "TITLE": "Project Report",
  "DESCRIPTION": "## Overview\n\nThis project includes:\n\n- **Phase 1**: Research\n- **Phase 2**: Development\n- **Phase 3**: Testing"
}
```

`TITLE` is detected as plain text and inserted directly. `DESCRIPTION` contains Markdown and is rendered with headings, bold text, and bullet list formatting.

## 5. Batch Operations (execute)

Use `FillPlaceholder` operations in an instruction batch for multi-placeholder filling in a single pass:

```json
{
  "placeholder_prefix": "{{",
  "placeholder_suffix": "}}",
  "ops": [
    {"op": "FillPlaceholder", "target": "CLIENT_NAME", "payload": "Acme Corp"},
    {"op": "FillPlaceholder", "target": "DATE", "payload": "2026-02-21"},
    {"op": "FillPlaceholder", "target": "AMOUNT", "payload": "$50,000"},
    {"op": "FillPlaceholder", "target": "NOTES", "payload": "## Key Terms\n\n- Net 30 payment\n- **No refunds**"}
  ]
}
```

```bash
officellm execute -f instructions.json -i template.docx -o filled.docx
```

**Batch-level settings**:
- `placeholder_prefix` / `placeholder_suffix`: override delimiters for all ops (default: `【【` / `】】`)
- `dry_run`: preview without modifying

**Per-op fields**:
- `target`: placeholder key (without delimiters) — **required**
- `payload`: replacement value (plain text or Markdown)
- `clean_placeholder`: remove trailing underlined whitespace runs

**Combining with other ops**: FillPlaceholder can be mixed with `ApplyStyle`, `ApplyStyleRange`, `ReplaceText`, and other operations in the same batch.

## 6. Placeholder Cleaning

Chinese templates often use underlined whitespace runs (`____`) as visual fill-in indicators next to placeholders. After replacement, these trailing runs look wrong.

**`--clean-placeholder`** removes trailing underlined whitespace runs from the paragraph after replacement.

Available in:
- `replace-text --clean-placeholder`
- `execute` with `"clean_placeholder": true` on individual ops

```bash
# Single replacement with cleaning
officellm replace-text -i template.docx \
  --find "【【NAME】】" --replace "John Smith" \
  --clean-placeholder

# Batch with cleaning
cat > instructions.json << 'EOF'
{
  "ops": [
    {"op": "ReplaceText", "target": "【【NAME】】", "payload": "John Smith", "clean_placeholder": true}
  ]
}
EOF
officellm execute -f instructions.json -i template.docx -o filled.docx
```

## 7. Legacy MERGEFIELD Mode

For documents using Word's built-in MERGEFIELD fields instead of text placeholders:

```bash
# Discover MERGEFIELDs
officellm list-fields -i template.docx

# Fill using mergefield mode
officellm fill-template -i template.docx --data data.json --mode mergefield -o filled.docx
```

**When to use**: Only for documents that contain actual MERGEFIELD field codes (inserted via Word's mail merge feature). For new templates, prefer the placeholder-based approach — it is simpler, more portable, and supports rich text rendering.

## 8. Troubleshooting

| Problem | Cause | Solution |
|---------|-------|----------|
| Placeholder not found | Placeholder text split across multiple XML runs | Run `officellm simplify-markup -i template.docx -o template.docx` to merge adjacent runs, then retry |
| `matched_count: 0` | Delimiter mismatch or hidden characters | Verify delimiters match with `list-placeholders`; check for invisible Unicode characters |
| Rich mode output incorrect | Invalid Markdown syntax | Test Markdown rendering separately; ensure proper line breaks (`\n`) in JSON strings |
| Partial fill | Some keys missing from data | Compare `list-placeholders` output with your data keys |
| Trailing underlines remain | Template uses underlined whitespace indicators | Use `--clean-placeholder` flag or `clean_placeholder: true` in batch ops |
