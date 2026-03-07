import { useTranslation } from "react-i18next";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useState, useMemo } from "react";
import { useDataStore } from "@/stores/dataStore";
import { useChatStore } from "@/stores/chatStore";
import { useLayoutStore } from "@/stores/layoutStore";
import { ConversationItem } from "./ConversationItem";
import type { Conversation } from "@/db/types";

const GROUP_ORDER = ["pinned", "today", "yesterday", "earlier"] as const;

function groupConversations(conversations: Conversation[]): Record<string, Conversation[]> {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today.getTime() - 86400000);

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
    else group = "earlier";
    if (!groups[group]) groups[group] = [];
    groups[group]!.push(conv);
  }
  return groups;
}

interface ConversationListProps {
  searchQuery: string;
  /** 传入工作区路径时，只显示该工作区的对话 */
  workspacePath?: string;
}

export function ConversationList({ searchQuery, workspacePath }: ConversationListProps) {
  const { t } = useTranslation();
  const conversations = useDataStore((s) => s.conversations);
  const activeConversationId = useDataStore((s) => s.activeConversationId);
  const setActiveConversation = useDataStore((s) => s.setActiveConversation);
  const updateConversation = useDataStore((s) => s.updateConversation);
  const setPinned = useDataStore((s) => s.setPinned);
  const deleteConversation = useDataStore((s) => s.deleteConversation);
  const loadMessages = useChatStore((s) => s.loadMessages);
  const streamingConversationId = useChatStore((s) => s.streamingConversationId);
  const setActivePage = useLayoutStore((s) => s.setActivePage);

  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState("");

  const filteredConversations = useMemo(() => {
    let list = conversations;
    // 工作区过滤：只显示属于该工作区的对话
    if (workspacePath) {
      list = list.filter((c) => c.workspace_path === workspacePath);
    }
    if (!searchQuery.trim()) return list;
    const q = searchQuery.toLowerCase();
    return list.filter((c) => c.title?.toLowerCase().includes(q));
  }, [conversations, searchQuery, workspacePath]);

  const grouped = useMemo(
    () => groupConversations(filteredConversations),
    [filteredConversations],
  );

  const toggleGroup = (group: string) => {
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(group)) next.delete(group);
      else next.add(group);
      return next;
    });
  };

  const handleSelectConversation = (id: string) => {
    setActiveConversation(id);
    loadMessages(id);
    // 工作区模式下不切换页面，保持在工作区视图
    if (!workspacePath) {
      setActivePage("chat");
    }
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
    const title = editingTitle.trim();
    if (title) {
      await updateConversation(editingId, { title });
    }
    setEditingId(null);
    setEditingTitle("");
  };

  return (
    <ScrollArea className="min-h-0 flex-1">
      <div className="px-1.5 pb-2">
        {filteredConversations.length === 0 && (
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
                    isStreaming={conv.id === streamingConversationId}
                    isEditing={editingId === conv.id}
                    editingTitle={editingTitle}
                    onEditingTitleChange={setEditingTitle}
                    onSelect={() => handleSelectConversation(conv.id)}
                    onDelete={() => handleDelete(conv.id)}
                    onPin={() => handlePin(conv)}
                    onRename={() => handleRenameStart(conv)}
                    onRenameSubmit={handleRenameSubmit}
                    onRenameCancel={() => { setEditingId(null); setEditingTitle(""); }}
                  />
                ))}
            </div>
          );
        })}
      </div>
    </ScrollArea>
  );
}
