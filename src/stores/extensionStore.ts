import { create } from "zustand";

export type ExtensionNav = "skills" | "tools" | "connectors" | "subagent";
// Backward compat alias
export type ExtensionTab = ExtensionNav;
export type CreateDialogType = "skill" | "mcp" | "subagent" | null;

interface ExtensionState {
  // Active nav (first panel)
  activeNav: ExtensionNav;
  setActiveNav: (nav: ExtensionNav) => void;
  // Backward compat alias
  activeTab: ExtensionNav;
  setActiveTab: (tab: ExtensionNav) => void;

  // Selected item key in middle panel
  // "builtin:<name>" | "ext:<folderName>" | "connector:<id>" | "subagent:<id>" | "tool:<name>"
  selectedKey: string | null;
  setSelectedKey: (key: string | null) => void;

  // Expanded skill item keys (for file tree)
  expandedKeys: string[];
  toggleExpanded: (key: string) => void;

  createDialogType: CreateDialogType;
  setCreateDialogType: (type: CreateDialogType) => void;

  // Version counters — increment to trigger list re-fetch
  connectorsVersion: number;
  subagentsVersion: number;
  bumpConnectors: () => void;
  bumpSubagents: () => void;
}

export const useExtensionStore = create<ExtensionState>()((set) => ({
  activeNav: "skills",
  setActiveNav: (nav) => set({ activeNav: nav, activeTab: nav }),
  activeTab: "skills",
  setActiveTab: (tab) => set({ activeTab: tab, activeNav: tab }),

  selectedKey: null,
  setSelectedKey: (key) => set({ selectedKey: key }),

  expandedKeys: [],
  toggleExpanded: (key) =>
    set((s) => ({
      expandedKeys: s.expandedKeys.includes(key)
        ? s.expandedKeys.filter((k) => k !== key)
        : [...s.expandedKeys, key],
    })),

  createDialogType: null,
  setCreateDialogType: (type) => set({ createDialogType: type }),

  connectorsVersion: 0,
  subagentsVersion: 0,
  bumpConnectors: () => set((s) => ({ connectorsVersion: s.connectorsVersion + 1 })),
  bumpSubagents: () => set((s) => ({ subagentsVersion: s.subagentsVersion + 1 })),
}));
