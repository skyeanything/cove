import { useLayoutStore, WS_FILE_TREE_MIN, WS_FILE_TREE_MAX, WS_CHAT_MIN, WS_CHAT_MAX } from "@/stores/layoutStore";
import { useWorkspaceStore } from "@/stores/workspaceStore";
import { useDataStore } from "@/stores/dataStore";
import { useChatStore } from "@/stores/chatStore";
import { FileTreePanel } from "@/components/preview/FileTreePanel";
import { FilePreviewPanel } from "@/components/preview/FilePreviewPanel";
import { ChatArea } from "@/components/chat/ChatArea";
import { ResizeHandle } from "./ResizeHandle";
import { useEffect, useState } from "react";
import { conversationRepo } from "@/db/repos/conversationRepo";
import type { Conversation } from "@/db/types";
import { MessageSquare } from "lucide-react";
import { useTranslation } from "react-i18next";

/** Workspace history hint: shown above the chat input when no active conversation */
function WorkspaceHistorySuggestion() {
  const { t } = useTranslation();
  const activeWorkspace = useWorkspaceStore((s) => s.activeWorkspace);
  const activeConversationId = useDataStore((s) => s.activeConversationId);
  const workspaceSelectorOpen = useLayoutStore((s) => s.workspaceSelectorOpen);
  const setActiveConversation = useDataStore((s) => s.setActiveConversation);
  const [conversations, setConversations] = useState<Conversation[]>([]);

  // Fetch workspace conversations whenever workspace changes
  useEffect(() => {
    if (!activeWorkspace?.path) { setConversations([]); return; }
    conversationRepo.getByWorkspacePath(activeWorkspace.path)
      .then((convs) => setConversations(convs.slice(0, 5)))
      .catch(() => setConversations([]));
  }, [activeWorkspace?.path]);

  // Hide when selector is open, conversation is active, or no history
  if (workspaceSelectorOpen || activeConversationId !== null || conversations.length === 0) {
    return null;
  }

  return (
    <div className="mx-3 mb-2 rounded-lg border border-border bg-background-tertiary/50 px-3 py-2.5">
      <p className="mb-1.5 text-[11px] font-medium text-muted-foreground">
        {t("workspace.recentConversations", "该工作区的历史会话")}
      </p>
      <div className="space-y-0.5">
        {conversations.map((conv) => (
          <button
            key={conv.id}
            type="button"
            onClick={() => {
              setActiveConversation(conv.id);
              useChatStore.getState().loadMessages(conv.id);
            }}
            className="flex w-full items-center gap-2 rounded px-2 py-1 text-left text-[12px] text-foreground hover:bg-accent"
          >
            <MessageSquare className="size-3 shrink-0 text-muted-foreground" strokeWidth={1.5} />
            <span className="truncate">{conv.title ?? t("sidebar.untitled", "新对话")}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

/**
 * Workspace mode: 3 columns (FileTree | Preview/Edit | Chat).
 * Chat is on the right side, matching IDE-plugin conventions.
 */
export function WorkspaceContent() {
  const wsFileTreeWidth = useLayoutStore((s) => s.wsFileTreeWidth);
  const setWsFileTreeWidth = useLayoutStore((s) => s.setWsFileTreeWidth);
  const wsChatWidth = useLayoutStore((s) => s.wsChatWidth);
  const setWsChatWidth = useLayoutStore((s) => s.setWsChatWidth);
  const [modelSelectorOpen, setModelSelectorOpen] = useState(false);

  return (
    <div className="flex min-w-0 flex-1">
      {/* Column 1: File tree */}
      <div
        className="relative flex shrink-0 flex-col overflow-hidden border-r border-border"
        style={{ width: wsFileTreeWidth, minWidth: WS_FILE_TREE_MIN }}
      >
        <FileTreePanel />
        <ResizeHandle
          side="left"
          currentWidth={wsFileTreeWidth}
          onResize={setWsFileTreeWidth}
          minWidth={WS_FILE_TREE_MIN}
          maxWidth={WS_FILE_TREE_MAX}
        />
      </div>

      {/* Column 2: File preview / edit (auto-fill) */}
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <FilePreviewPanel />
      </div>

      {/* Column 3: Chat area (right side) */}
      <div
        className="relative flex shrink-0 flex-col overflow-hidden border-l border-border"
        style={{ width: wsChatWidth, minWidth: WS_CHAT_MIN }}
      >
        <ChatArea
          modelSelectorOpen={modelSelectorOpen}
          onModelSelectorOpenChange={setModelSelectorOpen}
          aboveInput={<WorkspaceHistorySuggestion />}
        />
        <ResizeHandle
          side="right"
          currentWidth={wsChatWidth}
          onResize={setWsChatWidth}
          minWidth={WS_CHAT_MIN}
          maxWidth={WS_CHAT_MAX}
        />
      </div>
    </div>
  );
}
