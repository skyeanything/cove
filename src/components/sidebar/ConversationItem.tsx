import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { Pin, Pencil, Trash2, MoreHorizontal } from "lucide-react";
import { useRef, useEffect } from "react";
import type { Conversation } from "@/db/types";
import { ProviderIcon } from "@/components/common/ProviderIcon";

interface ConversationItemProps {
  conversation: Conversation;
  active: boolean;
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

  useEffect(() => {
    if (isEditing) inputRef.current?.focus();
  }, [isEditing]);

  if (isEditing) {
    return (
      <div className="px-2 py-[6px]">
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
            "group flex w-full items-center gap-2.5 rounded-lg px-2 py-[6px] text-left text-[13px] transition-colors",
            active
              ? "bg-sidebar-accent text-sidebar-accent-foreground"
              : "text-sidebar-foreground/80 hover:bg-sidebar-accent/50",
          )}
        >
          {conversation.provider_type && (
            <ProviderIcon type={conversation.provider_type} className="size-3.5 shrink-0 opacity-60" />
          )}
          <span className="truncate">{conversation.title || t("sidebar.untitled")}</span>
          <div className="ml-auto opacity-0 transition-opacity group-hover:opacity-100">
            <MoreHorizontal className="size-3.5 text-muted-foreground" />
          </div>
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
