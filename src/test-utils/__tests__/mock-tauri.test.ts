// @vitest-environment happy-dom
import { describe, it, expect, vi } from "vitest";
import { invoke } from "@tauri-apps/api/core";
import { setupTauriMocks } from "../mock-tauri";

describe("setupTauriMocks", () => {
  it("routes to the correct command handler", async () => {
    setupTauriMocks({
      greet: (payload) => `Hello, ${(payload as { name: string }).name}!`,
    });

    const result = await invoke("greet", { name: "Alice" });
    expect(result).toBe("Hello, Alice!");
  });

  it("returns undefined for unregistered commands", async () => {
    setupTauriMocks({});
    const result = await invoke("unknown_command");
    expect(result).toBeUndefined();
  });

  it("passes payload to handlers", async () => {
    const handler = vi.fn().mockReturnValue(42);
    setupTauriMocks({ calculate: handler });

    await invoke("calculate", { a: 10, b: 32 });
    expect(handler).toHaveBeenCalledWith(
      expect.objectContaining({ a: 10, b: 32 }),
    );
  });

  it("supports async handlers", async () => {
    setupTauriMocks({
      fetch_data: async () => ({ items: [1, 2, 3] }),
    });

    const result = await invoke("fetch_data");
    expect(result).toEqual({ items: [1, 2, 3] });
  });
});
