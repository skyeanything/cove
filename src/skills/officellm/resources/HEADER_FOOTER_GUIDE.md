# Header, Footer, and Page Numbering Guide

This guide explains how to manage headers, footers, and page numbers using OfficeLLM, with a focus on academic paper requirements.

## 📋 Commands Overview

| Command | Purpose |
|---------|---------|
| `set-header` | Set header content (text or dynamic fields) |
| `set-footer` | Set footer content or enable page numbering |
| `list-headers` | View existing headers by section |
| `list-footers` | View existing footers by section |
| `remove-header` | Delete header from section or document |
| `remove-footer` | Delete footer from section or document |

---

## 🏗️ Section Support

OfficeLLM supports both document-wide and section-specific headers/footers.

- **Apply to all sections**: Omit the `--section` option.
- **Apply to specific section**: Use `--section <index>` (0-indexed). 

### Example: Different header for Abstract
```bash
# Set universal header for the whole document
officellm set-header -i paper.docx --content "Thesis 2024"

# Set unique header for the first section (e.g., Abstract)
officellm set-header -i paper.docx --section 0 --content "Abstract"
```

---

## 🔄 Dynamic Content (STYLEREF)

In academic papers, headers often need to show the current chapter title. Use the `{{styleref:StyleName}}` syntax.

- **`{{styleref:Heading 1}}`**: Displays the text of the most recent paragraph styled as "Heading 1".
- **`{{page}}`**: Displays the current page number.

### Example: Chapter Title Header
```bash
officellm set-header -i paper.docx --content "Chapter: {{styleref:Heading 1}}"
```

---

## 🔢 Page Numbering

Footers are commonly used for page numbers. OfficeLLM provides specialized support for formatting and起始页 (start page).

### Enabling Page Numbers
Use the `--page-number` flag on `set-footer`.

### Formatting
Use `--format` with the `{n}` placeholder.
- `--format "- {n} -"` → `- 1 -`
- `--format "Page {n}"` → `Page 1`

### Starting Page
Use `--start` to set the beginning page number for a section. This is useful for restarting pagination after front matter.

### Example: Academic Pagination
```bash
# Start page numbering from 1 in section 1 (assuming section 0 is cover/preface)
officellm set-footer -i paper.docx --section 1 --page-number --format "- {n} -" --start 1
```

---

## 📄 Page Types (First/Even/Odd)

Word allows different headers/footers for different types of pages.

- **`default`**: Used for all pages (or odd pages if even/odd is enabled).
- **`first`**: Used for the first page of a section (requires `--type first`).
- **`even`**: Used for even-numbered pages (requires `--type even`).

### Example: Mirroring Headers (Diff Even/Odd)
```bash
# Odd pages (default) show title on right (hand-led by Word alignment in style)
officellm set-header -i book.docx --type default --content "My Great Book"

# Even pages show author on left
officellm set-header -i book.docx --type even --content "By John Doe"
```

---

## 🧹 Removal

To clear headers or footers, use the `remove-*` commands.

```bash
# Remove all headers from the document
officellm remove-header -i doc.docx

# Remove only the 'first page' header from section 0
officellm remove-header -i doc.docx --section 0 --type first
```

---

## 💡 Best Practices for Agents

1. **Verify Section Index**: Use `list-structure` to see how many sections are in the document before using `--section`.
2. **First Page Header**: Many journals require the first page to be empty or have a specific masthead. Use `--type first` to handle this.
3. **Check Styles**: Before using `{{styleref:StyleName}}`, ensure the document actually uses that style (use `list-styles`).
4. **Dry Run**: For headers/footers, the best way to verify is to use `list-headers` after modification or open the document visually if possible.
