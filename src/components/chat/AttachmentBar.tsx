import { useState } from "react";
import { X, Loader2, AlertCircle } from "lucide-react";
import type { DraftAttachment } from "@/stores/chatStore";
import { FileTypeBadge, getAttachmentPreviewSrc } from "./AttachmentVisual";

function StatusIndicator({ status }: { status?: DraftAttachment["status"] }) {
  if (status === "uploading" || status === "processing") {
    return <Loader2 className="size-3 shrink-0 animate-spin text-muted-foreground" strokeWidth={1.5} />;
  }
  if (status === "error") {
    return <AlertCircle className="size-3 shrink-0 text-destructive" strokeWidth={1.5} />;
  }
  return null;
}

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
  const isError = attachment.status === "error";
  return (
    <div className={`inline-flex max-w-[260px] items-center gap-2 rounded-md border px-2 py-1 ${isError ? "border-destructive/50 bg-destructive/5" : "border-border bg-background-secondary"}`}>
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
      <StatusIndicator status={attachment.status} />
      <button
        type="button"
        onClick={() => onRemove(attachment.id)}
        className="inline-flex size-5 shrink-0 cursor-pointer items-center justify-center rounded text-muted-foreground hover:bg-background-tertiary hover:text-foreground"
        aria-label="remove attachment"
        title={isError ? attachment.error ?? "Error" : "Remove"}
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
