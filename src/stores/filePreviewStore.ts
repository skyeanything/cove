import { create } from "zustand";

export type PreviewContentType = "text" | "dataUrl";

export interface CachedContent {
  path: string;
  type: PreviewContentType;
  text?: string;
  dataUrl?: string;
  mtime?: number;
}

/** Preview error: file was deleted, etc. */
export type PreviewErrorKind = "file-deleted" | null;

/** Get the parent directory from a relative path (empty string = root) */
export function dirOfPath(path: string): string {
  return path.includes("/") ? path.replace(/\/[^/]+$/, "") : "";
}

export interface SelectedEntry {
  path: string;
  isDir: boolean;
  name: string;
}

interface FilePreviewState {
  workspaceRoot: string | null;
  /** Currently previewed path (last clicked item) */
  selectedPath: string | null;
  selectedIsDir: boolean;
  /** Workspace root that owns the currently selected path */
  selectedWorkspaceRoot: string | null;
  /** Multi-select: all selected entries (auto-context for AI) */
  selectedEntries: SelectedEntry[];
  /** Last opened dir, used to keep tree position after file deletion */
  lastOpenedDirPath: string | null;
  contentCache: Record<string, CachedContent>;
  /** Current preview error (e.g. file deleted) */
  previewError: PreviewErrorKind;
  /** Set by breadcrumb click — tells FileTreePanel to expand ancestors */
  pendingExpandPath: string | null;

  setWorkspaceRoot: (root: string | null) => void;
  /** Single click: replace selection with this item */
  setSelected: (path: string | null, isDir?: boolean, name?: string) => void;
  /** Cmd/Ctrl+Click: toggle item in multi-selection */
  toggleSelected: (path: string, isDir: boolean, name: string) => void;
  /** Set which workspace root owns the current selection */
  setSelectedWorkspaceRoot: (root: string | null) => void;
  setContent: (path: string, content: CachedContent) => void;
  invalidate: (path: string) => void;
  setPreviewError: (err: PreviewErrorKind) => void;
  setPendingExpandPath: (path: string | null) => void;
  clearSelection: () => void;
  clear: () => void;
}

export const useFilePreviewStore = create<FilePreviewState>()((set) => ({
  workspaceRoot: null,
  selectedPath: null,
  selectedIsDir: false,
  selectedWorkspaceRoot: null,
  selectedEntries: [],
  lastOpenedDirPath: null,
  contentCache: {},
  previewError: null,
  pendingExpandPath: null,

  setWorkspaceRoot: (root) =>
    set({
      workspaceRoot: root,
      selectedPath: null,
      selectedIsDir: false,
      selectedWorkspaceRoot: null,
      selectedEntries: [],
      lastOpenedDirPath: null,
      contentCache: {},
      previewError: null,
      pendingExpandPath: null,
    }),

  setSelected: (path, isDir = false, name) =>
    set((s) => ({
      selectedPath: path,
      selectedIsDir: isDir,
      selectedEntries: path != null
        ? [{ path, isDir, name: name ?? path.split("/").pop() ?? path }]
        : [],
      previewError: null,
      lastOpenedDirPath: path != null
        ? (isDir ? path : dirOfPath(path))
        : s.lastOpenedDirPath,
    })),

  toggleSelected: (path, isDir, name) =>
    set((s) => {
      const exists = s.selectedEntries.some((e) => e.path === path);
      const nextEntries = exists
        ? s.selectedEntries.filter((e) => e.path !== path)
        : [...s.selectedEntries, { path, isDir, name }];
      // Preview the clicked item regardless
      return {
        selectedPath: path,
        selectedIsDir: isDir,
        selectedEntries: nextEntries,
        previewError: null,
        lastOpenedDirPath: isDir ? path : dirOfPath(path),
      };
    }),

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

  setSelectedWorkspaceRoot: (root) => set({ selectedWorkspaceRoot: root }),

  clearSelection: () => set({ selectedPath: null, selectedIsDir: false, selectedEntries: [], selectedWorkspaceRoot: null }),

  clear: () =>
    set({
      selectedPath: null,
      selectedIsDir: false,
      selectedEntries: [],
      selectedWorkspaceRoot: null,
      lastOpenedDirPath: null,
      contentCache: {},
      previewError: null,
      pendingExpandPath: null,
    }),
}));
