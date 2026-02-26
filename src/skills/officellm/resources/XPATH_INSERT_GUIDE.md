# Precise XPath Insertion Guide

This guide explains how to use the **XPath Insertion** feature (`officellm insert --xpath`) to precisely place content within a Word document, ensuring correct structure and formatting.

## Why use XPath Insertion?

Standard text finding (`--find`) works well for simple unique text strings, but it can be unreliable if:
1. The target text appears multiple times.
2. You need to target a specific structure (e.g., "The 3rd paragraph", "The empty paragraph after the table").
3. You want to replace a specific element precisely instead of relying on fuzzy text matching.

XPath provides an exact address for every element in the document structure.

## The Two-Step Workflow

For agents, the most reliable way to modify a document is a two-step process:

### Step 1: Locate the Target

Use the `search` command to find potential insertion points. This returns the XPath for each match.

```bash
officellm search -i input.docx --find "Executive Summary"
```

**Output:**
```json
{
  "matches": [
    {
      "text": "Executive Summary",
      "xpath": "/w:document/w:body/w:p[4]",
      "index": 0
    }
  ]
}
```

Now you know exactly where "Executive Summary" is (`/w:document/w:body/w:p[4]`).

### Step 2: Insert or Replace

Use the `insert` command with the `--xpath` argument.

#### Scenario A: Insert content after the target

```bash
officellm insert -i input.docx \
  --xpath "/w:document/w:body/w:p[4]" \
  --position after \
  --markdown "## Overview\n\nThis is the *new* content."
```

#### Scenario B: Replace the target element

If you want to completely replace the target paragraph with new content (potentially multiple paragraphs):

```bash
officellm insert -i input.docx \
  --xpath "/w:document/w:body/w:p[4]" \
  --position replace \
  --markdown "## Executive Summary (Revised)\n\nThe project is proceeding as planned."
```

## Supported Content Types

You can insert various formats:

- **Markdown** (`--markdown`): Best for structured text with headers, lists, and emphasis.
- **HTML** (`--html`): Good for complex structures or pre-formatted web content.
- **Text** (`--text`): Simple plain text insertion.

## Block Structure Preservation

When inserting Markdown or HTML that contains **multiple paragraphs** (e.g., a Header followed by a Paragraph and a List), OfficeLLM automatically handles the structural changes.

- **Standard Behavior**: If you insert multiple paragraphs into/after a single paragraph, OfficeLLM will **split** the document structure correctly so that each new paragraph is a distinct Word paragraph.
- **No Inlining**: Unlike simple text replacement which might merge new text into an existing `w:p`, the `insert` command respects block boundaries.

## Common XPaths

While `search` is the best way to get XPaths, common patterns include:

| Target | XPath Pattern |
|--------|---------------|
| 1st Paragraph | `/w:document/w:body/w:p[1]` |
| Last Paragraph | `/w:document/w:body/w:p[last()]` |
| 1st Table | `/w:document/w:body/w:tbl[1]` |
| Paragraph inside Table | `/w:document/w:body/w:tbl[1]/w:tr[1]/w:tc[1]/w:p[1]` |

## Troubleshooting

- **XPath not found**: Ensure the document hasn't changed structure since you ran `search`. If you performed other edits, run `search` again to get fresh XPaths.
- **Invalid XPath**: Ensure you are using the correct namespaces (mostly `w:` for Word content). The XPaths returned by `search` are always valid.
