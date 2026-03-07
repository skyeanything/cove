import { create } from "zustand";
import type { ProviderType } from "@/db/types";
import { readConfig, writeConfig } from "@/lib/config";
import type { GeneralConfig } from "@/lib/config/types";

type SettingsTab = "providers" | "general" | "skills" | "tools" | "workspaces";
export type SendMessageShortcut = "enter" | "modifierEnter";

interface SettingsState {
  tab: SettingsTab;
  selectedProviderType: ProviderType | null;
  sendMessageShortcut: SendMessageShortcut;

  setTab: (tab: SettingsTab) => void;
  setSelectedProvider: (type: ProviderType | null) => void;
  setSendMessageShortcut: (v: SendMessageShortcut) => void;
  loadAppSettings: () => Promise<void>;
}

export const useSettingsStore = create<SettingsState>()((set) => ({
  tab: "providers",
  selectedProviderType: "deepseek",
  sendMessageShortcut: "enter",

  setTab(tab) {
    set({ tab });
  },

  setSelectedProvider(type) {
    set({ selectedProviderType: type });
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
