// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useFileTreeDialogs } from "./useFileTreeDialogs";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}));

async function getInvoke() {
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke as ReturnType<typeof vi.fn>;
}

function renderDialogs(overrides: { workspaceRoot?: string | null } = {}) {
  const params = {
    workspaceRoot: overrides.workspaceRoot ?? "/workspace",
    selectedPath: null as string | null,
    setSelected: vi.fn(),
    setExpandedDirs: vi.fn(),
    refreshDir: vi.fn(),
    t: (key: string) => key,
  };
  return { ...renderHook(() => useFileTreeDialogs(params)), params };
}

describe("useFileTreeDialogs", () => {
  let mockInvoke: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    mockInvoke = await getInvoke();
    mockInvoke.mockReset();
  });

  // --- New File ---

  describe("onNewFile", () => {
    it("sets parent path state and resets name/error", () => {
      const { result } = renderDialogs();
      act(() => result.current.onNewFile("src"));
      expect(result.current.newFileParentPath).toBe("src");
      expect(result.current.newFileName).toBe("");
      expect(result.current.newFileError).toBeNull();
    });
  });

  describe("handleNewFileConfirm", () => {
    it("does nothing when name is empty", async () => {
      const { result } = renderDialogs();
      act(() => result.current.onNewFile("src"));
      act(() => result.current.setNewFileName("   "));
      await act(async () => result.current.handleNewFileConfirm());
      expect(mockInvoke).not.toHaveBeenCalled();
    });

    it("rejects names containing /", () => {
      const { result } = renderDialogs();
      act(() => result.current.onNewFile("src"));
      act(() => result.current.setNewFileName("a/b"));
      act(() => result.current.handleNewFileConfirm());
      expect(result.current.newFileError).toBe("explorer.invalidFileName");
      expect(mockInvoke).not.toHaveBeenCalled();
    });

    it("rejects names containing backslash", () => {
      const { result } = renderDialogs();
      act(() => result.current.onNewFile("src"));
      act(() => result.current.setNewFileName("a\\b"));
      act(() => result.current.handleNewFileConfirm());
      expect(result.current.newFileError).toBe("explorer.invalidFileName");
    });

    it("calls create_new_file with correct args on success", async () => {
      mockInvoke.mockResolvedValueOnce(undefined);

      const { result, params } = renderDialogs();
      act(() => result.current.onNewFile("src"));
      act(() => result.current.setNewFileName("test.ts"));
      await act(async () => result.current.handleNewFileConfirm());

      expect(mockInvoke).toHaveBeenCalledWith("create_new_file", {
        args: { workspaceRoot: "/workspace", path: "src/test.ts" },
      });
      expect(mockInvoke).toHaveBeenCalledTimes(1);
      expect(result.current.newFileParentPath).toBeNull();
      expect(result.current.newFileName).toBe("");
      expect(params.setExpandedDirs).toHaveBeenCalled();
    });

    it("sets file-already-exists error when backend returns already exists", async () => {
      mockInvoke.mockRejectedValueOnce({ message: "already exists" });

      const { result } = renderDialogs();
      act(() => result.current.onNewFile(""));
      act(() => result.current.setNewFileName("existing.txt"));
      await act(async () => result.current.handleNewFileConfirm());

      expect(mockInvoke).toHaveBeenCalledWith("create_new_file", {
        args: { workspaceRoot: "/workspace", path: "existing.txt" },
      });
      expect(result.current.newFileError).toBe("explorer.fileAlreadyExists");
      expect(result.current.newFileParentPath).toBe("");
    });

    it("builds path correctly for root parent (empty string)", async () => {
      mockInvoke.mockResolvedValueOnce(undefined);

      const { result } = renderDialogs();
      act(() => result.current.onNewFile(""));
      act(() => result.current.setNewFileName("readme.md"));
      await act(async () => result.current.handleNewFileConfirm());

      expect(mockInvoke).toHaveBeenCalledWith("create_new_file", {
        args: { workspaceRoot: "/workspace", path: "readme.md" },
      });
    });
  });

  describe("handleNewFileCancel", () => {
    it("resets all new file state", () => {
      const { result } = renderDialogs();
      act(() => result.current.onNewFile("src"));
      act(() => result.current.setNewFileName("test.ts"));
      act(() => result.current.handleNewFileCancel());
      expect(result.current.newFileParentPath).toBeNull();
      expect(result.current.newFileName).toBe("");
      expect(result.current.newFileError).toBeNull();
    });
  });

  // --- Existing behavior: New Folder ---

  describe("onNewFolder", () => {
    it("sets folder parent path state", () => {
      const { result } = renderDialogs();
      act(() => result.current.onNewFolder("lib"));
      expect(result.current.newFolderParentPath).toBe("lib");
      expect(result.current.newFolderName).toBe("");
      expect(result.current.newFolderError).toBeNull();
    });
  });

  // --- Existing behavior: Delete ---

  describe("handleConfirmDelete", () => {
    it("invokes remove_entry and clears target", async () => {
      mockInvoke.mockResolvedValueOnce(undefined);

      const { result } = renderDialogs();
      act(() => result.current.onDelete("src/old.ts", "old.ts"));
      expect(result.current.deleteTarget).toEqual({ path: "src/old.ts", name: "old.ts" });

      await act(async () => result.current.handleConfirmDelete());
      expect(mockInvoke).toHaveBeenCalledWith("remove_entry", {
        args: { workspaceRoot: "/workspace", path: "src/old.ts" },
      });
    });
  });
});
