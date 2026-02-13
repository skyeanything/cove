import { listen } from "@tauri-apps/api/event";
import { useLayoutStore } from "@/stores/layoutStore";
import { useDataStore } from "@/stores/dataStore";
import { useChatStore } from "@/stores/chatStore";
import { LeftSidebar } from "@/components/sidebar/LeftSidebar";
import { SearchMessagesDialog } from "@/components/sidebar/SearchMessagesDialog";
import { ChatArea } from "@/components/chat/ChatArea";
import { WindowControls } from "./WindowControls";
import { openSettingsWindow } from "@/lib/settings-window";
import { useEffect, useState, useCallback } from "react";

export function AppLayout() {
  const leftOpen = useLayoutStore((s) => s.leftSidebarOpen);
  const toggleLeft = useLayoutStore((s) => s.toggleLeftSidebar);
  const setActiveConversation = useDataStore((s) => s.setActiveConversation);

  const [modelSelectorOpen, setModelSelectorOpen] = useState(false);
  const [searchMessagesOpen, setSearchMessagesOpen] = useState(false);

  const handleNewChat = useCallback(() => {
    setActiveConversation(null);
    useChatStore.getState().reset();
  }, [setActiveConversation]);

  // 监听菜单栏「Settings」点击（macOS 顶部菜单 Cove -> Settings）
  useEffect(() => {
    const unlistenPromise = listen("open-settings", () => {
      openSettingsWindow();
    });
    return () => {
      unlistenPromise.then((unlisten) => unlisten());
    };
  }, []);

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
      {/* Fixed window controls — always top-left after traffic lights */}
      <WindowControls onToggleSidebar={toggleLeft} onNewChat={handleNewChat} />

      <LeftSidebar open={leftOpen} />

      <ChatArea
        leftSidebarOpen={leftOpen}
        modelSelectorOpen={modelSelectorOpen}
        onModelSelectorOpenChange={setModelSelectorOpen}
      />

      <SearchMessagesDialog
        open={searchMessagesOpen}
        onOpenChange={setSearchMessagesOpen}
      />
    </div>
  );
}
