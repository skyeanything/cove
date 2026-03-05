import { describe, it, expect, afterEach, vi } from "vitest";
import { createStoreReset } from "@/test-utils/mock-store";

vi.mock("@/lib/config", () => ({
  readConfig: vi.fn().mockResolvedValue({ theme: "system" }),
  writeConfig: vi.fn().mockResolvedValue(undefined),
}));

import { useThemeStore } from "./themeStore";
import { readConfig, writeConfig } from "@/lib/config";

const resetStore = createStoreReset(useThemeStore);
afterEach(() => {
  resetStore();
  vi.clearAllMocks();
});

describe("themeStore", () => {
  it("has system as default theme", () => {
    expect(useThemeStore.getState().theme).toBe("system");
  });

  it("sets theme to light", () => {
    useThemeStore.getState().setTheme("light");
    expect(useThemeStore.getState().theme).toBe("light");
  });

  it("sets theme to dark", () => {
    useThemeStore.getState().setTheme("dark");
    expect(useThemeStore.getState().theme).toBe("dark");
  });

  it("sets theme back to system", () => {
    useThemeStore.getState().setTheme("dark");
    useThemeStore.getState().setTheme("system");
    expect(useThemeStore.getState().theme).toBe("system");
  });

  it("writes config when setting theme", () => {
    useThemeStore.getState().setTheme("dark");
    expect(writeConfig).toHaveBeenCalledWith("appearance", { theme: "dark" });
  });

  it("init reads from config", async () => {
    vi.mocked(readConfig).mockResolvedValue({ theme: "dark" });
    await useThemeStore.getState().init();
    expect(useThemeStore.getState().theme).toBe("dark");
  });
});
