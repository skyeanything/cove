# Design: Preview Every File -- Clickable Attachments + Enhanced Viewers

Issue: #258

## Overview

Extend `FilePreviewPanel` rendering architecture with 4 new viewer components, expand `PreviewKind` type system, and wire up click events on chat attachments to open the right-sidebar preview.

No third-party universal viewer library. Each viewer is a focused component.

## 1. Clickable Chat Attachments

### Current State

`UserAttachmentItem` (`src/components/chat/AttachmentRow.tsx`) renders attachment badges with no click handler. Attachments live in the workspace directory; `attachment.path` or `attachment.name` maps to a workspace-relative path.

### Changes

Modify `AttachmentRow.tsx`:
- Add `onClick` to `UserAttachmentItem`'s root `<div>`
- Click logic:
  1. Resolve workspace-relative path from `attachment.path` / `attachment.name`
  2. Call `filePreviewStore.setSelected(relativePath)`
  3. If right sidebar closed, call `layoutStore.setFilePanelOpen(true)`
- Add `cursor-pointer`, `hover:border-accent/50`, `role="button"`, `tabIndex={0}`, `onKeyDown` (Enter/Space)

### Open Question

Does `attachment.path` store absolute or workspace-relative paths? Check `useAttachFiles` hook's `pickAndSaveAttachments()` to determine the conversion needed.

## 2. Image Viewer

### Current State

`FilePreviewPanel.tsx:159-173` renders a plain `<img>` with no interaction.

### New Component

`src/components/preview/ImageViewer.tsx` (~120 lines)

```
Props: { src: string; alt?: string }

State:
  scale: number (default 1, clamp 0.1-10)
  translate: { x: number; y: number }
  isDragging: boolean

Events:
  onWheel -> deltaY adjusts scale, zoom center = cursor position
  onMouseDown/Move/Up -> drag pan (only when scale > fitScale)
  onDoubleClick -> toggle fitScale <-> 1.0

UI:
  Bottom overlay bar: zoom percentage + control buttons (zoom in, zoom out, fit)
  <div ref> container, <img> positioned via transform: scale() translate()
```

Replace `kind === "image"` branch in `FilePreviewPanel.tsx`.

### Files

- New: `src/components/preview/ImageViewer.tsx`
- Modify: `src/components/preview/FilePreviewPanel.tsx` (replace image branch, ~15 lines)

## 3. PDF Viewer

### Current State

`FilePreviewPanel.tsx:177-191` uses `<embed>` tag, relying on WebView's built-in PDF rendering. Limited controls in Tauri.

`OfficePdfViewer.tsx` (285 lines) already has a full pdf.js canvas implementation:
- `pdfjsLib.getDocument()` for loading
- `PdfPage` subcomponent for per-page canvas rendering
- `ResizeObserver` for responsive width
- DPR scaling

### New Component

`src/components/preview/PdfViewer.tsx` (~180 lines)

```
Props: { dataUrl: string; className?: string }

Core: Extract pdf.js rendering logic from OfficePdfViewer.tsx:
  - pdfjsLib.getDocument(binaryData) to load
  - PdfPage canvas rendering (reuse or extract as shared component)

New features:
  - Toolbar: < [pageNum] / totalPages > | [-] [zoom%] [+] | [fit-width]
  - State: currentPage, scale, numPages
  - Page navigation: buttons + input field + arrow keys
  - Zoom: buttons + scroll wheel
  - Scroll to page: scrollIntoView
```

Consider extracting `PdfPage` from `OfficePdfViewer.tsx` into `src/components/preview/PdfPage.tsx` so both viewers share it.

Replace `kind === "pdf"` branch in `FilePreviewPanel.tsx`.

### Files

- New: `src/components/preview/PdfViewer.tsx`
- Optional: `src/components/preview/PdfPage.tsx` (extracted from OfficePdfViewer)
- Modify: `src/components/preview/FilePreviewPanel.tsx` (replace pdf branch)
- Reference: `src/components/preview/OfficePdfViewer.tsx`

## 4. CSV Table Viewer

### Current State

`preview-types.ts:23` classifies `.csv` as `"txt"`, rendering as plain text with line numbers. `XlsxViewer.tsx` (267 lines) has table rendering patterns to reference (sticky header, row/column limits, scroll container).

### Changes

**`src/lib/preview-types.ts`**:
- Add `"csv"` to `PreviewKind`
- Route `.csv` to `"csv"` in `getPreviewKind()` (remove from txt branch)

**`src/hooks/usePreviewContent.ts`**:
- Add `"csv"` to `isTextKind()` (CSV loaded as text via `read_file_raw`)

**New: `src/components/preview/CsvViewer.tsx`** (~80 lines)

```
Props: { text: string; className?: string }

Parsing:
  papaparse library (~7KB gzipped, zero deps, full RFC 4180)
  OR self-written parser (~30 lines, covers basic cases)

Rendering (reference XlsxViewer table style):
  - Sticky thead
  - Row number column
  - 500 row x 50 column limit
  - max-height 70vh, overflow auto
  - Alternating row background
```

**`FilePreviewPanel.tsx`**: Add `kind === "csv"` branch.

### Dependency Decision

- **Self-written parser** (~30 lines): covers basics but many edge cases (nested quotes, BOM, mixed line endings)
- **papaparse** (recommended): mature, 7KB gzipped, zero deps, full RFC 4180

### Files

- Modify: `src/lib/preview-types.ts` (+3 lines)
- Modify: `src/hooks/usePreviewContent.ts` (+1 line)
- New: `src/components/preview/CsvViewer.tsx`
- Modify: `src/components/preview/FilePreviewPanel.tsx` (+10 lines)
- Reference: `src/components/preview/XlsxViewer.tsx`

## 5. HTML Safe Render Viewer

### Current State

`preview-types.ts:8` classifies `.html`/`.htm` as `"code"`, showing syntax-highlighted source only. `CodeBlock.tsx:124` has an HTML preview feature using `dangerouslySetInnerHTML` with no event handler filtering -- security risk.

### Changes

**`src/lib/preview-types.ts`**:
- Add `"html"` to `PreviewKind`
- Route `.html`/`.htm` to `"html"` (remove from CODE_EXTS)

**New: `src/components/preview/HtmlViewer.tsx`** (~80 lines)

```
Props: { code: string; path: string; className?: string }

Dual mode (same pattern as markdown preview/code toggle):

Preview mode:
  1. DOMPurify.sanitize(code, {
       FORBID_TAGS: ['script', 'noscript'],
       FORBID_ATTR: ['onerror', 'onclick', 'onload', 'onmouseover', ...all on* attrs],
       ALLOW_DATA_ATTR: false,
     })
  2. Inject CSP meta: <meta http-equiv="Content-Security-Policy" content="script-src 'none'">
  3. <iframe srcdoc={sanitizedHtml} sandbox="" style={{ width: '100%', height: '100%' }} />
     sandbox="" = all restrictions (no scripts, no forms, no popups)

Code mode:
  <CodeViewer path={path} code={code} /> (reuse existing component)
```

Triple security defense:
1. **DOMPurify** -- strips `<script>` and all `on*` event attributes
2. **CSP meta** -- `script-src 'none'` blocks any script execution
3. **sandbox iframe** -- empty `sandbox` attribute disables all dangerous behaviors

### Dependencies

- `dompurify` + `@types/dompurify`: ~15KB gzipped, industry standard HTML sanitizer

### Files

- Modify: `src/lib/preview-types.ts` (+3 lines, remove html/htm from CODE_EXTS)
- New: `src/components/preview/HtmlViewer.tsx`
- Modify: `src/components/preview/FilePreviewPanel.tsx` (+15 lines, preview/code toggle)

## 6. Unsupported File Fallback

### Current State

`FilePreviewPanel.tsx:61-70` shows a single i18n text string with no actions. `PreviewFileHeader.tsx` already has `OpenExternallyButton`.

### Changes

Modify `FilePreviewPanel.tsx` unsupported branch (~15 lines):
- File icon (based on extension) + filename + extension badge
- File size (if available from cached data)
- "Open with system app" button (reuse `OpenExternallyButton`)

## New Dependencies

| Package | Purpose | Size | Notes |
|---------|---------|------|-------|
| `dompurify` + `@types/dompurify` | HTML sanitization | ~15KB gzipped | Required for R5 |
| `papaparse` (optional) | CSV parsing | ~7KB gzipped | Zero deps, recommended over self-written |

## File Change Summary

| File | Operation | Est. Lines |
|------|-----------|------------|
| `src/components/chat/AttachmentRow.tsx` | Modify | 34 -> ~55 |
| `src/components/preview/ImageViewer.tsx` | New | ~120 |
| `src/components/preview/PdfViewer.tsx` | New | ~180 |
| `src/components/preview/CsvViewer.tsx` | New | ~80 |
| `src/components/preview/HtmlViewer.tsx` | New | ~80 |
| `src/components/preview/FilePreviewPanel.tsx` | Modify | 229 -> ~280 |
| `src/lib/preview-types.ts` | Modify | 55 -> ~65 |
| `src/hooks/usePreviewContent.ts` | Modify | 74 -> ~78 |

All new files under 400 lines.

## Verification

```bash
pnpm run build           # TypeScript + Vite build passes
pnpm test                # All tests pass
python3 scripts/check-file-size.py  # File size limits
```

Manual test with `pnpm tauri dev`:
1. Send image attachment -> click -> right sidebar shows zoomable image
2. Send PDF -> click -> page navigation and zoom work
3. Open CSV workspace file -> table rendering with sticky header
4. Open HTML file -> render preview works, `<script>` does not execute
5. Open unsupported file -> file info + "open with system app" button
6. Existing workspace file previews have no regression
