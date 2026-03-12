import { create } from "zustand";
import type { ProviderType } from "@/db/types";
import { readConfig, writeConfig } from "@/lib/config";
import type { GeneralConfig } from "@/lib/config/types";

type SettingsTab = "providers" | "general" | "appearance" | "soul" | "skills" | "tools" | "workspaces";
export type SendMessageShortcut = "enter" | "modifierEnter";

export interface SelectedProvider {
  type: ProviderType;
  id?: string;
}

interface SettingsState {
  tab: SettingsTab;
  selectedProvider: SelectedProvider | null;
  sendMessageShortcut: SendMessageShortcut;

  setTab: (tab: SettingsTab) => void;
  setSelectedProvider: (sel: SelectedProvider | null) => void;
  setSendMessageShortcut: (v: SendMessageShortcut) => void;
  loadAppSettings: () => Promise<void>;
}

export const useSettingsStore = create<SettingsState>()((set) => ({
  tab: "providers",
  selectedProvider: { type: "deepseek" },
  sendMessageShortcut: "enter",

  setTab(tab) {
    set({ tab });
  },

  setSelectedProvider(sel) {
    set({ selectedProvider: sel });
  },

  setSendMessageShortcut(v) {
    set({ sendMessageShortcut: v });
    void readConfig<GeneralConfig>("general").then((config) => {
      void writeConfig("general", { ...config, sendShortcut: v });
    });
  },

  async loadAppSettings() {
    const config = await readConfig<GeneralConfig>("general");
    const sendMessageShortcut: SendMessageShortcut = config.sendShortcut ?? "enter";
    set({ sendMessageShortcut });
  },
}));
