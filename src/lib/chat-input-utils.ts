import type { DraftAttachment } from "@/stores/chat-types";
import { isSupportedUploadFile } from "@/lib/attachment-utils";
import { processAttachmentFromBase64 } from "@/lib/attachment-pipeline";

const IMAGE_MIME = new Set(["image/png", "image/jpeg", "image/gif", "image/webp"]);

export function isImageFile(file: File): boolean {
  return IMAGE_MIME.has(file.type);
}

export function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

export async function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result;
      const str = typeof dataUrl === "string" ? dataUrl : "";
      const base64 = str.includes(",") ? str.split(",")[1] ?? "" : "";
      resolve(base64);
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

/**
 * Convert image files to draft attachments.
 * When a workspace path is provided, images are also saved to workspace via the pipeline.
 */
export async function imageFilesToDraftAttachments(
  files: File[],
  workspacePath?: string,
): Promise<DraftAttachment[]> {
  const imageFiles = Array.from(files).filter(isImageFile);
  if (imageFiles.length === 0) return [];
  const attachments: DraftAttachment[] = [];
  for (const file of imageFiles) {
    try {
      if (workspacePath) {
        const base64 = await fileToBase64(file);
        const draft = await processAttachmentFromBase64(
          file.name || "image.png", base64, workspacePath, file.type,
        );
        // Ensure image has data URL content for vision models
        if (!draft.content?.startsWith("data:image/")) {
          draft.content = await fileToDataUrl(file);
        }
        attachments.push(draft);
      } else {
        const content = await fileToDataUrl(file);
        attachments.push({
          id: crypto.randomUUID(),
          type: "image",
          name: file.name || "image.png",
          mime_type: file.type,
          size: file.size,
          content,
          status: "ready",
        });
      }
    } catch {
      // Skip failed individual files
    }
  }
  return attachments;
}

/**
 * Convert non-image supported files to draft attachments via the pipeline.
 */
export async function nonImageFilesToDraftAttachments(
  files: File[],
  workspacePath?: string,
): Promise<DraftAttachment[]> {
  const supported = Array.from(files).filter(
    (f) => !isImageFile(f) && isSupportedUploadFile(f.name || ""),
  );
  if (supported.length === 0) return [];
  const attachments: DraftAttachment[] = [];
  for (const file of supported) {
    try {
      const base64 = await fileToBase64(file);
      const draft = await processAttachmentFromBase64(
        file.name || "file", base64, workspacePath, file.type || undefined,
      );
      attachments.push(draft);
    } catch {
      // Skip failed individual files
    }
  }
  return attachments;
}
