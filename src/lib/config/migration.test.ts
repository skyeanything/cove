import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));
vi.mock("./index", () => ({
  writeConfig: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/db/repos/settingsRepo", () => ({
  settingsRepo: { get: vi.fn().mockResolvedValue(undefined) },
}));
vi.mock("@/lib/ai/skills/loader", () => ({
  listSkills: vi.fn().mockReturnValue([{ name: "default-skill" }]),
}));

import { invoke } from "@tauri-apps/api/core";
import { writeConfig } from "./index";
import { settingsRepo } from "@/db/repos/settingsRepo";
import { migrateConfigIfNeeded } from "./migration";

beforeEach(() => vi.clearAllMocks());

describe("migrateConfigIfNeeded", () => {
  it("skips migration when config already exists", async () => {
    vi.mocked(invoke).mockResolvedValue('{"theme":"dark"}');
    await migrateConfigIfNeeded();
    expect(writeConfig).not.toHaveBeenCalled();
  });

  it("migrates when config does not exist", async () => {
    vi.mocked(invoke).mockResolvedValue("{}");
    vi.mocked(settingsRepo.get).mockResolvedValue(undefined);

    // Mock localStorage
    const originalLocalStorage = globalThis.localStorage;
    Object.defineProperty(globalThis, "localStorage", {
      value: {
        getItem: vi.fn().mockReturnValue(null),
      },
      writable: true,
    });

    await migrateConfigIfNeeded();

    expect(writeConfig).toHaveBeenCalledTimes(4);
    expect(writeConfig).toHaveBeenCalledWith("appearance", expect.objectContaining({ theme: "system" }));
    expect(writeConfig).toHaveBeenCalledWith("layout", expect.any(Object));
    expect(writeConfig).toHaveBeenCalledWith("general", expect.objectContaining({ locale: "zh", sendShortcut: "enter" }));
    expect(writeConfig).toHaveBeenCalledWith("skills", expect.any(Object));

    Object.defineProperty(globalThis, "localStorage", {
      value: originalLocalStorage,
      writable: true,
    });
  });

  it("reads locale from settingsRepo during migration", async () => {
    vi.mocked(invoke).mockResolvedValue("{}");
    vi.mocked(settingsRepo.get).mockImplementation(async (key: string) => {
      if (key === "locale") return "en";
      if (key === "sendMessageShortcut") return "modifierEnter";
      return undefined;
    });

    Object.defineProperty(globalThis, "localStorage", {
      value: { getItem: vi.fn().mockReturnValue(null) },
      writable: true,
    });

    await migrateConfigIfNeeded();

    expect(writeConfig).toHaveBeenCalledWith("general", {
      locale: "en",
      sendShortcut: "modifierEnter",
    });
  });
});
