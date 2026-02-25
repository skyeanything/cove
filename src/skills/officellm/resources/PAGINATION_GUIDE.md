# Pagination Guide

> **Relationship**: This guide expands on [SKILL.md Section 3](../SKILL.md) (Core Capabilities → Document Analysis). For the full command index, see SKILL.md.

Large documents can produce output that exceeds agent context windows. OfficeLLM provides pagination parameters to retrieve content in manageable chunks.

## Supported Commands

| Command | Pagination Params | Default Behavior |
|---------|-------------------|------------------|
| `extract-text` | `--limit`, `--offset`, `--page` | Returns all paragraphs |
| `list-structure` | `--limit`, `--offset`, `--page` | Returns all elements |
| `search` | `--limit`, `--offset` (aliases for `--max-results`, `--skip`) | Returns up to 50 matches |

## Parameters

### `--limit` and `--offset`

Standard cursor-based pagination. Returns `limit` items starting from `offset`.

```bash
# First 20 paragraphs
officellm extract-text -i doc.docx --limit 20 --offset 0

# Next 20 paragraphs
officellm extract-text -i doc.docx --limit 20 --offset 20
```

### `--page`

Filter results to a specific **estimated page number** (1-based). This uses OfficeLLM's page estimation to return only content from that page.

```bash
# Content from page 3 only
officellm extract-text -i doc.docx --page 3

# Structure from page 5
officellm list-structure -i doc.docx --page 5
```

### Mutual Exclusivity

`--page` and `--limit`/`--offset` are **mutually exclusive**. Use one approach or the other:

```bash
# OK: page-based
officellm extract-text -i doc.docx --page 2

# OK: offset-based
officellm extract-text -i doc.docx --limit 20 --offset 0

# ERROR: cannot combine
officellm extract-text -i doc.docx --page 2 --limit 10  # invalid
```

### Search Aliases

For `search`, `--limit` and `--offset` are aliases for the existing `--max-results` and `--skip` parameters:

```bash
# These are equivalent:
officellm search -i doc.docx --find "keyword" --max-results 10 --skip 5
officellm search -i doc.docx --find "keyword" --limit 10 --offset 5
```

## Page Estimation

OfficeLLM estimates page numbers heuristically (Word documents don't contain explicit page boundaries — those are determined at render time).

### Getting Page Count

```bash
officellm describe-document -i doc.docx
```

The output includes:
- `page_count`: Estimated total pages
- `page_break_count`: Number of explicit page/section breaks
- `confidence`: Estimation confidence (`"high"`, `"medium"`, `"low"`)

High confidence means explicit page breaks closely match the estimate. Low confidence indicates the estimate relies heavily on heuristics (line counting, paragraph density).

### Per-Element Page Numbers

```bash
officellm list-structure -i doc.docx
```

Each element in the output includes `estimated_page`, indicating which page it likely appears on. The response also includes a `page_summary` with overall page count and confidence.

## Iterative Pagination Workflow

### Python Example

```python
def paginated_extract(file, page_size=30):
    """Extract all text from a document in chunks."""
    all_paragraphs = []
    offset = 0

    while True:
        result = ollm("extract-text", i=file, limit=str(page_size), offset=str(offset))
        paragraphs = result["data"]["paragraphs"]

        if not paragraphs:
            break

        all_paragraphs.extend(paragraphs)
        offset += len(paragraphs)

        # Stop if we got fewer than requested (last page)
        if len(paragraphs) < page_size:
            break

    return all_paragraphs
```

### Page-by-Page Processing

```python
def process_by_page(file):
    """Process document one estimated page at a time."""
    desc = ollm("describe-document", i=file)
    page_count = desc["data"]["page_count"]

    for page in range(1, page_count + 1):
        result = ollm("extract-text", i=file, page=str(page))
        paragraphs = result["data"]["paragraphs"]
        # Process this page's content...
        print(f"Page {page}: {len(paragraphs)} paragraphs")
```

## Token Budget Strategy

When working within a limited context window, use pagination to stay within budget:

1. **Start with `describe-document`** to get paragraph count and page estimate
2. **Estimate tokens**: ~50 tokens per paragraph on average (varies by content)
3. **Set `--limit`** to fit your budget: e.g., 4000-token budget / 50 tokens = ~80 paragraphs
4. **Iterate** with `--offset` if you need the full document
5. **Use `--page`** when you only need a specific section of the document

### Quick Budget Table

| Context Budget | Recommended `--limit` | Notes |
|----------------|----------------------|-------|
| 2K tokens | 30–40 paragraphs | Summaries, quick checks |
| 4K tokens | 60–80 paragraphs | Standard analysis |
| 8K tokens | 120–160 paragraphs | Detailed review |
| Unlimited | Omit `--limit` | Full extraction |

## Troubleshooting

| Symptom | Cause | Fix |
|---------|-------|-----|
| Empty result with `--page N` | Page number exceeds estimate | Use `describe-document` to check page count first |
| Missing content between pages | Page estimation gap | Use `--limit`/`--offset` for guaranteed coverage |
| `--page` and `--limit` error | Mutually exclusive params | Use one approach, not both |
| Search returns fewer than expected | Default `--max-results` is 50 | Increase `--limit` or iterate with `--offset` |
