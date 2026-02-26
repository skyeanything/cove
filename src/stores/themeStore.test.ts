import { describe, it, expect, afterEach } from "vitest";
import { useThemeStore } from "./themeStore";
import { createStoreReset } from "@/test-utils/mock-store";

const resetStore = createStoreReset(useThemeStore);
afterEach(() => resetStore());

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
});
