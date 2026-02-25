import type { DraftAttachment } from "@/stores/chat-types";
import { detectAttachmentType, detectMimeType, isSupportedUploadFile } from "@/lib/attachment-utils";
import { invoke } from "@tauri-apps/api/core";

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

export async function imageFilesToDraftAttachments(files: File[]): Promise<DraftAttachment[]> {
  const imageFiles = Array.from(files).filter(isImageFile);
  if (imageFiles.length === 0) return [];
  const attachments: DraftAttachment[] = [];
  for (const file of imageFiles) {
    try {
      const content = await fileToDataUrl(file);
      attachments.push({
        id: crypto.randomUUID(),
        type: "image",
        name: file.name || "image.png",
        mime_type: file.type,
        size: file.size,
        content,
      });
    } catch {
      // 单文件失败时跳过
    }
  }
  return attachments;
}

/** 拖放的非图片支持文件（PDF/文档等）通过 Tauri 保存到 AppData 并转为草稿附件 */
export async function nonImageFilesToDraftAttachments(files: File[]): Promise<DraftAttachment[]> {
  const supported = Array.from(files).filter(
    (f) => !isImageFile(f) && isSupportedUploadFile(f.name || ""),
  );
  if (supported.length === 0) return [];
  const attachments: DraftAttachment[] = [];
  for (const file of supported) {
    try {
      const contentBase64 = await fileToBase64(file);
      const saved = await invoke<{ path: string; name: string; size: number; previewDataUrl?: string }>(
        "save_attachment_from_base64",
        {
          args: {
            name: file.name || "file",
            contentBase64,
            mimeType: file.type || undefined,
          },
        },
      );
      attachments.push({
        id: crypto.randomUUID(),
        type: detectAttachmentType(saved.name),
        name: saved.name,
        path: saved.path,
        mime_type: detectMimeType(saved.name),
        size: saved.size,
        content: saved.previewDataUrl,
      });
    } catch {
      // 单文件失败时跳过
    }
  }
  return attachments;
}
