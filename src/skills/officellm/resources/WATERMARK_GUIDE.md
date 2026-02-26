# Watermark Usage Guide for Agents

## Overview
This guide explains how to use the `add-watermark` command effectively to label documents.

## When to Use
- **Draft Labelling**: Use "DRAFT" or "PRELIMINARY" for unfinished documents.
- **Sensitivity**: Use "CONFIDENTIAL" or "INTERNAL ONLY" for sensitive materials.
- **Branding**: Use company names or copyright text.

## Command Structure
`officellm add-watermark -i <input> --text <text> [options]`

## Best Practices

1. **Color Selection**:
   - Default (`gray`) is best for readability.
   - Use `red` for urgent warnings (e.g., "URGENT").
   - Use lighter hex colors (e.g., `#E0E0E0`) for subtle branding.

2. **Opacity**:
   - Keep opacity low (0.1 - 0.3) for background images to avoid interfering with text reading.
   - Darker text needs lower opacity.
   - Default (0.3) is a balanced starting point.

3. **Combined Operations**:
   - Merge documents first, then apply watermark to ensure consistency across the final file.
   - Or apply watermark to a template before filling it.

## Examples

### Standard Draft
```bash
officellm add-watermark -i contract.docx --text "DRAFT"
```

### Urgent Warning
```bash
officellm add-watermark -i report.docx --text "CONFIDENTIAL" --color "red" --opacity 0.2
```

### Subtle Branding
```bash
officellm add-watermark -i paper.docx --text "Acme Corp" --color "#CCCCCC" --opacity 0.15
```

## Troubleshooting
- **Watermark not visible?** Check if headers are being overwritten by other tools or if the document has unusual section breaks.
- **Text unreadable?** Try lowering opacity or changing color to `gray`.
