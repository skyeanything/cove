/**
 * navigationStore — 浏览器风格的导航历史栈。
 *
 * 记录页面切换和对话选择，支持后退/前进导航。
 * 在 AppLayout 中通过 useEffect 自动推入新条目。
 */
import { create } from "zustand";
import type { ActivePage } from "./layoutStore";

interface NavEntry {
  page: ActivePage;
  conversationId: string | null;
}

const MAX_ENTRIES = 50;

interface NavigationState {
  entries: NavEntry[];
  currentIndex: number; // -1 = empty

  /** Push a new entry (deduplicates against current) */
  push: (entry: NavEntry) => void;
  /** Navigate back; returns the entry to restore, or null */
  goBack: () => NavEntry | null;
  /** Navigate forward; returns the entry to restore, or null */
  goForward: () => NavEntry | null;
  /** Whether back navigation is possible */
  canGoBack: boolean;
  /** Whether forward navigation is possible */
  canGoForward: boolean;
  /** Flag to suppress the next push (used when goBack/goForward triggers state changes) */
  _skipNextPush: boolean;
}

function same(a: NavEntry, b: NavEntry): boolean {
  return a.page === b.page && a.conversationId === b.conversationId;
}

export const useNavigationStore = create<NavigationState>()((set, get) => ({
  entries: [],
  currentIndex: -1,
  canGoBack: false,
  canGoForward: false,
  _skipNextPush: false,

  push(entry) {
    const { entries, currentIndex, _skipNextPush } = get();

    // If a goBack/goForward just triggered this push, skip it
    if (_skipNextPush) {
      set({ _skipNextPush: false });
      return;
    }

    // Deduplicate: if same as current entry, skip
    const current = currentIndex >= 0 ? entries[currentIndex] : undefined;
    if (current && same(current, entry)) {
      return;
    }

    // Truncate forward history (browser-style)
    const truncated = entries.slice(0, currentIndex + 1);
    truncated.push(entry);

    // Enforce max size
    if (truncated.length > MAX_ENTRIES) {
      truncated.shift();
    }

    const newIndex = truncated.length - 1;
    set({
      entries: truncated,
      currentIndex: newIndex,
      canGoBack: newIndex > 0,
      canGoForward: false,
    });
  },

  goBack() {
    const { entries, currentIndex } = get();
    if (currentIndex <= 0) return null;

    const newIndex = currentIndex - 1;
    set({
      currentIndex: newIndex,
      canGoBack: newIndex > 0,
      canGoForward: true,
      _skipNextPush: true,
    });
    return entries[newIndex] ?? null;
  },

  goForward() {
    const { entries, currentIndex } = get();
    if (currentIndex >= entries.length - 1) return null;

    const newIndex = currentIndex + 1;
    set({
      currentIndex: newIndex,
      canGoBack: true,
      canGoForward: newIndex < entries.length - 1,
      _skipNextPush: true,
    });
    return entries[newIndex] ?? null;
  },
}));
