import type { Attachment } from "@/db/types";

const IMAGE_EXTENSIONS = new Set(["png", "jpg", "jpeg", "gif", "webp"]);
const PDF_EXTENSIONS = new Set(["pdf"]);
const TEXT_EXTENSIONS = new Set(["txt", "md", "json", "csv"]);
const WORD_EXTENSIONS = new Set(["doc", "docx", "rtf", "odt", "pages"]);
const EXCEL_EXTENSIONS = new Set(["xls", "xlsx", "ods", "numbers"]);
const PPT_EXTENSIONS = new Set(["ppt", "pptx", "odp", "key"]);
const CODE_EXTENSIONS = new Set(["ts", "tsx", "js", "jsx", "py", "rs", "go", "java", "c", "cpp", "h"]);
const WEB_TEXT_EXTENSIONS = new Set(["html", "css", "scss", "less", "xml", "yaml", "yml", "toml", "ini"]);
const SHELL_TEXT_EXTENSIONS = new Set(["sh", "bash", "zsh", "fish", "ps1"]);

export type AttachmentVisualKind =
  | "image"
  | "pdf"
  | "word"
  | "excel"
  | "ppt"
  | "text"
  | "code"
  | "file";

export function getFileExtension(pathOrName: string): string {
  const name = pathOrName.split(/[\\/]/).pop() ?? pathOrName;
  const dot = name.lastIndexOf(".");
  return dot >= 0 ? name.slice(dot + 1).toLowerCase() : "";
}

export function detectAttachmentType(pathOrName: string): Attachment["type"] {
  const ext = getFileExtension(pathOrName);
  if (IMAGE_EXTENSIONS.has(ext)) return "image";
  if (PDF_EXTENSIONS.has(ext)) return "pdf";
  return "file";
}

export function isPdfAttachment(attachment: Pick<Attachment, "type" | "mime_type" | "path" | "name">): boolean {
  if (attachment.type === "pdf") return true;
  if (attachment.mime_type === "application/pdf") return true;
  const pathOrName = attachment.path || attachment.name || "";
  return PDF_EXTENSIONS.has(getFileExtension(pathOrName));
}

export function detectMimeType(pathOrName: string): string | undefined {
  const ext = getFileExtension(pathOrName);
  if (IMAGE_EXTENSIONS.has(ext)) return `image/${ext === "jpg" ? "jpeg" : ext}`;
  if (PDF_EXTENSIONS.has(ext)) return "application/pdf";
  if (ext === "md") return "text/markdown";
  if (TEXT_EXTENSIONS.has(ext) || WEB_TEXT_EXTENSIONS.has(ext) || SHELL_TEXT_EXTENSIONS.has(ext) || CODE_EXTENSIONS.has(ext)) {
    return "text/plain";
  }
  if (WORD_EXTENSIONS.has(ext)) {
    return ext === "docx"
      ? "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
      : "application/msword";
  }
  if (EXCEL_EXTENSIONS.has(ext)) {
    return ext === "xlsx"
      ? "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
      : "application/vnd.ms-excel";
  }
  if (PPT_EXTENSIONS.has(ext)) {
    return ext === "pptx"
      ? "application/vnd.openxmlformats-officedocument.presentationml.presentation"
      : "application/vnd.ms-powerpoint";
  }
  return undefined;
}

export function isImageAttachment(attachment: Pick<Attachment, "type" | "mime_type" | "path" | "name">): boolean {
  if (attachment.type === "image") return true;
  if (attachment.mime_type?.startsWith("image/")) return true;
  const pathOrName = attachment.path || attachment.name || "";
  return IMAGE_EXTENSIONS.has(getFileExtension(pathOrName));
}

export function getAttachmentVisualKind(
  attachment: Pick<Attachment, "type" | "mime_type" | "path" | "name">,
): AttachmentVisualKind {
  if (isImageAttachment(attachment)) return "image";
  const pathOrName = attachment.path || attachment.name || "";
  const ext = getFileExtension(pathOrName);
  if (PDF_EXTENSIONS.has(ext)) return "pdf";
  if (WORD_EXTENSIONS.has(ext)) return "word";
  if (EXCEL_EXTENSIONS.has(ext)) return "excel";
  if (PPT_EXTENSIONS.has(ext)) return "ppt";
  if (TEXT_EXTENSIONS.has(ext) || WEB_TEXT_EXTENSIONS.has(ext) || SHELL_TEXT_EXTENSIONS.has(ext)) return "text";
  if (CODE_EXTENSIONS.has(ext)) return "code";
  return "file";
}

export function getAttachmentVisualLabel(kind: AttachmentVisualKind): string {
  if (kind === "pdf") return "PDF";
  if (kind === "word") return "WORD";
  if (kind === "excel") return "EXCEL";
  if (kind === "ppt") return "PPT";
  if (kind === "code") return "CODE";
  if (kind === "text") return "TEXT";
  return "FILE";
}

export function isSupportedUploadFile(pathOrName: string): boolean {
  const ext = getFileExtension(pathOrName);
  if (!ext) return false;
  if (IMAGE_EXTENSIONS.has(ext)) return true;
  if (PDF_EXTENSIONS.has(ext)) return true;
  if (TEXT_EXTENSIONS.has(ext)) return true;
  if (WORD_EXTENSIONS.has(ext)) return true;
  if (EXCEL_EXTENSIONS.has(ext)) return true;
  if (PPT_EXTENSIONS.has(ext)) return true;
  if (CODE_EXTENSIONS.has(ext)) return true;
  if (WEB_TEXT_EXTENSIONS.has(ext)) return true;
  if (SHELL_TEXT_EXTENSIONS.has(ext)) return true;
  return false;
}
