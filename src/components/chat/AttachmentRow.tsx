import { useCallback, useState } from "react";
import type { KeyboardEvent } from "react";
import type { Attachment } from "@/db/types";
import { useFilePreviewStore } from "@/stores/filePreviewStore";
import { useOpenFilePreview } from "@/hooks/useOpenFilePreview";
import { FileTypeBadge, getAttachmentPreviewSrc } from "./AttachmentVisual";

function useOpenAttachmentPreview() {
  const setContent = useFilePreviewStore((s) => s.setContent);
  const { openPreview } = useOpenFilePreview();

  return useCallback(
    (attachment: Attachment) => {
      const path = attachment.path ?? attachment.name ?? "";
      if (!path) return;

      // Pre-cache content if available (e.g. image data URL)
      if (attachment.content) {
        const isImage = attachment.content.startsWith("data:image/");
        setContent(path, {
          path,
          type: isImage ? "dataUrl" : "text",
          dataUrl: isImage ? attachment.content : undefined,
          text: isImage ? undefined : attachment.content,
          mtime: Date.now(),
        });
      }

      openPreview(path);
    },
    [setContent, openPreview],
  );
}

export function UserAttachmentItem({ attachment }: { attachment: Attachment }) {
  const [imageFailed, setImageFailed] = useState(false);
  const previewSrc = getAttachmentPreviewSrc(attachment);
  const showImage = !!previewSrc && !imageFailed;
  const openPreview = useOpenAttachmentPreview();

  const handleClick = () => openPreview(attachment);
  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      openPreview(attachment);
    }
  };

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      className="inline-flex max-w-[260px] cursor-pointer items-center gap-2 rounded-md border border-border bg-background-secondary px-2 py-1 transition-colors hover:border-accent/50 hover:bg-background-tertiary"
    >
      {showImage ? (
        <img
          src={previewSrc}
          alt={attachment.name ?? "attachment"}
          className="size-8 rounded object-cover"
          onError={() => setImageFailed(true)}
        />
      ) : (
        <FileTypeBadge attachment={attachment} />
      )}
      <span className="truncate text-[12px] text-foreground">{attachment.name}</span>
    </div>
  );
}

export function UserAttachmentList({ attachments }: { attachments: Attachment[] }) {
  return (
    <div className="mb-2 flex max-w-[560px] flex-wrap justify-end gap-2">
      {attachments.map((attachment) => (
        <UserAttachmentItem key={attachment.id} attachment={attachment} />
      ))}
    </div>
  );
}
