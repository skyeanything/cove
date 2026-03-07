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
  toggleFileTree: () => void;
  setFileTreeOpen: (open: boolean) => void;
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
const CHAT_MAX = 1200;

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
    set({ leftSidebarWidth: width });
    persistLayout(get());
  },

  chatWidth: 640,
  setChatWidth: (width) => {
    set({ chatWidth: Math.min(CHAT_MAX, Math.max(CHAT_MIN, width)) });
    persistLayout(get());
  },

  filePanelOpen: true,
  filePanelClosing: false,
  filePanelOpening: false,
  fileTreeWidth: 260,
  filePreviewWidth: 360,
  fileTreeOpen: true,
  toggleFileTree: () => {
    set((s) => ({ fileTreeOpen: !s.fileTreeOpen }));
    persistLayout(get());
  },
  setFileTreeOpen: (open) => {
    set({ fileTreeOpen: open });
    persistLayout(get());
  },
  fileTreeShowHidden: true,
  setFileTreeShowHidden: (show) => {
    set({ fileTreeShowHidden: show });
    persistLayout(get());
  },
  toggleFilePanel: () => {
    set((s) =>
      s.filePanelOpen
        ? { filePanelClosing: true }
        : { filePanelOpen: true, filePanelOpening: true },
    );
    persistLayout(get());
  },
  setFilePanelOpen: (open) => {
    set({ filePanelOpen: open });
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
    set({
      leftSidebarOpen: config.leftSidebarOpen,
      leftSidebarWidth: config.leftSidebarWidth,
      chatWidth: config.chatWidth,
      filePanelOpen: config.filePanelOpen,
      fileTreeOpen: config.fileTreeOpen,
      fileTreeWidth: config.fileTreeWidth,
      filePreviewWidth: config.filePreviewWidth,
      fileTreeShowHidden: config.fileTreeShowHidden,
    });
  },
}));
