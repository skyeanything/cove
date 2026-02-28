import { create } from "zustand";

export type PreviewContentType = "text" | "dataUrl";

export interface CachedContent {
  path: string;
  type: PreviewContentType;
  text?: string;
  dataUrl?: string;
  mtime?: number;
}

/** 预览错误类型：文件被删除等 */
export type PreviewErrorKind = "file-deleted" | null;

/** 从文件路径得到其所在目录（相对路径，空串表示根下） */
export function dirOfPath(path: string): string {
  return path.includes("/") ? path.replace(/\/[^/]+$/, "") : "";
}

interface FilePreviewState {
  workspaceRoot: string | null;
  selectedPath: string | null;
  /** 上次打开文件所在目录，用于删除/刷新后仍能定位到该目录 */
  lastOpenedDirPath: string | null;
  contentCache: Record<string, CachedContent>;
  /** 当前预览错误（如文件已被删除） */
  previewError: PreviewErrorKind;
  /** Set by breadcrumb click — tells FileTreePanel to expand ancestors + scroll */
  pendingExpandPath: string | null;

  setWorkspaceRoot: (root: string | null) => void;
  setSelected: (path: string | null) => void;
  setContent: (path: string, content: CachedContent) => void;
  invalidate: (path: string) => void;
  setPreviewError: (err: PreviewErrorKind) => void;
  setPendingExpandPath: (path: string | null) => void;
  clear: () => void;
}

export const useFilePreviewStore = create<FilePreviewState>()((set) => ({
  workspaceRoot: null,
  selectedPath: null,
  lastOpenedDirPath: null,
  contentCache: {},
  previewError: null,
  pendingExpandPath: null,

  setWorkspaceRoot: (root) =>
    set({ workspaceRoot: root, selectedPath: null, lastOpenedDirPath: null, contentCache: {}, previewError: null, pendingExpandPath: null }),

  setSelected: (path) =>
    set((s) => ({
      selectedPath: path,
      previewError: null,
      lastOpenedDirPath: path != null ? dirOfPath(path) : s.lastOpenedDirPath,
    })),

  setContent: (path, content) =>
    set((s) => ({
      contentCache: { ...s.contentCache, [path]: content },
    })),

  invalidate: (path) =>
    set((s) => {
      const next = { ...s.contentCache };
      delete next[path];
      return { contentCache: next };
    }),

  setPreviewError: (err) => set({ previewError: err }),

  setPendingExpandPath: (path) => set({ pendingExpandPath: path }),

  clear: () =>
    set({ selectedPath: null, lastOpenedDirPath: null, contentCache: {}, previewError: null, pendingExpandPath: null }),
}));
