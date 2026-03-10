import { create } from "zustand";
import { readConfig, writeConfig } from "@/lib/config";
import type { LayoutConfig } from "@/lib/config/types";
import type { ActivePage, SidebarMode } from "@/lib/config/types";

export type { ActivePage, SidebarMode };

interface LayoutState {
  /** --- Navigation & Page --- */
  activePage: ActivePage;
  setActivePage: (page: ActivePage) => void;

  /** Left nav sidebar mode */
  leftSidebarMode: SidebarMode;
  /** Backward-compat derived: true when sidebar is visible (full or mini) */
  leftSidebarOpen: boolean;
  leftSidebarWidth: number;
  /** Cmd+B: toggle between full <-> hidden (from mini -> full) */
  toggleLeftSidebar: () => void;
  /** Auto-collapse to icon strip (triggered when entering workspace conversation) */
  setLeftSidebarMini: () => void;
  /** Expand back to full sidebar */
  setLeftSidebarFull: () => void;
  setLeftSidebarWidth: (width: number) => void;

  /** History section in sidebar collapsed */
  historyCollapsed: boolean;
  toggleHistory: () => void;

  /** --- Conversation mode --- */
  chatWidth: number;
  setChatWidth: (width: number) => void;

  /** --- Workspace mode column widths --- */
  wsFileTreeWidth: number;
  wsChatWidth: number;
  setWsFileTreeWidth: (width: number) => void;
  setWsChatWidth: (width: number) => void;

  /** --- File panel --- */
  filePanelOpen: boolean;
  filePanelClosing: boolean;
  filePanelOpening: boolean;
  fileTreeWidth: number;
  filePreviewWidth: number;
  fileTreeOpen: boolean;
  filePreviewOpen: boolean;
  toggleFileTree: () => void;
  setFileTreeOpen: (open: boolean) => void;
  toggleFilePreview: () => void;
  setFilePreviewOpen: (open: boolean) => void;
  fileTreeShowHidden: boolean;
  setFileTreeShowHidden: (show: boolean) => void;
  toggleFilePanel: () => void;
  setFilePanelOpen: (open: boolean) => void;
  confirmFilePanelClosed: () => void;
  confirmFilePanelOpened: () => void;
  setFileTreeWidth: (width: number) => void;
  setFilePreviewWidth: (width: number) => void;

  /** --- Workspace selector overlay (session-only, not persisted) --- */
  workspaceSelectorOpen: boolean;
  setWorkspaceSelectorOpen: (open: boolean) => void;

  init: () => Promise<void>;
}

/* ---------- Column width constraints ---------- */

const SIDEBAR_MIN = 200;
const SIDEBAR_MAX = 400;

const CHAT_MIN = 360;
const CHAT_MAX = 1200;

const FILE_TREE_MIN = 200;
const FILE_TREE_MAX = 480;
const FILE_PREVIEW_MIN = 200;
const FILE_PREVIEW_MAX = 800;

const WS_FILE_TREE_MIN = 200;
const WS_FILE_TREE_MAX = 400;
const WS_CHAT_MIN = 300;
const WS_CHAT_MAX = 500;

export {
  SIDEBAR_MIN, SIDEBAR_MAX,
  CHAT_MIN, CHAT_MAX,
  FILE_TREE_MIN, FILE_TREE_MAX,
  FILE_PREVIEW_MIN, FILE_PREVIEW_MAX,
  WS_FILE_TREE_MIN, WS_FILE_TREE_MAX,
  WS_CHAT_MIN, WS_CHAT_MAX,
};

function persistLayout(state: LayoutState): void {
  const config: LayoutConfig = {
    leftSidebarMode: state.leftSidebarMode,
    leftSidebarOpen: state.leftSidebarOpen,
    leftSidebarWidth: state.leftSidebarWidth,
    chatWidth: state.chatWidth,
    filePanelOpen: state.filePanelOpen,
    fileTreeOpen: state.fileTreeOpen,
    filePreviewOpen: state.filePreviewOpen,
    fileTreeWidth: state.fileTreeWidth,
    filePreviewWidth: state.filePreviewWidth,
    fileTreeShowHidden: state.fileTreeShowHidden,
    activePage: state.activePage,
    historyCollapsed: state.historyCollapsed,
    wsFileTreeWidth: state.wsFileTreeWidth,
    wsChatWidth: state.wsChatWidth,
  };
  void writeConfig("layout", config);
}

export const useLayoutStore = create<LayoutState>()((set, get) => ({
  /* Navigation */
  activePage: "chat" as ActivePage,
  setActivePage: (page) => {
    set({ activePage: page });
    persistLayout(get());
  },

  /* Left sidebar */
  leftSidebarMode: "full" as SidebarMode,
  leftSidebarOpen: true,
  leftSidebarWidth: 260,
  toggleLeftSidebar: () => {
    set((s) => {
      const next: SidebarMode = s.leftSidebarMode === "hidden" ? "full" : "hidden";
      return { leftSidebarMode: next, leftSidebarOpen: next !== "hidden" };
    });
    persistLayout(get());
  },
  setLeftSidebarMini: () => {
    set({ leftSidebarMode: "mini", leftSidebarOpen: true });
    persistLayout(get());
  },
  setLeftSidebarFull: () => {
    set({ leftSidebarMode: "full", leftSidebarOpen: true });
    persistLayout(get());
  },
  setLeftSidebarWidth: (width) => {
    set({ leftSidebarWidth: Math.min(SIDEBAR_MAX, Math.max(SIDEBAR_MIN, width)) });
    persistLayout(get());
  },

  /* History section */
  historyCollapsed: false,
  toggleHistory: () => {
    set((s) => ({ historyCollapsed: !s.historyCollapsed }));
    persistLayout(get());
  },

  /* Conversation mode chat width */
  chatWidth: 640,
  setChatWidth: (width) => {
    set({ chatWidth: Math.min(CHAT_MAX, Math.max(CHAT_MIN, width)) });
    persistLayout(get());
  },

  /* Workspace mode column widths */
  wsFileTreeWidth: 280,
  wsChatWidth: 360,
  setWsFileTreeWidth: (width) => {
    set({ wsFileTreeWidth: Math.min(WS_FILE_TREE_MAX, Math.max(WS_FILE_TREE_MIN, width)) });
    persistLayout(get());
  },
  setWsChatWidth: (width) => {
    set({ wsChatWidth: Math.min(WS_CHAT_MAX, Math.max(WS_CHAT_MIN, width)) });
    persistLayout(get());
  },

  /* File panel */
  filePanelOpen: true,
  filePanelClosing: false,
  filePanelOpening: false,
  fileTreeWidth: 260,
  filePreviewWidth: 360,
  fileTreeOpen: true,
  filePreviewOpen: true,
  toggleFileTree: () => {
    set((s) => {
      const next = !s.fileTreeOpen;
      if (!next && !s.filePreviewOpen) return { fileTreeOpen: next, filePanelClosing: true };
      return { fileTreeOpen: next };
    });
    persistLayout(get());
  },
  setFileTreeOpen: (open) => {
    set((s) => {
      if (!open && !s.filePreviewOpen) return { fileTreeOpen: open, filePanelClosing: true };
      return { fileTreeOpen: open };
    });
    persistLayout(get());
  },
  toggleFilePreview: () => {
    set((s) => {
      const next = !s.filePreviewOpen;
      if (!next && !s.fileTreeOpen) return { filePreviewOpen: next, filePanelClosing: true };
      return { filePreviewOpen: next };
    });
    persistLayout(get());
  },
  setFilePreviewOpen: (open) => {
    set((s) => {
      if (!open && !s.fileTreeOpen) return { filePreviewOpen: open, filePanelClosing: true };
      return { filePreviewOpen: open };
    });
    persistLayout(get());
  },
  fileTreeShowHidden: true,
  setFileTreeShowHidden: (show) => {
    set({ fileTreeShowHidden: show });
    persistLayout(get());
  },
  toggleFilePanel: () => {
    set((s) => {
      if (s.filePanelOpen) return { filePanelClosing: true };
      return { filePanelOpen: true, filePanelOpening: true, fileTreeOpen: true };
    });
    persistLayout(get());
  },
  setFilePanelOpen: (open) => {
    if (open) {
      set({ filePanelOpen: true, fileTreeOpen: true });
    } else {
      set({ filePanelOpen: false });
    }
    persistLayout(get());
  },
  confirmFilePanelClosed: () => {
    set({ filePanelOpen: false, filePanelClosing: false });
    persistLayout(get());
  },
  confirmFilePanelOpened: () => set({ filePanelOpening: false }),
  setFileTreeWidth: (width) => {
    set({ fileTreeWidth: Math.min(FILE_TREE_MAX, Math.max(FILE_TREE_MIN, width)) });
    persistLayout(get());
  },
  setFilePreviewWidth: (width) => {
    set({ filePreviewWidth: Math.min(FILE_PREVIEW_MAX, Math.max(FILE_PREVIEW_MIN, width)) });
    persistLayout(get());
  },

  /* Workspace selector (session-only) */
  workspaceSelectorOpen: false,
  setWorkspaceSelectorOpen: (open) => set({ workspaceSelectorOpen: open }),

  init: async () => {
    const config = await readConfig<LayoutConfig>("layout");
    set({
      leftSidebarMode: config.leftSidebarMode ?? "full",
      leftSidebarOpen: (config.leftSidebarMode ?? "full") !== "hidden",
      leftSidebarWidth: config.leftSidebarWidth,
      chatWidth: config.chatWidth,
      filePanelOpen: config.filePanelOpen,
      fileTreeOpen: config.filePanelOpen ? true : config.fileTreeOpen,
      filePreviewOpen: config.filePreviewOpen,
      fileTreeWidth: config.fileTreeWidth,
      filePreviewWidth: config.filePreviewWidth,
      fileTreeShowHidden: config.fileTreeShowHidden,
      activePage: config.activePage ?? "chat",
      historyCollapsed: config.historyCollapsed ?? false,
      wsFileTreeWidth: config.wsFileTreeWidth ?? 280,
      wsChatWidth: config.wsChatWidth ?? 360,
    });
  },
}));
