// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { setupTauriMocks } from "@/test-utils/mock-tauri";
import { useMentionFiles } from "./useMentionFiles";

const MOCK_ENTRIES = [
  { name: "src", path: "src", isDir: true, mtimeSecs: 1000 },
  { name: "package.json", path: "package.json", isDir: false, mtimeSecs: 900 },
  { name: "README.md", path: "README.md", isDir: false, mtimeSecs: 800 },
  { name: "tsconfig.json", path: "tsconfig.json", isDir: false, mtimeSecs: 700 },
  { name: "vite.config.ts", path: "vite.config.ts", isDir: false, mtimeSecs: 600 },
];

beforeEach(() => vi.clearAllMocks());

describe("useMentionFiles", () => {
  it("returns empty array when disabled", () => {
    const { result } = renderHook(() => useMentionFiles("/workspace", "", false));
    expect(result.current).toEqual([]);
  });

  it("returns empty array when workspacePath is null", () => {
    const { result } = renderHook(() => useMentionFiles(null, "", true));
    expect(result.current).toEqual([]);
  });

  it("loads files from workspace when enabled", async () => {
    setupTauriMocks({
      list_dir: () => MOCK_ENTRIES,
    });

    const { result } = renderHook(() => useMentionFiles("/workspace", "", true));

    await waitFor(() => {
      expect(result.current.length).toBeGreaterThan(0);
    });

    expect(result.current).toEqual(
      MOCK_ENTRIES.map((e) => ({ name: e.name, path: e.path, isDir: e.isDir })),
    );
  });

  it("filters results by query", async () => {
    setupTauriMocks({
      list_dir: () => MOCK_ENTRIES,
    });

    const { result } = renderHook(() => useMentionFiles("/workspace", "pack", true));

    await waitFor(() => {
      expect(result.current.length).toBe(1);
    });

    expect(result.current[0].name).toBe("package.json");
  });

  it("filters case-insensitively", async () => {
    setupTauriMocks({
      list_dir: () => MOCK_ENTRIES,
    });

    const { result } = renderHook(() => useMentionFiles("/workspace", "READ", true));

    await waitFor(() => {
      expect(result.current.length).toBe(1);
    });

    expect(result.current[0].name).toBe("README.md");
  });

  it("limits results to 10 items", async () => {
    const manyEntries = Array.from({ length: 20 }, (_, i) => ({
      name: `file-${i}.ts`,
      path: `file-${i}.ts`,
      isDir: false,
      mtimeSecs: 1000 - i,
    }));

    setupTauriMocks({
      list_dir: () => manyEntries,
    });

    const { result } = renderHook(() => useMentionFiles("/workspace", "", true));

    await waitFor(() => {
      expect(result.current.length).toBe(10);
    });
  });

  it("returns empty array on invoke error", async () => {
    setupTauriMocks({
      list_dir: () => { throw new Error("Permission denied"); },
    });

    const { result } = renderHook(() => useMentionFiles("/workspace", "", true));

    // Wait a tick, should remain empty without throwing
    await waitFor(() => {
      expect(result.current).toEqual([]);
    });
  });

  it("does not strip isDir from entries", async () => {
    setupTauriMocks({
      list_dir: () => MOCK_ENTRIES,
    });

    const { result } = renderHook(() => useMentionFiles("/workspace", "src", true));

    await waitFor(() => {
      expect(result.current.length).toBe(1);
    });

    expect(result.current[0]).toEqual({ name: "src", path: "src", isDir: true });
  });
});
