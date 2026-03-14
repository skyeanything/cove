import { create } from "zustand";
import { readConfig, writeConfig } from "@/lib/config";
import type { LayoutConfig } from "@/lib/config/types";

interface LayoutState {
  leftSidebarOpen: boolean;
  leftSidebarWidth: number;
  toggleLeftSidebar: () => void;
  setLeftSidebarWidth: (width: number) => void;

  chatWidth: number;
  setChatWidth: (width: number) => void;

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
  init: () => Promise<void>;
}

const CHAT_MIN = 360;
const SIDEBAR_MIN_W = 200;

function getViewportWidth(): number {
  return typeof window !== "undefined" && window.innerWidth > 0
    ? window.innerWidth
    : 1440;
}

/** Sidebar max: 50% of viewport */
function getSidebarMax(): number {
  return Math.max(SIDEBAR_MIN_W, Math.floor(getViewportWidth() * 0.5));
}

/** Chat max: viewport minus actual sidebar width and a 100px buffer for file panel */
function getChatMax(sidebarWidth: number, sidebarOpen: boolean): number {
  const sidebar = sidebarOpen ? sidebarWidth : SIDEBAR_MIN_W;
  return Math.max(CHAT_MIN, getViewportWidth() - sidebar - 100);
}

const FILE_TREE_MIN = 200;
const FILE_TREE_MAX = 480;
const FILE_PREVIEW_MIN = 200;
const FILE_PREVIEW_MAX = 800;

function persistLayout(state: LayoutState): void {
  const config: LayoutConfig = {
    leftSidebarOpen: state.leftSidebarOpen,
    leftSidebarWidth: state.leftSidebarWidth,
    chatWidth: state.chatWidth,
    filePanelOpen: state.filePanelOpen,
    fileTreeOpen: state.fileTreeOpen,
    filePreviewOpen: state.filePreviewOpen,
    fileTreeWidth: state.fileTreeWidth,
    filePreviewWidth: state.filePreviewWidth,
    fileTreeShowHidden: state.fileTreeShowHidden,
  };
  void writeConfig("layout", config);
}

export const useLayoutStore = create<LayoutState>()((set, get) => ({
  leftSidebarOpen: true,
  leftSidebarWidth: 260,
  toggleLeftSidebar: () => {
    set((s) => ({ leftSidebarOpen: !s.leftSidebarOpen }));
    persistLayout(get());
  },
  setLeftSidebarWidth: (width) => {
    set({ leftSidebarWidth: Math.min(getSidebarMax(), Math.max(SIDEBAR_MIN_W, width)) });
    persistLayout(get());
  },

  chatWidth: 640,
  setChatWidth: (width) => {
    const s = get();
    const max = getChatMax(s.leftSidebarWidth, s.leftSidebarOpen);
    set({ chatWidth: Math.min(max, Math.max(CHAT_MIN, width)) });
    persistLayout(get());
  },

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
    set({
      fileTreeWidth: Math.min(FILE_TREE_MAX, Math.max(FILE_TREE_MIN, width)),
    });
    persistLayout(get());
  },
  setFilePreviewWidth: (width) => {
    set({
      filePreviewWidth: Math.min(
        FILE_PREVIEW_MAX,
        Math.max(FILE_PREVIEW_MIN, width),
      ),
    });
    persistLayout(get());
  },
  init: async () => {
    const config = await readConfig<LayoutConfig>("layout");
    const clampedSidebar = Math.min(getSidebarMax(), Math.max(SIDEBAR_MIN_W, config.leftSidebarWidth));
    const chatMax = getChatMax(clampedSidebar, config.leftSidebarOpen);
    set({
      leftSidebarOpen: config.leftSidebarOpen,
      leftSidebarWidth: clampedSidebar,
      chatWidth: Math.min(chatMax, Math.max(CHAT_MIN, config.chatWidth)),
      filePanelOpen: config.filePanelOpen,
      fileTreeOpen: config.filePanelOpen ? true : config.fileTreeOpen,
      filePreviewOpen: config.filePreviewOpen,
      fileTreeWidth: config.fileTreeWidth,
      filePreviewWidth: config.filePreviewWidth,
      fileTreeShowHidden: config.fileTreeShowHidden,
    });
  },
}));
