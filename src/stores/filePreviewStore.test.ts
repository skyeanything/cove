import { describe, it, expect, afterEach } from "vitest";
import {
  useFilePreviewStore,
  dirOfPath,
  type CachedContent,
} from "./filePreviewStore";
import { createStoreReset } from "@/test-utils/mock-store";

const resetStore = createStoreReset(useFilePreviewStore);
afterEach(() => resetStore());

describe("dirOfPath", () => {
  it("extracts directory from path with slashes", () => {
    expect(dirOfPath("foo/bar/file.txt")).toBe("foo/bar");
  });

  it("handles deeply nested paths", () => {
    expect(dirOfPath("a/b/c/d/file.rs")).toBe("a/b/c/d");
  });

  it("returns empty string for root-level file", () => {
    expect(dirOfPath("file.txt")).toBe("");
  });

  it("handles single directory", () => {
    expect(dirOfPath("src/main.ts")).toBe("src");
  });
});

describe("filePreviewStore", () => {
  describe("setWorkspaceRoot", () => {
    it("sets root and clears all state", () => {
      useFilePreviewStore.setState({
        selectedPath: "old/file.txt",
        lastOpenedDirPath: "old",
        contentCache: { "old/file.txt": { path: "old/file.txt", type: "text", text: "hi" } },
        previewError: "file-deleted",
      });

      useFilePreviewStore.getState().setWorkspaceRoot("/new/root");
      const s = useFilePreviewStore.getState();
      expect(s.workspaceRoot).toBe("/new/root");
      expect(s.selectedPath).toBeNull();
      expect(s.lastOpenedDirPath).toBeNull();
      expect(s.contentCache).toEqual({});
      expect(s.previewError).toBeNull();
    });

    it("can set root to null", () => {
      useFilePreviewStore.setState({ workspaceRoot: "/some/root" });
      useFilePreviewStore.getState().setWorkspaceRoot(null);
      expect(useFilePreviewStore.getState().workspaceRoot).toBeNull();
    });
  });

  describe("setSelected", () => {
    it("updates selectedPath and lastOpenedDirPath", () => {
      useFilePreviewStore.getState().setSelected("src/lib/utils.ts");
      const s = useFilePreviewStore.getState();
      expect(s.selectedPath).toBe("src/lib/utils.ts");
      expect(s.lastOpenedDirPath).toBe("src/lib");
    });

    it("clears previewError", () => {
      useFilePreviewStore.setState({ previewError: "file-deleted" });
      useFilePreviewStore.getState().setSelected("file.txt");
      expect(useFilePreviewStore.getState().previewError).toBeNull();
    });

    it("preserves lastOpenedDirPath when path is null", () => {
      useFilePreviewStore.setState({ lastOpenedDirPath: "src" });
      useFilePreviewStore.getState().setSelected(null);
      const s = useFilePreviewStore.getState();
      expect(s.selectedPath).toBeNull();
      expect(s.lastOpenedDirPath).toBe("src");
    });

    it("sets lastOpenedDirPath to empty string for root-level file", () => {
      useFilePreviewStore.getState().setSelected("readme.md");
      expect(useFilePreviewStore.getState().lastOpenedDirPath).toBe("");
    });
  });

  describe("setContent / invalidate", () => {
    const cached: CachedContent = { path: "a.txt", type: "text", text: "hello" };

    it("caches content by path", () => {
      useFilePreviewStore.getState().setContent("a.txt", cached);
      expect(useFilePreviewStore.getState().contentCache["a.txt"]).toEqual(cached);
    });

    it("invalidate removes cached entry", () => {
      useFilePreviewStore.getState().setContent("a.txt", cached);
      useFilePreviewStore.getState().invalidate("a.txt");
      expect(useFilePreviewStore.getState().contentCache["a.txt"]).toBeUndefined();
    });

    it("invalidate on non-existent key is safe", () => {
      useFilePreviewStore.getState().invalidate("nonexistent");
      expect(useFilePreviewStore.getState().contentCache).toEqual({});
    });
  });

  describe("setPreviewError", () => {
    it("sets error kind", () => {
      useFilePreviewStore.getState().setPreviewError("file-deleted");
      expect(useFilePreviewStore.getState().previewError).toBe("file-deleted");
    });

    it("clears error with null", () => {
      useFilePreviewStore.setState({ previewError: "file-deleted" });
      useFilePreviewStore.getState().setPreviewError(null);
      expect(useFilePreviewStore.getState().previewError).toBeNull();
    });
  });

  describe("clear", () => {
    it("resets all state except workspaceRoot", () => {
      useFilePreviewStore.setState({
        workspaceRoot: "/root",
        selectedPath: "file.txt",
        lastOpenedDirPath: "",
        contentCache: { "file.txt": { path: "file.txt", type: "text" } },
        previewError: "file-deleted",
      });

      useFilePreviewStore.getState().clear();
      const s = useFilePreviewStore.getState();
      expect(s.workspaceRoot).toBe("/root"); // preserved
      expect(s.selectedPath).toBeNull();
      expect(s.lastOpenedDirPath).toBeNull();
      expect(s.contentCache).toEqual({});
      expect(s.previewError).toBeNull();
    });
  });
});
