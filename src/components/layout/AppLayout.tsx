import { listen } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";
import { useLayoutStore } from "@/stores/layoutStore";
import { useDataStore } from "@/stores/dataStore";
import { useChatStore } from "@/stores/chatStore";
import { useWorkspaceStore } from "@/stores/workspaceStore";
import { useFilePreviewStore } from "@/stores/filePreviewStore";
import { LeftSidebar } from "@/components/sidebar/LeftSidebar";
import { SearchMessagesDialog } from "@/components/sidebar/SearchMessagesDialog";
import { ChatArea } from "@/components/chat/ChatArea";
import { FilePanelHeader } from "@/components/preview/FilePanelHeader";
import { FileTreePanel } from "@/components/preview/FileTreePanel";
import { FilePreviewPanel } from "@/components/preview/FilePreviewPanel";
import { ResizeHandle } from "./ResizeHandle";
import { WindowControls } from "./WindowControls";
import { openSettingsWindow } from "@/lib/settings-window";
import { useEffect, useLayoutEffect, useRef, useState, useCallback } from "react";

const SIDEBAR_MIN = 200;
const SIDEBAR_MAX = 400;
const CHAT_MIN = 480;
const CHAT_MAX = 1200;
const FILE_TREE_MIN = 200;
const FILE_TREE_MAX = 480;
const FILE_PREVIEW_MIN = 200;

export function AppLayout() {
  const leftOpen = useLayoutStore((s) => s.leftSidebarOpen);
  const toggleLeft = useLayoutStore((s) => s.toggleLeftSidebar);
  const setActiveConversation = useDataStore((s) => s.setActiveConversation);
  const leftSidebarWidth = useLayoutStore((s) => s.leftSidebarWidth);
  const setLeftSidebarWidth = useLayoutStore((s) => s.setLeftSidebarWidth);
  const chatWidth = useLayoutStore((s) => s.chatWidth);
  const setChatWidth = useLayoutStore((s) => s.setChatWidth);
  const filePanelOpen = useLayoutStore((s) => s.filePanelOpen);
  const filePanelClosing = useLayoutStore((s) => s.filePanelClosing) ?? false;
  const filePanelOpening = useLayoutStore((s) => s.filePanelOpening) ?? false;
  const setFilePanelOpen = useLayoutStore((s) => s.setFilePanelOpen);
  const confirmFilePanelClosed = useLayoutStore((s) => s.confirmFilePanelClosed);
  const confirmFilePanelOpened = useLayoutStore((s) => s.confirmFilePanelOpened);
  const fileTreeWidth = useLayoutStore((s) => s.fileTreeWidth);
  const setFileTreeWidth = useLayoutStore((s) => s.setFileTreeWidth);

  const [modelSelectorOpen, setModelSelectorOpen] = useState(false);
  const [searchMessagesOpen, setSearchMessagesOpen] = useState(false);
  const middleSectionRef = useRef<HTMLDivElement>(null);
  const [chatColumnCloseTarget, setChatColumnCloseTarget] = useState<number | null>(null);
  const [chatColumnOpenTarget, setChatColumnOpenTarget] = useState<number | null>(null);
  const closeConfirmedRef = useRef(false);

  // 关闭：测量总宽，rAF 后设目标，边框向右滑
  useLayoutEffect(() => {
    if (!filePanelClosing) {
      setChatColumnCloseTarget(null);
      closeConfirmedRef.current = false;
      return;
    }
    const w = middleSectionRef.current?.offsetWidth;
    if (w == null || w <= 0) return;
    const id = requestAnimationFrame(() => setChatColumnCloseTarget(w));
    return () => cancelAnimationFrame(id);
  }, [filePanelClosing]);

  // 展开：先 100% 占满，rAF 后缩回 chatWidth，边框从左滑到右
  useLayoutEffect(() => {
    if (!filePanelOpening) {
      setChatColumnOpenTarget(null);
      return;
    }
    setChatColumnOpenTarget(null);
    const id = requestAnimationFrame(() => setChatColumnOpenTarget(chatWidth));
    return () => cancelAnimationFrame(id);
  }, [filePanelOpening, chatWidth]);

  const handleNewChat = useCallback(() => {
    setActiveConversation(null);
    useChatStore.getState().reset();
  }, [setActiveConversation]);

  const activeWorkspace = useWorkspaceStore((s) => s.activeWorkspace);
  const setWorkspaceRoot = useFilePreviewStore((s) => s.setWorkspaceRoot);

  useEffect(() => {
    setWorkspaceRoot(activeWorkspace?.path ?? null);
  }, [activeWorkspace?.path, setWorkspaceRoot]);

  // 工作区变化时启/停文件监听
  useEffect(() => {
    const root = activeWorkspace?.path?.trim() ?? "";
    invoke("watch_workspace_command", { args: { workspaceRoot: root } }).catch(() => {});
  }, [activeWorkspace?.path]);

  // 响应式：窗口过窄时自动收起文件面板
  useEffect(() => {
    const WIDTH_THRESHOLD = 1000;
    const check = () => {
      if (window.innerWidth < WIDTH_THRESHOLD && useLayoutStore.getState().filePanelOpen) {
        setFilePanelOpen(false);
      }
    };
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, [setFilePanelOpen]);

  // 实时预览：监听 workspace-file-changed，刷新预览或处理删除
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
    return () => {
      unlistenPromise.then((u) => u());
    };
  }, []);

  // 监听菜单栏「Settings」点击（macOS 顶部菜单 Cove -> Settings）
  useEffect(() => {
    const unlistenPromise = listen("open-settings", () => {
      openSettingsWindow();
    });
    return () => {
      unlistenPromise.then((unlisten) => unlisten());
    };
  }, []);

  const chatColumnTargetWidth: number | string = filePanelClosing && chatColumnCloseTarget != null
    ? chatColumnCloseTarget
    : filePanelOpening
      ? (chatColumnOpenTarget ?? "100%")
      : chatWidth;
  const handleChatColumnTransitionEnd = useCallback(
    (e: React.TransitionEvent) => {
      if (e.propertyName !== "width") return;
      if (filePanelClosing && !closeConfirmedRef.current) {
        closeConfirmedRef.current = true;
        confirmFilePanelClosed();
      }
      if (filePanelOpening) {
        confirmFilePanelOpened();
      }
    },
    [filePanelClosing, filePanelOpening, confirmFilePanelClosed, confirmFilePanelOpened],
  );

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const meta = e.metaKey || e.ctrlKey;

      if (meta && !e.shiftKey && e.key === "b") {
        e.preventDefault();
        toggleLeft();
      }

      // ⌘N new chat
      if (meta && e.key === "n") {
        e.preventDefault();
        handleNewChat();
      }

      // ⌘⇧F full-text search messages
      if (meta && e.shiftKey && e.key === "F") {
        e.preventDefault();
        setSearchMessagesOpen(true);
      }

      // ⌘/ to open model selector
      if (meta && e.key === "/") {
        e.preventDefault();
        setModelSelectorOpen(true);
      }

      // ⌘, to open settings
      if (meta && e.key === ",") {
        e.preventDefault();
        openSettingsWindow();
      }
    };

    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [toggleLeft, handleNewChat]);

  return (
    <div className="relative flex h-screen w-screen overflow-hidden bg-background">
      <WindowControls onToggleSidebar={toggleLeft} onNewChat={handleNewChat} />

      {leftOpen ? (
        <div
          className="relative flex shrink-0 flex-col overflow-hidden border-r border-sidebar-border"
          style={{ width: leftSidebarWidth, minWidth: SIDEBAR_MIN }}
        >
          <LeftSidebar open />
          <ResizeHandle
            side="left"
            currentWidth={leftSidebarWidth}
            onResize={setLeftSidebarWidth}
            minWidth={SIDEBAR_MIN}
            maxWidth={SIDEBAR_MAX}
          />
        </div>
      ) : (
        <LeftSidebar open={false} />
      )}

      <div ref={middleSectionRef} className="flex min-w-0 flex-1">
        {filePanelOpen || filePanelClosing ? (
          <>
            <div
              className="relative flex min-w-0 shrink-0 flex-col overflow-hidden border-r border-border transition-[width] duration-300 ease-out"
              style={{
                width: chatColumnTargetWidth,
                minWidth: CHAT_MIN,
                willChange: filePanelClosing || filePanelOpening ? "width" : undefined,
              }}
              onTransitionEnd={handleChatColumnTransitionEnd}
            >
              <ChatArea
                leftSidebarOpen={leftOpen}
                modelSelectorOpen={modelSelectorOpen}
                onModelSelectorOpenChange={setModelSelectorOpen}
              />
              <ResizeHandle
                side="left"
                currentWidth={chatWidth}
                onResize={setChatWidth}
                minWidth={CHAT_MIN}
                maxWidth={CHAT_MAX}
              />
            </div>
            <div className="flex min-w-0 flex-1 flex-col overflow-hidden bg-background">
              <div
                className="flex min-h-0 min-w-0 flex-1 flex-col"
                style={{
                  opacity: filePanelClosing || filePanelOpening ? 0 : 1,
                  visibility: filePanelClosing || filePanelOpening ? "hidden" : "visible",
                }}
              >
                <FilePanelHeader />
                <div className="flex min-h-0 flex-1">
                  <div
                    className="relative flex shrink-0 flex-col overflow-hidden"
                    style={{ width: fileTreeWidth, minWidth: FILE_TREE_MIN }}
                  >
                    <FileTreePanel />
                    <ResizeHandle
                      side="left"
                      currentWidth={fileTreeWidth}
                      onResize={setFileTreeWidth}
                      minWidth={FILE_TREE_MIN}
                      maxWidth={FILE_TREE_MAX}
                    />
                  </div>
                  <div
                    className="relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden border-l border-border"
                    style={{ minWidth: FILE_PREVIEW_MIN }}
                  >
                    <FilePreviewPanel />
                  </div>
                </div>
              </div>
            </div>
          </>
        ) : (
          <ChatArea
            leftSidebarOpen={leftOpen}
            modelSelectorOpen={modelSelectorOpen}
            onModelSelectorOpenChange={setModelSelectorOpen}
          />
        )}
      </div>

      <SearchMessagesDialog
        open={searchMessagesOpen}
        onOpenChange={setSearchMessagesOpen}
      />
    </div>
  );
}
