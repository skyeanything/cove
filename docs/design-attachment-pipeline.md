# Design: Attachment Pipeline

Issue: #256

## Problem

Two issues with the current attachment system:

1. **Isolated storage**: Files save to `~/.config/cove/attachments/` (app data dir), outside the workspace. The LLM `read` tool cannot access them.

2. **Manifest + tool-call pattern**: Non-image/non-PDF attachments inject a text manifest telling the LLM to call `parse_document`. This adds a round-trip, and models sometimes skip the call entirely.

## Solution Overview

- Save attachments to `{workspace}/.cove/attachments/` so they are workspace files accessible via `read`
- Pre-parse content at upload time; inject directly into the user message
- Small files (<=8K chars): full content inline
- Large files (>8K chars): summary + path, LLM uses `read` for details

## Data Flow: Current vs Proposed

### Current

```
User uploads file
       |
       v
save_attachment_file / save_attachment_from_base64
  -> copy to ~/.config/cove/attachments/{unique_name}
       |
       v
DraftAttachment { path, name, content (preview data URL) }
       |
       v
User sends message
       |
       v
chatStore.sendMessage():
  - Images: { type: "image", image: dataUrl } in content array
  - PDFs (native models): { type: "file", data: dataUrl } in content array
  - Others: manifest text appended to user message:
      "可用附件：attachmentId=xxx name=report.pdf
       请调用 parse_document 工具..."
       |
       v
LLM receives message
  - Must call parse_document(attachmentId) to see content
  - parse_document validates path is inside app data dir
  - Returns chunked/summarized text
```

### Proposed

```
User uploads file
       |
       v
save_attachment_to_workspace (new Tauri command)
  -> copy to {workspace}/.cove/attachments/{unique_name}
  -> fallback: app data dir if no workspace
       |
       v
preprocess_attachment (new Tauri command)
  -> parse text content + extract metadata
       |
       v
DraftAttachment {
  path, workspace_path, name,
  status: "ready",
  parsed_content, parsed_summary
}
       |
       v
User sends message
       |
       v
buildAttachmentInjection() (new module):
  - Small file (<=8K chars):
      "[Attached: notes.txt (234 lines, 5,120 chars)]
       Path: .cove/attachments/notes_1709123456.txt
       --- content ---
       {full parsed text}
       --- end ---"

  - Large file (>8K chars):
      "[Attached: report.pdf (12 pages, 45,230 chars)]
       Path: .cove/attachments/report_1709123456.pdf
       Preview: Q1 Revenue Report - Total revenue increased by 15%...
       Use `read` tool to access full content."

  - Image + vision model:
      vision content part (data URL) + path in text
  - Image + no vision:
      path + dimensions text only
       |
       v
LLM receives message
  - Small files: content already in context
  - Large files: uses `read` tool with workspace path
  - parse_document remains as fallback
```

## Data Model Changes

### DraftAttachment (`src/stores/chat-types.ts`)

Add fields:

```typescript
export interface DraftAttachment {
  id: string;
  type: Attachment["type"];
  name?: string;
  path?: string;
  workspace_path?: string;      // NEW: workspace-relative path
  mime_type?: string;
  size?: number;
  content?: string;             // data URL for image preview (unchanged)
  status?: "uploading" | "processing" | "ready" | "error";  // NEW
  error?: string;               // NEW: error message when status === "error"
  parsed_content?: string;      // NEW: full pre-parsed text
  parsed_summary?: string;      // NEW: summary for large files
}
```

### DB Attachment (`src/db/types.ts`)

Add fields:

```typescript
export interface Attachment {
  // ... existing fields ...
  workspace_path?: string;      // NEW
  parsed_content?: string;      // NEW
  parsed_summary?: string;      // NEW
}
```

### Migration: `005_attachment_workspace.sql`

```sql
ALTER TABLE attachments ADD COLUMN workspace_path TEXT;
ALTER TABLE attachments ADD COLUMN parsed_content TEXT;
ALTER TABLE attachments ADD COLUMN parsed_summary TEXT;
```

Backward compatible: all new columns are nullable. Existing rows unaffected.

## Rust IPC Commands

### `save_attachment_to_workspace` (new)

Saves a file to `{workspace_root}/.cove/attachments/{unique_name}`.

```rust
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SaveAttachmentToWorkspaceArgs {
    pub source_path: String,
    pub workspace_root: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SaveAttachmentToWorkspaceResult {
    pub path: String,            // absolute path
    pub name: String,            // sanitized original name
    pub size: u64,
    pub relative_path: String,   // relative to workspace root
    pub preview_data_url: Option<String>,
}
```

Logic:
1. Validate `source_path` exists and is a file
2. Create `{workspace_root}/.cove/attachments/` if needed
3. Sanitize filename, add timestamp for uniqueness
4. Copy file to destination
5. Generate preview for images
6. Return absolute + relative paths

### `save_attachment_to_workspace_from_base64` (new)

Same as above but accepts base64 content (for drag/paste). Same result type.

```rust
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SaveAttachmentToWorkspaceFromBase64Args {
    pub name: String,
    pub content_base64: String,
    pub workspace_root: String,
    pub mime_type: Option<String>,
}
```

### `preprocess_attachment` (new)

Extracts text content and metadata from a saved file.

```rust
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PreprocessAttachmentArgs {
    pub path: String,
    pub max_chars: Option<usize>,  // default 64K
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PreprocessAttachmentResult {
    pub file_type: String,
    pub content: String,           // full parsed text (up to max_chars)
    pub summary: String,           // first ~800 chars
    pub char_count: usize,
    pub truncated: bool,
    pub warnings: Vec<String>,
    pub metadata: AttachmentMetadata,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AttachmentMetadata {
    pub page_count: Option<usize>,         // PDF
    pub sheet_names: Option<Vec<String>>,   // XLSX
    pub slide_count: Option<usize>,         // PPTX
    pub line_count: Option<usize>,          // text/code
    pub image_dimensions: Option<(u32, u32)>, // images
}
```

Logic:
1. Detect file type from extension
2. Reuse existing parsers (`parse_pdf`, `parse_docx`, `parse_xlsx`, `parse_pptx`, `parse_plain_text`)
3. Extract metadata (page count, line count, etc.)
4. Generate summary (first ~800 chars, whitespace-normalized)
5. For images: extract dimensions only, no text content
6. For binary/unsupported: return empty content + file metadata

### Path validation changes

`read_attachment_as_data_url` and `parse_document_text` currently validate that paths are inside the app data dir. Both must be updated to also accept paths inside workspace `.cove/attachments/` directories. The workspace root can be passed as an additional argument, or the check can be broadened to accept any path under a `.cove/attachments/` directory.

## TypeScript Modules

### `src/lib/attachment-pipeline.ts` (new, ~200 lines)

Orchestrates the upload pipeline: save to workspace + preprocess.

```typescript
export interface PipelineResult {
  path: string;
  relativePath: string;       // workspace-relative
  name: string;
  size: number;
  previewDataUrl?: string;
  parsedContent?: string;
  parsedSummary?: string;
  metadata?: AttachmentMetadata;
}

// For file picker uploads
export async function processAttachment(
  sourcePath: string,
  workspacePath: string | null,
): Promise<PipelineResult>;

// For drag-and-drop / paste uploads
export async function processAttachmentFromBase64(
  name: string,
  contentBase64: string,
  workspacePath: string | null,
): Promise<PipelineResult>;
```

Both functions:
1. Call workspace save command (or fallback save if no workspace)
2. Call `preprocess_attachment` for parseable files
3. Return unified result with all fields populated

### `src/lib/attachment-injection.ts` (new, ~150 lines)

Builds the content to inject into the user message when sending.

```typescript
export interface InjectionResult {
  textBlock: string;           // text to prepend to user message
  visionParts: ContentPart[];  // image content parts for vision models
  pdfParts: ContentPart[];     // PDF native content parts
}

export function buildAttachmentInjection(
  attachments: DraftAttachment[],
  options: {
    modelSupportsVision: boolean;
    modelSupportsPdfNative: boolean;
    smallThreshold?: number;   // default 8000 chars
  },
): InjectionResult;
```

Per-attachment injection rules:

| Type | Condition | Injection |
|------|-----------|-----------|
| Image | vision model | vision content part + path text |
| Image | no vision | path + dimensions text only |
| Document | <=8K chars parsed | full `parsed_content` in fenced block |
| Document | >8K chars parsed | `parsed_summary` + metadata + "use `read` for full content" |
| Document | parse failed | path + metadata + "use `read`" |
| PDF | native model | PDF content part + path text |

## Smart Injection: Thresholds and Constants

```typescript
const SMALL_FILE_THRESHOLD = 8_000;  // chars (~2K tokens)
const SUMMARY_LENGTH = 800;          // chars for summary
const MAX_PREPROCESS_CHARS = 65_536; // 64K chars for preprocessing
```

These are hardcoded constants, not user-configurable.

## Key Files to Modify

### Rust (src-tauri/)

| File | Change |
|------|--------|
| `src/attachment_commands/workspace_save.rs` | NEW: `save_attachment_to_workspace`, `save_attachment_to_workspace_from_base64` |
| `src/attachment_commands/preprocess.rs` | NEW: `preprocess_attachment` command |
| `src/attachment_commands/mod.rs` | Register new modules + types |
| `src/attachment_commands/commands.rs` | Update path validation in `parse_document_text` and `read_attachment_as_data_url` to accept workspace paths |
| `src/lib.rs` | Register new commands in `invoke_handler` |
| `migrations/005_attachment_workspace.sql` | NEW: add columns |

### TypeScript (src/)

| File | Change |
|------|--------|
| `stores/chat-types.ts` | Add `status`, `error`, `workspace_path`, `parsed_content`, `parsed_summary` to `DraftAttachment` |
| `db/types.ts` | Add `workspace_path`, `parsed_content`, `parsed_summary` to `Attachment` |
| `db/repos/attachmentRepo.ts` | Update `create()` INSERT to include new columns |
| `lib/attachment-pipeline.ts` | NEW: upload orchestration |
| `lib/attachment-injection.ts` | NEW: smart injection builder |
| `hooks/useAttachFiles.ts` | Replace `save_attachment_file` calls with `processAttachment()` |
| `lib/chat-input-utils.ts` | Update drag/paste flow to use `processAttachmentFromBase64()` |
| `stores/chatStore.ts` | Replace lines 226-257 (inline injection block) with `buildAttachmentInjection()` |
| `lib/ai/tools/parse-document.ts` | Accept workspace-scoped paths (update validation) |
| `components/chat/AttachmentBar.tsx` | Show status indicators (uploading/processing/ready/error) |

## Edge Cases

### No workspace set

Fallback to current behavior: save to app data dir. `workspace_path` remains `undefined`. Injection still works (uses absolute path instead of relative).

### File too large to parse

`preprocess_attachment` truncates at `max_chars` (64K default). `truncated: true` in result. Summary always generated from available content.

### Binary files with no parser

Return empty content + metadata. Injection provides path only: "use `read` tool to access".

### Images

Saved to workspace like any other file. Vision models get the data URL content part. Non-vision models get path + dimensions text. No OCR or secondary LLM call.

### Workspace deleted or moved after upload

`DraftAttachment.status` set to `"error"` if the save command fails. UI shows error state on the attachment chip. User can remove and re-attach.

### Concurrent uploads

Each file tracked independently via `status` field. Pipeline calls are parallelized with `Promise.all`.

### Existing attachments (backward compatibility)

- Old attachments in DB have `workspace_path = NULL`, `parsed_content = NULL` -- display and `parse_document` tool work unchanged
- `parse_document` tool remains registered and functional
- `AttachmentRow` and `AttachmentVisual` check `content` and `path` fields (no change needed)
- `read_attachment_as_data_url` continues to work for app-data-dir paths

## Verification Plan

### Build verification

```bash
pnpm run build          # TypeScript + Vite build
cd src-tauri && cargo check  # Rust type checking
python3 scripts/check-file-size.py  # File size limits
```

### Test verification

```bash
pnpm test               # All tests pass
pnpm test:coverage      # Coverage thresholds met
```

### Manual test scenarios

1. **Upload text file (small)**: Attach a <8K char `.txt` file, send message. Verify full content appears in LLM context without tool call.
2. **Upload large PDF**: Attach a >8K char PDF, send message. Verify summary in context, LLM uses `read` tool for details.
3. **Upload image**: Attach PNG, send to vision model. Verify image data sent + file saved to workspace.
4. **No workspace**: Remove workspace, upload file. Verify fallback to app data dir.
5. **Drag and drop**: Drag file into chat input. Verify same pipeline as file picker.
6. **Status indicators**: Observe uploading -> processing -> ready states in UI.
7. **Existing conversation**: Open old conversation with app-data-dir attachments. Verify they still display and `parse_document` still works.
8. **Workspace path in `read`**: After uploading to workspace, ask LLM to read the file. Verify `read` tool can access `.cove/attachments/filename`.
