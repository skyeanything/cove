import { create } from "zustand";
import type { ProviderType } from "@/db/types";
import { settingsRepo } from "@/db/repos/settingsRepo";

type SettingsTab = "providers" | "general" | "skills" | "tools" | "appearance" | "workspaces";
/** enter: 回车发送；modifierEnter: ⌘+Enter(Mac) / Ctrl+Enter(Win,Linux) 发送 */
export type SendMessageShortcut = "enter" | "modifierEnter";

interface SettingsState {
  tab: SettingsTab;
  selectedProviderType: ProviderType | null;
  /** 发送消息快捷键，从 settings 表预读，供 ChatInput 使用 */
  sendMessageShortcut: SendMessageShortcut;

  setTab: (tab: SettingsTab) => void;
  setSelectedProvider: (type: ProviderType | null) => void;
  setSendMessageShortcut: (v: SendMessageShortcut) => void;
  /** 应用启动时从 DB 预读 locale、sendMessageShortcut 等 */
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
  },

  async loadAppSettings() {
    const raw = await settingsRepo.get("sendMessageShortcut");
    // 兼容旧值 shiftEnter，视为 modifierEnter
    const sendMessageShortcut: SendMessageShortcut =
      raw === "modifierEnter" || raw === "shiftEnter" ? "modifierEnter" : "enter";
    set({ sendMessageShortcut });
  },
}));
