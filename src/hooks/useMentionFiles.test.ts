// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { setupTauriMocks } from "@/test-utils/mock-tauri";
import { useMentionFiles } from "./useMentionFiles";

const MOCK_ENTRIES = [
  { name: "src", path: "src", isDir: true },
  { name: "package.json", path: "package.json", isDir: false },
  { name: "README.md", path: "README.md", isDir: false },
  { name: "App.tsx", path: "src/components/App.tsx", isDir: false },
  { name: "useStore.ts", path: "src/hooks/useStore.ts", isDir: false },
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
      walk_files: () => MOCK_ENTRIES,
    });

    const { result } = renderHook(() => useMentionFiles("/workspace", "", true));

    await waitFor(() => {
      expect(result.current.length).toBeGreaterThan(0);
    });

    expect(result.current).toEqual(
      MOCK_ENTRIES.map((e) => ({
        name: e.name,
        path: e.path,
        isDir: e.isDir,
        parentDir: e.path.includes("/")
          ? e.path.slice(0, e.path.lastIndexOf("/") + 1)
          : "",
      })),
    );
  });

  it("filters results by query on name", async () => {
    setupTauriMocks({
      walk_files: () => MOCK_ENTRIES,
    });

    const { result } = renderHook(() => useMentionFiles("/workspace", "pack", true));

    await waitFor(() => {
      expect(result.current.length).toBe(1);
    });

    expect(result.current[0].name).toBe("package.json");
  });

  it("filters case-insensitively", async () => {
    setupTauriMocks({
      walk_files: () => MOCK_ENTRIES,
    });

    const { result } = renderHook(() => useMentionFiles("/workspace", "READ", true));

    await waitFor(() => {
      expect(result.current.length).toBe(1);
    });

    expect(result.current[0].name).toBe("README.md");
  });

  it("filters by path for subdirectory search", async () => {
    setupTauriMocks({
      walk_files: () => MOCK_ENTRIES,
    });

    const { result } = renderHook(() => useMentionFiles("/workspace", "src/comp", true));

    await waitFor(() => {
      expect(result.current.length).toBe(1);
    });

    expect(result.current[0].name).toBe("App.tsx");
    expect(result.current[0].path).toBe("src/components/App.tsx");
  });

  it("includes parentDir for subdirectory entries", async () => {
    setupTauriMocks({
      walk_files: () => MOCK_ENTRIES,
    });

    const { result } = renderHook(() => useMentionFiles("/workspace", "App", true));

    await waitFor(() => {
      expect(result.current.length).toBe(1);
    });

    expect(result.current[0].parentDir).toBe("src/components/");
  });

  it("sets empty parentDir for root-level files", async () => {
    setupTauriMocks({
      walk_files: () => MOCK_ENTRIES,
    });

    const { result } = renderHook(() => useMentionFiles("/workspace", "package", true));

    await waitFor(() => {
      expect(result.current.length).toBe(1);
    });

    expect(result.current[0].parentDir).toBe("");
  });

  it("limits results to 10 items", async () => {
    const manyEntries = Array.from({ length: 20 }, (_, i) => ({
      name: `file-${i}.ts`,
      path: `file-${i}.ts`,
      isDir: false,
    }));

    setupTauriMocks({
      walk_files: () => manyEntries,
    });

    const { result } = renderHook(() => useMentionFiles("/workspace", "", true));

    await waitFor(() => {
      expect(result.current.length).toBe(10);
    });
  });

  it("returns empty array on invoke error", async () => {
    setupTauriMocks({
      walk_files: () => { throw new Error("Permission denied"); },
    });

    const { result } = renderHook(() => useMentionFiles("/workspace", "", true));

    await waitFor(() => {
      expect(result.current).toEqual([]);
    });
  });

  it("invalidates cache and fetches new files when workspace path changes", async () => {
    const NEW_ENTRIES = [
      { name: "index.ts", path: "index.ts", isDir: false },
      { name: "lib", path: "lib", isDir: true },
    ];

    let callCount = 0;
    setupTauriMocks({
      walk_files: () => {
        callCount++;
        return callCount === 1 ? MOCK_ENTRIES : NEW_ENTRIES;
      },
    });

    const { result, rerender } = renderHook(
      ({ path }) => useMentionFiles(path, "", true),
      { initialProps: { path: "/workspace-a" } },
    );

    await waitFor(() => {
      expect(result.current.length).toBe(MOCK_ENTRIES.length);
    });
    expect(callCount).toBe(1);

    rerender({ path: "/workspace-b" });

    await waitFor(() => {
      expect(result.current.length).toBe(NEW_ENTRIES.length);
    });
    expect(callCount).toBe(2);
    expect(result.current[0].name).toBe("index.ts");
  });

  it("clears stale cache when workspace changes while disabled", async () => {
    const OLD_ENTRIES = [
      { name: "old.ts", path: "old.ts", isDir: false },
    ];
    const NEW_ENTRIES = [
      { name: "new.ts", path: "new.ts", isDir: false },
    ];

    let callCount = 0;
    setupTauriMocks({
      walk_files: () => {
        callCount++;
        return callCount === 1 ? OLD_ENTRIES : NEW_ENTRIES;
      },
    });

    const { result, rerender } = renderHook(
      ({ path, enabled }) => useMentionFiles(path, "", enabled),
      { initialProps: { path: "/workspace-a", enabled: true } },
    );

    await waitFor(() => {
      expect(result.current.length).toBe(1);
      expect(result.current[0].name).toBe("old.ts");
    });

    // Disable (close popover) and switch workspace
    rerender({ path: "/workspace-b", enabled: false });
    expect(result.current).toEqual([]);

    // Re-enable — should fetch new workspace files, not serve old cache
    rerender({ path: "/workspace-b", enabled: true });

    await waitFor(() => {
      expect(result.current.length).toBe(1);
      expect(result.current[0].name).toBe("new.ts");
    });
    expect(callCount).toBe(2);
  });

  it("preserves isDir in entries", async () => {
    setupTauriMocks({
      walk_files: () => MOCK_ENTRIES,
    });

    const { result } = renderHook(() => useMentionFiles("/workspace", "src", true));

    await waitFor(() => {
      expect(result.current.length).toBeGreaterThan(0);
    });

    const srcEntry = result.current.find((e) => e.name === "src");
    expect(srcEntry?.isDir).toBe(true);
  });
});
