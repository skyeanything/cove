import { create } from "zustand";
import { persist } from "zustand/middleware";

interface LayoutState {
  leftSidebarOpen: boolean;
  leftSidebarWidth: number;
  toggleLeftSidebar: () => void;
  setLeftSidebarWidth: (width: number) => void;

  /** 中间聊天区宽度（仅当文件面板打开时可拖拽） */
  chatWidth: number;
  setChatWidth: (width: number) => void;

  /** 文件面板（树+预览）是否展开 */
  filePanelOpen: boolean;
  /** 是否正在播放关闭动画（动画结束后再设为 false 并关闭面板） */
  filePanelClosing: boolean;
  /** 是否正在播放展开动画（边框从左滑到右，动画结束后再设为 false） */
  filePanelOpening: boolean;
  fileTreeWidth: number;
  filePreviewWidth: number;
  /** 目录树是否显示隐藏文件（以 . 开头） */
  fileTreeShowHidden: boolean;
  setFileTreeShowHidden: (show: boolean) => void;
  toggleFilePanel: () => void;
  setFilePanelOpen: (open: boolean) => void;
  /** 关闭动画结束后调用，真正收起面板 */
  confirmFilePanelClosed: () => void;
  /** 展开动画结束后调用 */
  confirmFilePanelOpened: () => void;
  setFileTreeWidth: (width: number) => void;
  setFilePreviewWidth: (width: number) => void;
}

const CHAT_MIN = 360;
const CHAT_MAX = 1200;

const FILE_TREE_MIN = 200;
const FILE_TREE_MAX = 480;
const FILE_PREVIEW_MIN = 200;
const FILE_PREVIEW_MAX = 800;

export const useLayoutStore = create<LayoutState>()(
  persist(
    (set) => ({
      leftSidebarOpen: true,
      leftSidebarWidth: 260,
      toggleLeftSidebar: () =>
        set((s) => ({ leftSidebarOpen: !s.leftSidebarOpen })),
      setLeftSidebarWidth: (width) => set({ leftSidebarWidth: width }),

      chatWidth: 640,
      setChatWidth: (width) => set({
        chatWidth: Math.min(CHAT_MAX, Math.max(CHAT_MIN, width)),
      }),

      filePanelOpen: true,
      filePanelClosing: false,
      filePanelOpening: false,
      fileTreeWidth: 260,
      filePreviewWidth: 360,
      fileTreeShowHidden: true,
      setFileTreeShowHidden: (show) => set({ fileTreeShowHidden: show }),
      toggleFilePanel: () =>
        set((s) =>
          s.filePanelOpen
            ? { filePanelClosing: true }
            : { filePanelOpen: true, filePanelOpening: true },
        ),
      setFilePanelOpen: (open) => set({ filePanelOpen: open }),
      confirmFilePanelClosed: () =>
        set({ filePanelOpen: false, filePanelClosing: false }),
      confirmFilePanelOpened: () => set({ filePanelOpening: false }),
      setFileTreeWidth: (width) => set({
        fileTreeWidth: Math.min(FILE_TREE_MAX, Math.max(FILE_TREE_MIN, width)),
      }),
      setFilePreviewWidth: (width) => set({
        filePreviewWidth: Math.min(FILE_PREVIEW_MAX, Math.max(FILE_PREVIEW_MIN, width)),
      }),
    }),
    {
      name: "office-chat-layout",
      version: 1,
      merge: (persisted, current) => {
        const p = (persisted && typeof persisted === "object") ? persisted as Partial<LayoutState> : {};
        return {
          ...current,
          ...p,
          filePanelClosing: p.filePanelClosing ?? false,
          filePanelOpening: p.filePanelOpening ?? false,
          fileTreeShowHidden: p.fileTreeShowHidden ?? current.fileTreeShowHidden,
        };
      },
    },
  ),
);
