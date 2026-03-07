import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import {
  Search,
  SquarePen,
  FolderOpen,
  Blocks,
} from "lucide-react";
import { useState, useRef, useEffect, useCallback } from "react";
import { useDataStore } from "@/stores/dataStore";
import { useChatStore } from "@/stores/chatStore";
import { useLayoutStore, type ActivePage } from "@/stores/layoutStore";
import { useWorkspaceStore } from "@/stores/workspaceStore";
import { useFilePreviewStore } from "@/stores/filePreviewStore";
import { ConversationList } from "./ConversationList";
import { SidebarUserArea } from "./SidebarUserArea";

export function MainNavSidebar() {
  const { t } = useTranslation();
  const [searchQuery, setSearchQuery] = useState("");
  const [searchFocused, setSearchFocused] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);

  const activePage = useLayoutStore((s) => s.activePage);
  const setActivePage = useLayoutStore((s) => s.setActivePage);
  const setActiveConversation = useDataStore((s) => s.setActiveConversation);

  const selectWorkspace = useWorkspaceStore((s) => s.select);
  const activeWorkspace = useWorkspaceStore((s) => s.activeWorkspace);
  const setWorkspaceSelectorOpen = useLayoutStore((s) => s.setWorkspaceSelectorOpen);
  const isWorkspaceMode = activePage === "workspace";

  const handleNewChat = useCallback(() => {
    setActiveConversation(null);
    useChatStore.getState().reset();
    useFilePreviewStore.getState().clearSelection();

    if (isWorkspaceMode && activeWorkspace && !activeWorkspace.is_default) {
      selectWorkspace(activeWorkspace.id, null);
    } else {
      setActivePage("chat");
    }
  }, [setActiveConversation, setActivePage, isWorkspaceMode, activeWorkspace, selectWorkspace]);

  const handleNavClick = useCallback(
    (page: ActivePage) => {
      if (page === "workspace") {
        // Only open selector if no real workspace is currently active
        if (!activeWorkspace || activeWorkspace.is_default) {
          setWorkspaceSelectorOpen(true);
        }
        setActiveConversation(null);
        useChatStore.getState().reset();
      }
      setActivePage(page);
    },
    [setActivePage, setWorkspaceSelectorOpen, setActiveConversation, activeWorkspace],
  );

  /* Cmd+F to focus search */
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "f") {
        const active = document.activeElement;
        if (active?.tagName === "INPUT" || active?.tagName === "TEXTAREA") return;
        e.preventDefault();
        searchRef.current?.focus();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  return (
    <div className="no-select flex h-full w-full flex-col overflow-hidden">
      {/* Nav items */}
      <div className="space-y-0.5 px-1.5 pt-2">
        {/* 新对话 — 与工作区/扩展市场同级样式 */}
        <button
          onClick={handleNewChat}
          className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-[7px] text-[13px] text-sidebar-foreground/80 transition-colors hover:bg-sidebar-accent/50"
        >
          <SquarePen className="size-4 shrink-0" strokeWidth={1.5} />
          <span className="truncate">{t("sidebar.newChat", "新对话")}</span>
        </button>

        {/* 工作区 */}
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

        {/* 扩展市场 */}
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
          <span className="truncate">{t("sidebar.extensionMarket", "扩展市场")}</span>
        </button>
      </div>

      {/* 对话列表 */}
      <ConversationList searchQuery={searchQuery} />

      {/* 搜索框 — 历史对话下方，与历史记录关联 */}
      <div className="px-3 py-2">
        <div
          className={cn(
            "flex h-[30px] items-center gap-2 rounded-md bg-background-tertiary/70 px-2.5 text-[13px] transition-colors",
            searchFocused && "bg-background-tertiary ring-1 ring-accent/20",
          )}
        >
          <Search className="size-3.5 shrink-0 text-muted-foreground" strokeWidth={1.5} />
          <input
            ref={searchRef}
            type="text"
            placeholder={t("sidebar.searchChats", "搜索聊天")}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-transparent text-[13px] placeholder:text-muted-foreground focus:outline-none"
            onFocus={() => setSearchFocused(true)}
            onBlur={() => setSearchFocused(false)}
          />
        </div>
      </div>

      {/* Bottom user area */}
      <SidebarUserArea />
    </div>
  );
}
