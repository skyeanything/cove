import { create } from "zustand";
import { persist } from "zustand/middleware";

interface LayoutState {
  leftSidebarOpen: boolean;
  leftSidebarWidth: number;
  toggleLeftSidebar: () => void;
  setLeftSidebarWidth: (width: number) => void;
}

export const useLayoutStore = create<LayoutState>()(
  persist(
    (set) => ({
      leftSidebarOpen: true,
      leftSidebarWidth: 260,
      toggleLeftSidebar: () =>
        set((s) => ({ leftSidebarOpen: !s.leftSidebarOpen })),
      setLeftSidebarWidth: (width) => set({ leftSidebarWidth: width }),
    }),
    {
      name: "office-chat-layout",
    },
  ),
);
