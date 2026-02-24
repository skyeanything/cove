import { useState } from "react";
import { X } from "lucide-react";
import type { DraftAttachment } from "@/stores/chatStore";
import { FileTypeBadge, getAttachmentPreviewSrc } from "./AttachmentVisual";

function DraftAttachmentChip({
  attachment,
  onRemove,
}: {
  attachment: DraftAttachment;
  onRemove: (attachmentId: string) => void;
}) {
  const [imageFailed, setImageFailed] = useState(false);
  const previewSrc = getAttachmentPreviewSrc(attachment);
  const showImagePreview = !!previewSrc && !imageFailed;
  return (
    <div className="inline-flex max-w-[260px] items-center gap-2 rounded-md border border-border bg-background-secondary px-2 py-1">
      {showImagePreview ? (
        <img
          src={previewSrc}
          alt={attachment.name ?? "image"}
          className="size-7 rounded object-cover"
          onError={() => setImageFailed(true)}
        />
      ) : (
        <FileTypeBadge attachment={attachment} />
      )}
      <span className="truncate text-[12px] text-foreground">{attachment.name}</span>
      <button
        type="button"
        onClick={() => onRemove(attachment.id)}
        className="inline-flex size-5 shrink-0 cursor-pointer items-center justify-center rounded text-muted-foreground hover:bg-background-tertiary hover:text-foreground"
        aria-label="remove attachment"
        title="Remove"
      >
        <X className="size-3.5" strokeWidth={1.5} />
      </button>
    </div>
  );
}

export function AttachmentBar({
  attachments,
  onRemove,
}: {
  attachments: DraftAttachment[];
  onRemove: (attachmentId: string) => void;
}) {
  if (attachments.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-2 border-b border-border/50 px-3 py-2">
      {attachments.map((attachment) => (
        <DraftAttachmentChip key={attachment.id} attachment={attachment} onRemove={onRemove} />
      ))}
    </div>
  );
}
