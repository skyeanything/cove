import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Pin, Pencil, Trash2, MoreHorizontal } from "lucide-react";
import { useRef, useEffect, useState, useCallback } from "react";
import type { Conversation } from "@/db/types";

interface ConversationItemProps {
  conversation: Conversation;
  active: boolean;
  isStreaming: boolean;
  hasUnread: boolean;
  isEditing: boolean;
  editingTitle: string;
  onEditingTitleChange: (v: string) => void;
  onSelect: () => void;
  onDelete: () => void;
  onPin: () => void;
  onRename: () => void;
  onRenameSubmit: () => void;
  onRenameCancel: () => void;
}

export function ConversationItem({
  conversation,
  active,
  isStreaming,
  hasUnread,
  isEditing,
  editingTitle,
  onEditingTitleChange,
  onSelect,
  onDelete,
  onPin,
  onRename,
  onRenameSubmit,
  onRenameCancel,
}: ConversationItemProps) {
  const { t } = useTranslation();
  const inputRef = useRef<HTMLInputElement>(null);
  const [deleted, setDeleted] = useState(false);

  useEffect(() => {
    if (isEditing) inputRef.current?.focus();
  }, [isEditing]);

  const handleDelete = useCallback((e?: React.MouseEvent) => {
    e?.stopPropagation();
    setDeleted(true);
    // Brief flash of "deleted" text, then actually remove
    setTimeout(() => onDelete(), 600);
  }, [onDelete]);

  if (isEditing) {
    return (
      <div className="px-2 py-[5px]">
        <input
          ref={inputRef}
          type="text"
          value={editingTitle}
          onChange={(e) => onEditingTitleChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") onRenameSubmit();
            if (e.key === "Escape") onRenameCancel();
          }}
          onBlur={onRenameSubmit}
          placeholder={t("sidebar.untitled")}
          className="h-[22px] w-full rounded border border-border bg-background px-2 text-[13px] focus:outline-none focus:ring-1 focus:ring-ring"
        />
      </div>
    );
  }

  // After delete: show brief fade-out confirmation
  if (deleted) {
    return (
      <div className="flex items-center gap-2 rounded-lg px-2 py-[5px] text-[13px] text-foreground-tertiary" style={{ animation: "fade-out 500ms ease-out forwards" }}>
        <Trash2 className="size-3" strokeWidth={1.5} />
        <span>{t("sidebar.deleted", "Deleted")}</span>
      </div>
    );
  }

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <button
          onClick={onSelect}
          onDoubleClick={(e) => {
            e.preventDefault();
            onRename();
          }}
          className={cn(
            "group flex w-full items-center gap-2 rounded-lg px-2 py-[5px] text-left text-[13px] transition-colors",
            active
              ? "bg-sidebar-accent text-sidebar-accent-foreground"
              : "text-sidebar-foreground/80 hover:bg-sidebar-accent/50",
          )}
        >
          {/* Status dot — outline by default, solid green when streaming, red badge when unread */}
          <div className="relative flex size-4 shrink-0 items-center justify-center">
            <span
              className={cn(
                "block size-[7px] rounded-full transition-colors duration-300",
                isStreaming
                  ? "animate-pulse bg-green-500 shadow-[0_0_4px_1px_rgba(34,197,94,0.5)]"
                  : "border border-foreground/20",
              )}
            />
            {hasUnread && !isStreaming && (
              <span className="absolute right-0 top-0 block size-1.5 rounded-full bg-red-500" />
            )}
          </div>

          <span className="min-w-0 truncate">{conversation.title || t("sidebar.untitled")}</span>

          {/* More button — visible on hover */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <div
                role="button"
                tabIndex={0}
                onClick={(e) => e.stopPropagation()}
                className="ml-auto shrink-0 cursor-pointer rounded p-0.5 opacity-0 transition-opacity hover:bg-sidebar-accent group-hover:opacity-100 data-[state=open]:opacity-100"
              >
                <MoreHorizontal className="size-3.5 text-muted-foreground" strokeWidth={1.5} />
              </div>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-40">
              <DropdownMenuItem
                className="gap-2 text-[13px]"
                onClick={(e) => { e.stopPropagation(); onPin(); }}
              >
                <Pin className="size-3.5" strokeWidth={1.5} />
                {conversation.pinned ? t("sidebar.unpinConversation") : t("sidebar.pinConversation")}
              </DropdownMenuItem>
              <DropdownMenuItem
                className="gap-2 text-[13px]"
                onClick={(e) => { e.stopPropagation(); onRename(); }}
              >
                <Pencil className="size-3.5" strokeWidth={1.5} />
                {t("sidebar.rename")}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                className="gap-2 text-[13px] text-destructive focus:text-destructive"
                onClick={(e) => { e.stopPropagation(); handleDelete(); }}
              >
                <Trash2 className="size-3.5" strokeWidth={1.5} />
                {t("sidebar.delete")}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </button>
      </ContextMenuTrigger>
      <ContextMenuContent className="w-48">
        <ContextMenuItem className="gap-2 text-[13px]" onClick={onPin}>
          <Pin className="size-3.5" />
          {conversation.pinned ? t("sidebar.unpinConversation") : t("sidebar.pinConversation")}
        </ContextMenuItem>
        <ContextMenuItem className="gap-2 text-[13px]" onClick={onRename}>
          <Pencil className="size-3.5" />
          {t("sidebar.rename")}
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem
          className="gap-2 text-[13px] text-destructive focus:text-destructive"
          onClick={onDelete}
        >
          <Trash2 className="size-3.5" />
          {t("sidebar.delete")}
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}
