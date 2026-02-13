import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import {
  Search,
  ChevronRight,
  MoreHorizontal,
  Pin,
  Pencil,
  Trash2,
} from "lucide-react";
import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { useDataStore } from "@/stores/dataStore";
import { useChatStore } from "@/stores/chatStore";
import { ProviderIcon } from "@/components/common/ProviderIcon";
import type { Conversation } from "@/db/types";

const GROUP_ORDER = ["pinned", "today", "yesterday", "past7days", "earlier"] as const;

function groupConversations(conversations: Conversation[]): Record<string, Conversation[]> {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today.getTime() - 86400000);
  const past7 = new Date(today.getTime() - 7 * 86400000);

  const pinned: Conversation[] = [];
  const unpinned: Conversation[] = [];
  for (const conv of conversations) {
    if (conv.pinned) pinned.push(conv);
    else unpinned.push(conv);
  }
  pinned.sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime());

  const groups: Record<string, Conversation[]> = { pinned };
  for (const conv of unpinned) {
    const d = new Date(conv.updated_at);
    let group: string;
    if (d >= today) group = "today";
    else if (d >= yesterday) group = "yesterday";
    else if (d >= past7) group = "past7days";
    else group = "earlier";
    if (!groups[group]) groups[group] = [];
    groups[group]!.push(conv);
  }
  return groups;
}

interface LeftSidebarProps {
  open: boolean;
}

export function LeftSidebar({ open }: LeftSidebarProps) {
  const { t } = useTranslation();
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());
  const [searchFocused, setSearchFocused] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);

  const conversations = useDataStore((s) => s.conversations);
  const activeConversationId = useDataStore((s) => s.activeConversationId);
  const setActiveConversation = useDataStore((s) => s.setActiveConversation);
  const updateConversation = useDataStore((s) => s.updateConversation);
  const setPinned = useDataStore((s) => s.setPinned);
  const deleteConversation = useDataStore((s) => s.deleteConversation);
  const loadMessages = useChatStore((s) => s.loadMessages);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState("");

  const filteredConversations = useMemo(() => {
    if (!searchQuery.trim()) return conversations;
    const q = searchQuery.toLowerCase();
    return conversations.filter((c) => c.title?.toLowerCase().includes(q));
  }, [conversations, searchQuery]);

  const grouped = useMemo(
    () => groupConversations(filteredConversations),
    [filteredConversations],
  );

  const toggleGroup = (group: string) => {
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(group)) {
        next.delete(group);
      } else {
        next.add(group);
      }
      return next;
    });
  };

  const handleSelectConversation = (id: string) => {
    setActiveConversation(id);
    loadMessages(id);
  };

  const handleDelete = async (id: string) => {
    await deleteConversation(id);
  };

  const handlePin = async (conv: Conversation) => {
    await setPinned(conv.id, conv.pinned ? 0 : 1);
  };

  const handleRenameStart = (conv: Conversation) => {
    setEditingId(conv.id);
    setEditingTitle(conv.title?.trim() || "");
  };

  const handleRenameSubmit = async () => {
    if (!editingId) return;
    const title = editingTitle.trim() || undefined;
    await updateConversation(editingId, { title: title ?? "" });
    setEditingId(null);
    setEditingTitle("");
  };


  // ⌘F to focus search
  const handleSearchShortcut = useCallback(
    (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "f" && open) {
        e.preventDefault();
        searchRef.current?.focus();
      }
    },
    [open],
  );

  useEffect(() => {
    window.addEventListener("keydown", handleSearchShortcut);
    return () => window.removeEventListener("keydown", handleSearchShortcut);
  }, [handleSearchShortcut]);

  return (
    <div
      className={cn(
        "no-select flex flex-col overflow-hidden bg-sidebar",
        "transition-[width,min-width] duration-300 ease-out",
        open ? "w-[260px] min-w-[260px]" : "w-0 min-w-0 border-r-0",
        open && "border-r border-sidebar-border",
      )}
    >
      {/* Top spacer — matches WindowControls height (traffic lights + buttons row) */}
      <div data-tauri-drag-region className="h-[52px] shrink-0" />

      {/* Search */}
      <div className="px-3 pb-2">
        <div
          className={cn(
            "flex h-[30px] items-center gap-2 rounded-md bg-background-tertiary/70 px-2.5 text-[13px] transition-colors",
            searchFocused && "bg-background-tertiary ring-1 ring-brand/15",
          )}
        >
          <Search className="size-3.5 shrink-0 text-muted-foreground" strokeWidth={1.5} />
          <input
            ref={searchRef}
            type="text"
            placeholder={t("sidebar.searchPlaceholder")}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-transparent text-[13px] placeholder:text-muted-foreground focus:outline-none"
            onFocus={() => setSearchFocused(true)}
            onBlur={() => setSearchFocused(false)}
          />
        </div>
      </div>

      {/* Conversation list */}
      <ScrollArea className="min-h-0 flex-1">
        <div className="px-1.5 pb-2">
          {conversations.length === 0 && (
            <div className="px-3 py-8 text-center text-[13px] text-muted-foreground">
              {t("sidebar.noConversations")}
            </div>
          )}
          {GROUP_ORDER.map((group) => {
            const convs = grouped[group];
                if (!convs || convs.length === 0) return null;
            const isCollapsed = collapsedGroups.has(group);
            return (
              <div key={group}>
                <button
                  onClick={() => toggleGroup(group)}
                  className="flex w-full items-center gap-1 px-2 pb-0.5 pt-3 text-[11px] font-medium text-muted-foreground hover:text-foreground"
                >
                  <ChevronRight
                    className={cn(
                      "size-3 transition-transform duration-200",
                      !isCollapsed && "rotate-90",
                    )}
                    strokeWidth={1.5}
                  />
                  <span>{t(`sidebar.${group}`)}</span>
                </button>

                {!isCollapsed &&
                  convs.map((conv) => (
                    <ConversationItem
                      key={conv.id}
                      conversation={conv}
                      active={conv.id === activeConversationId}
                      isEditing={editingId === conv.id}
                      editingTitle={editingTitle}
                      onEditingTitleChange={setEditingTitle}
                      onSelect={() => handleSelectConversation(conv.id)}
                      onDelete={() => handleDelete(conv.id)}
                      onPin={() => handlePin(conv)}
                      onRename={() => handleRenameStart(conv)}
                      onRenameSubmit={handleRenameSubmit}
                      onRenameCancel={() => { setEditingId(null); setEditingTitle(""); }}
                      t={t}
                    />
                  ))}
              </div>
            );
          })}
        </div>
      </ScrollArea>
    </div>
  );
}

function ConversationItem({
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
  t,
}: {
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
  t: (key: string) => string;
}) {
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
          <div className="flex size-[22px] shrink-0 items-center justify-center rounded-md">
            {conversation.pinned ? (
              <Pin className="size-3.5 text-muted-foreground" strokeWidth={1.5} />
            ) : conversation.provider_type ? (
              <ProviderIcon type={conversation.provider_type} className="size-4" />
            ) : (
              <span className="text-[12px]">💬</span>
            )}
          </div>
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
