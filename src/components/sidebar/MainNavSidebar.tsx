import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Search,
  SquarePen,
  FolderOpen,
  Blocks,
  ChevronRight,
  MessageSquare,
} from "lucide-react";
import { useState, useRef, useEffect, useCallback } from "react";
import { useDataStore } from "@/stores/dataStore";
import { useChatStore } from "@/stores/chatStore";
import { useLayoutStore, type ActivePage } from "@/stores/layoutStore";
import { useWorkspaceStore } from "@/stores/workspaceStore";
import { ConversationList } from "./ConversationList";
import { SidebarUserArea } from "./SidebarUserArea";

export function MainNavSidebar() {
  const { t } = useTranslation();
  const [searchQuery, setSearchQuery] = useState("");
  const [searchFocused, setSearchFocused] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);

  const activePage = useLayoutStore((s) => s.activePage);
  const setActivePage = useLayoutStore((s) => s.setActivePage);
  const historyCollapsed = useLayoutStore((s) => s.historyCollapsed);
  const toggleHistory = useLayoutStore((s) => s.toggleHistory);

  const setActiveConversation = useDataStore((s) => s.setActiveConversation);

  const selectWorkspace = useWorkspaceStore((s) => s.select);
  const activeWorkspace = useWorkspaceStore((s) => s.activeWorkspace);
  const setWorkspaceSelectorOpen = useLayoutStore((s) => s.setWorkspaceSelectorOpen);
  const isWorkspaceMode = activePage === "workspace";

  const handleNewChat = useCallback(() => {
    setActiveConversation(null);
    useChatStore.getState().reset();

    if (isWorkspaceMode && activeWorkspace && !activeWorkspace.is_default) {
      selectWorkspace(activeWorkspace.id, null);
    } else {
      setActivePage("chat");
    }
  }, [setActiveConversation, setActivePage, isWorkspaceMode, activeWorkspace, selectWorkspace]);

  const handleNavClick = useCallback(
    (page: ActivePage) => {
      if (page === "workspace") {
        // Always show workspace selector when clicking the workspace nav
        setWorkspaceSelectorOpen(true);
        setActiveConversation(null);
        useChatStore.getState().reset();
      }
      setActivePage(page);
    },
    [setActivePage, setWorkspaceSelectorOpen, setActiveConversation],
  );

  /* Cmd+F to focus search */
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "f") {
        const active = document.activeElement;
        if (active?.tagName === "INPUT" || active?.tagName === "TEXTAREA") {
          return;
        }
        e.preventDefault();
        searchRef.current?.focus();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  return (
    <div className="no-select flex h-full w-full flex-col overflow-hidden">
      {/* New Chat button */}
      <div className="px-3 pb-1.5 pt-2">
        <Button
          variant="outline"
          className="h-8 w-full justify-start gap-2 text-[13px] font-normal"
          onClick={handleNewChat}
        >
          <SquarePen className="size-4 shrink-0" strokeWidth={1.5} />
          <span className="truncate">
            {t("sidebar.newChat", "New Chat")}
          </span>
        </Button>
      </div>

      {/* 搜索框 — 始终显示 */}
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
            placeholder={t("sidebar.searchChats", "Search chats")}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-transparent text-[13px] placeholder:text-muted-foreground focus:outline-none"
            onFocus={() => setSearchFocused(true)}
            onBlur={() => setSearchFocused(false)}
          />
        </div>
      </div>

      {/* Nav menu items */}
      <div className="space-y-0.5 px-1.5 pb-1">
        {/* 对话导航项 */}
        <button
          onClick={() => setActivePage("chat")}
          className={cn(
            "flex w-full items-center gap-2.5 rounded-lg px-2.5 py-[7px] text-[13px] transition-colors",
            activePage === "chat"
              ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium"
              : "text-sidebar-foreground/80 hover:bg-sidebar-accent/50",
          )}
        >
          <MessageSquare className="size-4 shrink-0" strokeWidth={1.5} />
          <span className="truncate">{t("sidebar.chat", "对话")}</span>
        </button>

        {/* Workspace 导航项 */}
        <button
          className={cn(
            "flex w-full items-center gap-2.5 rounded-lg px-2.5 py-[7px] text-[13px] transition-colors",
            activePage === "workspace"
              ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium"
              : "text-sidebar-foreground/80 hover:bg-sidebar-accent/50",
          )}
          onClick={() => handleNavClick("workspace")}
        >
          <FolderOpen className="size-4 shrink-0" strokeWidth={1.5} />
          <span className="truncate">{t("sidebar.workspace", "工作区")}</span>
        </button>

        <button
          onClick={() => handleNavClick("extensions")}
          className={cn(
            "flex w-full items-center gap-2.5 rounded-lg px-2.5 py-[7px] text-[13px] transition-colors",
            activePage === "extensions"
              ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium"
              : "text-sidebar-foreground/80 hover:bg-sidebar-accent/50",
          )}
        >
          <Blocks className="size-4 shrink-0" strokeWidth={1.5} />
          <span className="truncate">{t("sidebar.extensionMarket", "Extension Market")}</span>
        </button>
      </div>

      {/* Chat History — 始终显示 */}
      <div className="space-y-0.5 px-1.5">
        <button
          onClick={toggleHistory}
          className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-[7px] text-[13px] text-sidebar-foreground/80 transition-colors hover:bg-sidebar-accent/50"
        >
          <MessageSquare className="size-4 shrink-0" strokeWidth={1.5} />
          <span className="truncate">{t("sidebar.chatHistory", "Chat History")}</span>
          <ChevronRight
            className={cn(
              "ml-auto size-3 text-muted-foreground transition-transform duration-200",
              !historyCollapsed && "rotate-90",
            )}
            strokeWidth={1.5}
          />
        </button>
      </div>

      {/* 对话列表 — 统一按时间排序展示所有对话 */}
      {!historyCollapsed && <ConversationList searchQuery={searchQuery} />}
      {historyCollapsed && <div className="min-h-0 flex-1" />}

      {/* Bottom user area */}
      <SidebarUserArea />
    </div>
  );
}
