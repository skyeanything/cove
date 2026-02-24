import { convertFileSrc } from "@tauri-apps/api/core";
import { getClassWithColor } from "file-icons-js";
import type { Attachment } from "@/db/types";
import type { DraftAttachment } from "@/stores/chatStore";
import {
  getFileExtension,
  isImageAttachment,
} from "@/lib/attachment-utils";

type AnyAttachment = Pick<Attachment, "type" | "name" | "path" | "mime_type" | "content"> | DraftAttachment;

export function getAttachmentPreviewSrc(attachment: AnyAttachment): string | null {
  if (!isImageAttachment(attachment)) return null;
  if (attachment.content?.startsWith("data:image/")) return attachment.content;
  if (attachment.path) return convertFileSrc(attachment.path);
  return null;
}

function getExtensionForIcon(attachment: AnyAttachment): string {
  const source = attachment.name || attachment.path || "";
  const ext = getFileExtension(source);
  return ext || "txt";
}

export function FileTypeBadge({ attachment }: { attachment: AnyAttachment }) {
  const extension = getExtensionForIcon(attachment);
  const iconClass = getClassWithColor(`file.${extension}`) || "text-icon";
  return (
    <span
      className="inline-flex size-7 shrink-0 items-center justify-center rounded-md bg-background-tertiary"
      aria-label={extension}
      title={extension.toUpperCase()}
    >
      <i className={`icon ${iconClass}`} aria-hidden />
    </span>
  );
}
