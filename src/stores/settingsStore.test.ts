import { describe, it, expect, afterEach, vi } from "vitest";
import { createStoreReset } from "@/test-utils/mock-store";

vi.mock("@/db/repos/settingsRepo", () => ({
  settingsRepo: {
    get: vi.fn(),
    set: vi.fn(),
  },
}));

import { useSettingsStore } from "./settingsStore";
import { settingsRepo } from "@/db/repos/settingsRepo";

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
    it("loads modifierEnter from DB", async () => {
      vi.mocked(settingsRepo.get).mockResolvedValue("modifierEnter");
      await useSettingsStore.getState().loadAppSettings();
      expect(useSettingsStore.getState().sendMessageShortcut).toBe("modifierEnter");
    });

    it("defaults to enter when DB returns undefined", async () => {
      vi.mocked(settingsRepo.get).mockResolvedValue(undefined);
      await useSettingsStore.getState().loadAppSettings();
      expect(useSettingsStore.getState().sendMessageShortcut).toBe("enter");
    });

    it("migrates legacy shiftEnter to modifierEnter", async () => {
      vi.mocked(settingsRepo.get).mockResolvedValue("shiftEnter");
      await useSettingsStore.getState().loadAppSettings();
      expect(useSettingsStore.getState().sendMessageShortcut).toBe("modifierEnter");
    });

    it("treats unknown values as enter", async () => {
      vi.mocked(settingsRepo.get).mockResolvedValue("somethingElse");
      await useSettingsStore.getState().loadAppSettings();
      expect(useSettingsStore.getState().sendMessageShortcut).toBe("enter");
    });
  });
});
