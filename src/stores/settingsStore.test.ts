import { describe, it, expect, afterEach, vi } from "vitest";
import { createStoreReset } from "@/test-utils/mock-store";

vi.mock("@/lib/config", () => ({
  readConfig: vi.fn().mockResolvedValue({ locale: "zh", sendShortcut: "enter" }),
  writeConfig: vi.fn().mockResolvedValue(undefined),
}));

import { useSettingsStore } from "./settingsStore";
import { readConfig } from "@/lib/config";

const resetStore = createStoreReset(useSettingsStore);
afterEach(() => {
  resetStore();
  vi.clearAllMocks();
});

describe("settingsStore", () => {
  describe("setTab", () => {
    it("updates tab", () => {
      useSettingsStore.getState().setTab("general");
      expect(useSettingsStore.getState().tab).toBe("general");
    });
  });

  describe("setSelectedProvider", () => {
    it("updates selectedProviderType", () => {
      useSettingsStore.getState().setSelectedProvider("openai");
      expect(useSettingsStore.getState().selectedProviderType).toBe("openai");
    });

    it("can set to null", () => {
      useSettingsStore.getState().setSelectedProvider(null);
      expect(useSettingsStore.getState().selectedProviderType).toBeNull();
    });
  });

  describe("setSendMessageShortcut", () => {
    it("updates sendMessageShortcut", () => {
      useSettingsStore.getState().setSendMessageShortcut("modifierEnter");
      expect(useSettingsStore.getState().sendMessageShortcut).toBe("modifierEnter");
    });
  });

  describe("loadAppSettings", () => {
    it("loads modifierEnter from config", async () => {
      vi.mocked(readConfig).mockResolvedValue({ locale: "zh", sendShortcut: "modifierEnter" });
      await useSettingsStore.getState().loadAppSettings();
      expect(useSettingsStore.getState().sendMessageShortcut).toBe("modifierEnter");
    });

    it("defaults to enter when config has no sendShortcut", async () => {
      vi.mocked(readConfig).mockResolvedValue({ locale: "zh" });
      await useSettingsStore.getState().loadAppSettings();
      expect(useSettingsStore.getState().sendMessageShortcut).toBe("enter");
    });

    it("loads enter from config", async () => {
      vi.mocked(readConfig).mockResolvedValue({ locale: "zh", sendShortcut: "enter" });
      await useSettingsStore.getState().loadAppSettings();
      expect(useSettingsStore.getState().sendMessageShortcut).toBe("enter");
    });
  });
});
