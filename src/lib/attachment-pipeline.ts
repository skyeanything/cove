import { invoke } from "@tauri-apps/api/core";
import type { DraftAttachment } from "@/stores/chat-types";
import { detectAttachmentType, detectMimeType } from "@/lib/attachment-utils";

/** Must match READ_DATA_URL_MAX_BYTES / MAX_DATA_URL_BYTES in Rust (25 MB). */
const MAX_DATA_URL_BYTES = 25 * 1024 * 1024;

type SaveToWorkspaceResult = {
  path: string;
  name: string;
  size: number;
  relativePath: string;
  previewDataUrl?: string;
};

type PreprocessResult = {
  fileType: string;
  content: string;
  summary: string;
  charCount: number;
  truncated: boolean;
  warnings: string[];
  metadata: {
    pageCount?: number;
    sheetNames?: string[];
    slideCount?: number;
    lineCount?: number;
    imageDimensions?: string;
  };
};

type SaveAppDataResult = {
  path: string;
  name: string;
  size: number;
  previewDataUrl?: string;
};

/**
 * Process an attachment from a file path: save to workspace + preprocess.
 * Falls back to app data dir when no workspace is set.
 */
export async function processAttachment(
  sourcePath: string,
  workspacePath: string | undefined,
): Promise<DraftAttachment> {
  const id = crypto.randomUUID();
  const draft: DraftAttachment = {
    id,
    type: detectAttachmentType(sourcePath),
    status: "uploading",
  };

  try {
    let saved: { path: string; name: string; size: number; previewDataUrl?: string };

    if (workspacePath) {
      const result = await invoke<SaveToWorkspaceResult>(
        "save_attachment_to_workspace",
        { args: { sourcePath, workspaceRoot: workspacePath } },
      );
      saved = result;
      draft.workspace_path = result.path;
    } else {
      saved = await invoke<SaveAppDataResult>("save_attachment_file", {
        args: { sourcePath },
      });
    }

    draft.name = saved.name;
    draft.path = saved.path;
    draft.size = saved.size;
    draft.mime_type = detectMimeType(saved.name);
    draft.content = saved.previewDataUrl;
    draft.status = "processing";

    // For PDFs, load data URL for native PDF model support
    if (!draft.content && draft.mime_type === "application/pdf") {
      draft.content = await loadPdfDataUrl(saved.path, workspacePath);
    }

    // Preprocess for text extraction
    const preprocessed = await preprocess(saved.path);
    if (preprocessed) {
      draft.parsed_content = preprocessed.content;
      draft.parsed_summary = preprocessed.summary;
    }

    draft.status = "ready";
  } catch (err) {
    draft.status = "error";
    draft.error = err instanceof Error ? err.message : String(err);
  }

  return draft;
}

/**
 * Process an attachment from base64 data (drag-and-drop / paste).
 * Falls back to app data dir when no workspace is set.
 */
export async function processAttachmentFromBase64(
  name: string,
  base64: string,
  workspacePath: string | undefined,
  mimeType?: string,
): Promise<DraftAttachment> {
  const id = crypto.randomUUID();
  const draft: DraftAttachment = {
    id,
    type: detectAttachmentType(name),
    name,
    status: "uploading",
  };

  try {
    let saved: { path: string; name: string; size: number; previewDataUrl?: string };

    if (workspacePath) {
      const result = await invoke<SaveToWorkspaceResult>(
        "save_attachment_to_workspace_from_base64",
        { args: { name, contentBase64: base64, workspaceRoot: workspacePath } },
      );
      saved = result;
      draft.workspace_path = result.path;
    } else {
      saved = await invoke<SaveAppDataResult>("save_attachment_from_base64", {
        args: { name, contentBase64: base64, mimeType },
      });
    }

    draft.name = saved.name;
    draft.path = saved.path;
    draft.size = saved.size;
    draft.mime_type = detectMimeType(saved.name) || mimeType;
    draft.content = saved.previewDataUrl;
    draft.status = "processing";

    // For PDFs, construct data URL from the original base64 for native PDF support.
    // Enforce same 25 MB cap as the Rust read_*_as_data_url commands.
    const resolvedMime = draft.mime_type;
    if (!draft.content && resolvedMime === "application/pdf" && base64) {
      const rawBytes = base64.length * 0.75; // approximate decoded size
      if (rawBytes <= MAX_DATA_URL_BYTES) {
        draft.content = `data:application/pdf;base64,${base64}`;
      }
    }

    const preprocessed = await preprocess(saved.path);
    if (preprocessed) {
      draft.parsed_content = preprocessed.content;
      draft.parsed_summary = preprocessed.summary;
    }

    draft.status = "ready";
  } catch (err) {
    draft.status = "error";
    draft.error = err instanceof Error ? err.message : String(err);
  }

  return draft;
}

async function preprocess(path: string): Promise<PreprocessResult | null> {
  try {
    return await invoke<PreprocessResult>("preprocess_attachment", {
      args: { path },
    });
  } catch {
    return null;
  }
}

async function loadPdfDataUrl(
  filePath: string,
  workspacePath: string | undefined,
): Promise<string | undefined> {
  try {
    if (workspacePath) {
      const result = await invoke<{ dataUrl: string }>("read_file_as_data_url", {
        args: { workspaceRoot: workspacePath, path: filePath },
      });
      return result.dataUrl;
    }
    const result = await invoke<{ dataUrl: string }>("read_attachment_as_data_url", {
      args: { path: filePath },
    });
    return result.dataUrl;
  } catch {
    return undefined;
  }
}
