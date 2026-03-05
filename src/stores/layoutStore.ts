import { create } from "zustand";
import { persist } from "zustand/middleware";

export type ActivePage = "chat" | "workspace" | "extensions";

/** Three sidebar display modes:
 * - "full"   → full-width sidebar with text labels (default)
 * - "mini"   → 52px icon-only strip (auto-collapses when entering workspace conversation)
 * - "hidden" → no sidebar (toggle with Cmd+B)
 */
export type SidebarMode = "full" | "mini" | "hidden";

interface LayoutState {
  /** --- Navigation & Page --- */
  activePage: ActivePage;
  setActivePage: (page: ActivePage) => void;

  /** Left nav sidebar mode */
  leftSidebarMode: SidebarMode;
  /** Backward-compat derived: true when sidebar is visible (full or mini) */
  leftSidebarOpen: boolean;
  leftSidebarWidth: number;
  /** Cmd+B: toggle between full ↔ hidden (from mini → full) */
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

  /** --- File tree (shared between modes) --- */
  fileTreeWidth: number;
  filePreviewWidth: number;
  fileTreeShowHidden: boolean;
  setFileTreeShowHidden: (show: boolean) => void;
  setFileTreeWidth: (width: number) => void;
  setFilePreviewWidth: (width: number) => void;

  /** --- Workspace selector overlay (session-only, not persisted) --- */
  workspaceSelectorOpen: boolean;
  setWorkspaceSelectorOpen: (open: boolean) => void;
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

export const useLayoutStore = create<LayoutState>()(
  persist(
    (set) => ({
      /* Navigation */
      activePage: "chat" as ActivePage,
      setActivePage: (page) => set({ activePage: page }),

      /* Left sidebar */
      leftSidebarMode: "full" as SidebarMode,
      leftSidebarOpen: true,   // derived, kept for compat — updated in merge
      leftSidebarWidth: 260,
      toggleLeftSidebar: () =>
        set((s) => {
          const next: SidebarMode = s.leftSidebarMode === "hidden" ? "full" : "hidden";
          return { leftSidebarMode: next, leftSidebarOpen: next !== "hidden" };
        }),
      setLeftSidebarMini: () =>
        set({ leftSidebarMode: "mini", leftSidebarOpen: true }),
      setLeftSidebarFull: () =>
        set({ leftSidebarMode: "full", leftSidebarOpen: true }),
      setLeftSidebarWidth: (width) => set({
        leftSidebarWidth: Math.min(SIDEBAR_MAX, Math.max(SIDEBAR_MIN, width)),
      }),

      /* History section */
      historyCollapsed: false,
      toggleHistory: () =>
        set((s) => ({ historyCollapsed: !s.historyCollapsed })),

      /* Conversation mode chat width */
      chatWidth: 640,
      setChatWidth: (width) => set({
        chatWidth: Math.min(CHAT_MAX, Math.max(CHAT_MIN, width)),
      }),

      /* Workspace mode column widths */
      wsFileTreeWidth: 280,
      wsChatWidth: 360,
      setWsFileTreeWidth: (width) => set({
        wsFileTreeWidth: Math.min(WS_FILE_TREE_MAX, Math.max(WS_FILE_TREE_MIN, width)),
      }),
      setWsChatWidth: (width) => set({
        wsChatWidth: Math.min(WS_CHAT_MAX, Math.max(WS_CHAT_MIN, width)),
      }),

      /* File tree (shared) */
      fileTreeWidth: 260,
      filePreviewWidth: 360,
      fileTreeShowHidden: true,
      setFileTreeShowHidden: (show) => set({ fileTreeShowHidden: show }),
      setFileTreeWidth: (width) => set({
        fileTreeWidth: Math.min(FILE_TREE_MAX, Math.max(FILE_TREE_MIN, width)),
      }),
      setFilePreviewWidth: (width) => set({
        filePreviewWidth: Math.min(FILE_PREVIEW_MAX, Math.max(FILE_PREVIEW_MIN, width)),
      }),

      /* Workspace selector (session-only) */
      workspaceSelectorOpen: false,
      setWorkspaceSelectorOpen: (open) => set({ workspaceSelectorOpen: open }),
    }),
    {
      name: "office-chat-layout",
      version: 3,
      migrate: (persisted, version) => {
        const p = (persisted && typeof persisted === "object")
          ? persisted as Record<string, unknown>
          : {};
        if (version < 3) {
          // Migrate v1/v2: leftSidebarOpen (boolean) → leftSidebarMode (string)
          const wasOpen = p.leftSidebarOpen !== false;
          p.leftSidebarMode = wasOpen ? "full" : "hidden";
          p.leftSidebarOpen = wasOpen;
        }
        return p;
      },
      merge: (persisted, current) => {
        const p = (persisted && typeof persisted === "object")
          ? persisted as Partial<LayoutState>
          : {};
        const mode: SidebarMode = p.leftSidebarMode ?? "full";
        return {
          ...current,
          ...p,
          leftSidebarMode: mode,
          leftSidebarOpen: mode !== "hidden",
          /* Ensure new fields have defaults */
          activePage: p.activePage ?? (current as LayoutState).activePage,
          historyCollapsed: p.historyCollapsed ?? false,
          wsFileTreeWidth: p.wsFileTreeWidth ?? 280,
          wsChatWidth: p.wsChatWidth ?? 360,
          fileTreeShowHidden: p.fileTreeShowHidden ?? (current as LayoutState).fileTreeShowHidden,
        };
      },
    },
  ),
);
