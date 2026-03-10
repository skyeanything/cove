import { listen } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { useLayoutStore, SIDEBAR_MIN, SIDEBAR_MAX } from "@/stores/layoutStore";
import { useDataStore } from "@/stores/dataStore";
import { useChatStore } from "@/stores/chatStore";
import { useWorkspaceStore } from "@/stores/workspaceStore";
import { useFilePreviewStore } from "@/stores/filePreviewStore";
import { useNavigationStore } from "@/stores/navigationStore";
import { MainNavSidebar } from "@/components/sidebar/MainNavSidebar";
import { MiniNavSidebar } from "@/components/sidebar/MiniNavSidebar";
import { SearchMessagesDialog } from "@/components/sidebar/SearchMessagesDialog";
import { ConversationContent } from "./ConversationContent";
import { WorkspaceContent } from "./WorkspaceContent";
import { ResizeHandle } from "./ResizeHandle";
import { openSettingsWindow } from "@/lib/settings-window";
import { useEffect, useState, useCallback, useRef, lazy, Suspense } from "react";
import { PanelLeft, PanelRight } from "lucide-react";

const ExtensionMarketPage = lazy(
  () => import("@/components/extensions/ExtensionMarketPage"),
);

export function AppLayout() {
  const activePage = useLayoutStore((s) => s.activePage);
  const leftSidebarMode = useLayoutStore((s) => s.leftSidebarMode);
  const toggleLeft = useLayoutStore((s) => s.toggleLeftSidebar);
  const setLeftSidebarFull = useLayoutStore((s) => s.setLeftSidebarFull);
  const leftSidebarWidth = useLayoutStore((s) => s.leftSidebarWidth);
  const setLeftSidebarWidth = useLayoutStore((s) => s.setLeftSidebarWidth);
  const setActivePage = useLayoutStore((s) => s.setActivePage);

  const setActiveConversation = useDataStore((s) => s.setActiveConversation);
  const activeConversationId = useDataStore((s) => s.activeConversationId);
  const activeWorkspace = useWorkspaceStore((s) => s.activeWorkspace);
  const setWorkspaceRoot = useFilePreviewStore((s) => s.setWorkspaceRoot);

  const [searchMessagesOpen, setSearchMessagesOpen] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);

  /* Detect macOS fullscreen to collapse traffic-light spacer */
  useEffect(() => {
    const win = getCurrentWindow();
    win.isFullscreen().then(setIsFullscreen).catch(() => {});
    let unlisten: (() => void) | undefined;
    win.listen("tauri://resize", async () => {
      try { setIsFullscreen(await win.isFullscreen()); } catch { /* ignore */ }
    }).then((u) => { unlisten = u; }).catch(() => {});
    return () => unlisten?.();
  }, []);

  /* ── Navigation history ── */
  const navInitialized = useRef(false);
  useEffect(() => {
    // Push to nav history whenever page or conversation changes
    // Skip the very first render to avoid double-pushing the initial state
    if (!navInitialized.current) {
      navInitialized.current = true;
      useNavigationStore.getState().push({ page: activePage, conversationId: activeConversationId });
      return;
    }
    useNavigationStore.getState().push({ page: activePage, conversationId: activeConversationId });
  }, [activePage, activeConversationId]);

  const handleGoBack = useCallback(() => {
    const entry = useNavigationStore.getState().goBack();
    if (entry) {
      setActivePage(entry.page);
      setActiveConversation(entry.conversationId);
      if (entry.conversationId) {
        useChatStore.getState().loadMessages(entry.conversationId);
      } else {
        useChatStore.getState().reset();
      }
    }
  }, [setActivePage, setActiveConversation]);

  const handleGoForward = useCallback(() => {
    const entry = useNavigationStore.getState().goForward();
    if (entry) {
      setActivePage(entry.page);
      setActiveConversation(entry.conversationId);
      if (entry.conversationId) {
        useChatStore.getState().loadMessages(entry.conversationId);
      } else {
        useChatStore.getState().reset();
      }
    }
  }, [setActivePage, setActiveConversation]);

  /* ── Context-aware new chat ── */
  const handleNewChat = useCallback(() => {
    setActiveConversation(null);
    useChatStore.getState().reset();

    const ws = useWorkspaceStore.getState().activeWorkspace;
    if (activePage === "workspace" && ws && !ws.is_default) {
      useWorkspaceStore.getState().select(ws.id, null);
    } else {
      setActivePage("chat");
    }
  }, [setActiveConversation, setActivePage, activePage]);

  /* Sync workspace root to filePreviewStore */
  useEffect(() => {
    setWorkspaceRoot(activeWorkspace?.path ?? null);
  }, [activeWorkspace?.path, setWorkspaceRoot]);

  /* Start/stop workspace file watcher */
  useEffect(() => {
    const root = activeWorkspace?.path?.trim() ?? "";
    invoke("watch_workspace_command", { args: { workspaceRoot: root } }).catch(() => {});
  }, [activeWorkspace?.path]);

  /* File change events: refresh preview or handle deletion */
  useEffect(() => {
    const unlistenPromise = listen<{ path: string; kind: string }>(
      "workspace-file-changed",
      (event) => {
        const { path, kind } = event.payload ?? {};
        if (!path) return;
        const store = useFilePreviewStore.getState();
        if (kind === "modify") {
          store.invalidate(path);
        } else if (kind === "remove") {
          if (store.selectedPath === path) {
            store.setSelected(null);
            store.setPreviewError("file-deleted");
          }
          store.invalidate(path);
        }
      },
    );
    return () => { unlistenPromise.then((u) => u()); };
  }, []);

  /* macOS menu bar Settings */
  useEffect(() => {
    const unlistenPromise = listen("open-settings", () => openSettingsWindow());
    return () => { unlistenPromise.then((u) => u()); };
  }, []);

  /* Global keyboard shortcuts */
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const meta = e.metaKey || e.ctrlKey;
      if (meta && !e.shiftKey && e.key === "b") {
        e.preventDefault();
        toggleLeft();
      }
      if (meta && e.key === "n") {
        e.preventDefault();
        handleNewChat();
      }
      if (meta && e.shiftKey && e.key === "F") {
        e.preventDefault();
        setSearchMessagesOpen(true);
      }
      // macOS: ⌘,  |  Windows/Linux: Ctrl+Shift+,
      // Use e.code ("Comma") instead of e.key (",") because Shift changes e.key to "<" on standard keyboards
      const isMac = /Mac|iPhone|iPad/.test(navigator.userAgent);
      if (
        (isMac && e.metaKey && !e.shiftKey && e.code === "Comma") ||
        (!isMac && e.ctrlKey && e.shiftKey && e.code === "Comma")
      ) {
        e.preventDefault();
        openSettingsWindow();
      }
      if (meta && e.shiftKey && e.key === "W") {
        e.preventDefault();
        setActivePage(activePage === "workspace" ? "chat" : "workspace");
      }
      if (meta && e.shiftKey && e.key === "E") {
        e.preventDefault();
        setActivePage(activePage === "extensions" ? "chat" : "extensions");
      }
      // Navigation history: Cmd+[ / Cmd+]
      if (meta && !e.shiftKey && e.key === "[") {
        e.preventDefault();
        handleGoBack();
      }
      if (meta && !e.shiftKey && e.key === "]") {
        e.preventDefault();
        handleGoForward();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [toggleLeft, handleNewChat, handleGoBack, handleGoForward, activePage, setActivePage]);

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-background">
      {/* ═══════════════════════════════════════════════════════════════
          Global Title Bar (40px)
          [traffic-light spacer?] [sidebar toggle] [← back] [→ forward]
          Remaining area is a drag region for window movement.
          ═══════════════════════════════════════════════════════════════ */}
      <div
        data-tauri-drag-region
        className="flex h-10 w-full shrink-0 items-center border-b border-border"
      >
        {/* Traffic-light safe zone — hidden in fullscreen */}
        {!isFullscreen && <div className="w-[76px] shrink-0" />}

        {/* Sidebar toggle */}
        <div className="flex items-center px-1.5">
          <button
            onClick={leftSidebarMode === "full" ? toggleLeft : setLeftSidebarFull}
            className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
            title={leftSidebarMode === "full" ? "收起侧边栏 (⌘B)" : "展开侧边栏 (⌘B)"}
          >
            {leftSidebarMode === "full"
              ? <PanelLeft className="size-[18px]" strokeWidth={1.5} />
              : <PanelRight className="size-[18px]" strokeWidth={1.5} />
            }
          </button>
        </div>
      </div>

      {/* ═══════════════════════════════════════════════════════════════
          Main body — sidebar (left) + content (right)
          ═══════════════════════════════════════════════════════════════ */}
      <div className="relative flex min-h-0 flex-1">
        {/* Full sidebar */}
        {leftSidebarMode === "full" && (
          <div
            className="relative flex shrink-0 flex-col overflow-hidden border-r border-sidebar-border transition-[width,min-width] duration-200 ease-out"
            style={{ width: leftSidebarWidth, minWidth: SIDEBAR_MIN }}
          >
            <MainNavSidebar />
            <ResizeHandle
              side="left"
              currentWidth={leftSidebarWidth}
              onResize={setLeftSidebarWidth}
              minWidth={SIDEBAR_MIN}
              maxWidth={SIDEBAR_MAX}
            />
          </div>
        )}

        {/* Mini (52px icon-strip) sidebar */}
        {leftSidebarMode === "mini" && (
          <div className="relative flex w-[52px] shrink-0 flex-col overflow-hidden">
            <MiniNavSidebar />
          </div>
        )}

        {/* Main content — switches by activePage */}
        <div className="flex min-w-0 flex-1">
          {activePage === "chat" && <ConversationContent />}
          {activePage === "workspace" && <WorkspaceContent />}
          {activePage === "extensions" && (
            <Suspense fallback={
              <div className="flex flex-1 items-center justify-center text-muted-foreground">
                Loading...
              </div>
            }>
              <ExtensionMarketPage />
            </Suspense>
          )}
        </div>
      </div>

      <SearchMessagesDialog
        open={searchMessagesOpen}
        onOpenChange={setSearchMessagesOpen}
      />
    </div>
  );
}
