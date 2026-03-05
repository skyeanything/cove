import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}));

import { invoke } from "@tauri-apps/api/core";
import { readConfig, writeConfig, updateConfig } from "./index";

beforeEach(() => vi.clearAllMocks());

describe("readConfig", () => {
  it("parses JSON from invoke result", async () => {
    vi.mocked(invoke).mockResolvedValue('{"theme":"dark"}');
    const result = await readConfig<{ theme: string }>("appearance");
    expect(result.theme).toBe("dark");
    expect(invoke).toHaveBeenCalledWith("read_config", { name: "appearance" });
  });

  it("merges defaults for missing keys", async () => {
    vi.mocked(invoke).mockResolvedValue("{}");
    const result = await readConfig<{ theme: string }>("appearance");
    expect(result.theme).toBe("system");
  });

  it("returned value overrides defaults", async () => {
    vi.mocked(invoke).mockResolvedValue('{"theme":"light"}');
    const result = await readConfig<{ theme: string }>("appearance");
    expect(result.theme).toBe("light");
  });
});

describe("writeConfig", () => {
  it("invokes write_config with JSON-stringified data", async () => {
    vi.mocked(invoke).mockResolvedValue(undefined);
    await writeConfig("appearance", { theme: "dark" });
    expect(invoke).toHaveBeenCalledWith("write_config", {
      name: "appearance",
      content: JSON.stringify({ theme: "dark" }, null, 2),
    });
  });
});

describe("updateConfig", () => {
  it("reads current, applies updater, writes result", async () => {
    vi.mocked(invoke)
      .mockResolvedValueOnce('{"theme":"light"}')
      .mockResolvedValueOnce(undefined);

    const result = await updateConfig<{ theme: string }>("appearance", (c) => ({
      ...c,
      theme: "dark",
    }));

    expect(result.theme).toBe("dark");
    expect(invoke).toHaveBeenCalledTimes(2);
  });
});
