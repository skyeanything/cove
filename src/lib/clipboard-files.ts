import { invoke } from "@tauri-apps/api/core";
import type { DraftAttachment } from "@/stores/chat-types";
import { isSupportedUploadFile } from "@/lib/attachment-utils";
import { processAttachment } from "@/lib/attachment-pipeline";

/**
 * Read native file paths from the system clipboard via Tauri command.
 * Returns empty array on failure.
 */
export async function readClipboardFilePaths(): Promise<string[]> {
  try {
    return await invoke<string[]>("read_clipboard_files");
  } catch {
    return [];
  }
}

/**
 * Read clipboard file paths and convert supported ones to draft attachments.
 * Reuses the same pipeline as the file picker (filter + processAttachment).
 */
export async function clipboardFilesToDraftAttachments(
  workspacePath?: string,
): Promise<DraftAttachment[]> {
  const paths = await readClipboardFilePaths();
  const supported = paths.filter((p) => isSupportedUploadFile(p));
  if (supported.length === 0) return [];

  const results = await Promise.all(
    supported.map(async (sourcePath): Promise<DraftAttachment | null> => {
      try {
        const draft = await processAttachment(sourcePath, workspacePath);
        return draft.status === "error" ? null : draft;
      } catch {
        return null;
      }
    }),
  );

  return results.filter((item): item is DraftAttachment => item !== null);
}
