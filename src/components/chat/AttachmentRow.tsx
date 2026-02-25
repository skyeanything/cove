import { useState } from "react";
import type { Attachment } from "@/db/types";
import { FileTypeBadge, getAttachmentPreviewSrc } from "./AttachmentVisual";

export function UserAttachmentItem({ attachment }: { attachment: Attachment }) {
  const [imageFailed, setImageFailed] = useState(false);
  const previewSrc = getAttachmentPreviewSrc(attachment);
  const showImage = !!previewSrc && !imageFailed;
  return (
    <div className="inline-flex max-w-[260px] items-center gap-2 rounded-md border border-border bg-background-secondary px-2 py-1">
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
