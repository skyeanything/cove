// @vitest-environment happy-dom
import { describe, it, expect, afterEach, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { createStoreReset } from "@/test-utils/mock-store";

vi.mock("@tauri-apps/plugin-opener", () => ({ openPath: vi.fn(() => Promise.resolve()) }));
vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn(() => Promise.resolve()) }));
vi.mock("@/lib/config", () => ({
  readConfig: vi.fn().mockResolvedValue({
    leftSidebarOpen: true,
    leftSidebarWidth: 260,
    chatWidth: 640,
    filePanelOpen: true,
    fileTreeOpen: true,
    fileTreeWidth: 260,
    filePreviewWidth: 360,
    fileTreeShowHidden: true,
  }),
  writeConfig: vi.fn().mockResolvedValue(undefined),
}));

import { openPath } from "@tauri-apps/plugin-opener";
import { invoke } from "@tauri-apps/api/core";
import { useFilePreviewStore } from "@/stores/filePreviewStore";
import { useLayoutStore } from "@/stores/layoutStore";
import { useWorkspaceStore } from "@/stores/workspaceStore";
import { useOpenFilePreview } from "./useOpenFilePreview";

const resetFilePreview = createStoreReset(useFilePreviewStore);
const resetLayout = createStoreReset(useLayoutStore);
const resetWorkspace = createStoreReset(useWorkspaceStore);

afterEach(() => {
  resetFilePreview();
  resetLayout();
  resetWorkspace();
  vi.clearAllMocks();
});

function setWorkspaceRoot(path: string) {
  useWorkspaceStore.setState({
    activeWorkspace: { id: "ws1", name: "test", path, is_default: 1, created_at: "" },
  });
}

describe("useOpenFilePreview", () => {
  describe("openPreview", () => {
    it("sets selectedPath and opens file panel for absolute path", () => {
      useLayoutStore.setState({ filePanelOpen: false });
      const { result } = renderHook(() => useOpenFilePreview());

      act(() => result.current.openPreview("/abs/path/file.ts"));

      expect(useFilePreviewStore.getState().selectedPath).toBe("/abs/path/file.ts");
      expect(useLayoutStore.getState().filePanelOpen).toBe(true);
    });

    it("keeps relative path as-is for workspace-gated preview loading", () => {
      setWorkspaceRoot("/workspace/root");
      useLayoutStore.setState({ filePanelOpen: false });
      const { result } = renderHook(() => useOpenFilePreview());

      act(() => result.current.openPreview("src/main.ts"));

      expect(useFilePreviewStore.getState().selectedPath).toBe("src/main.ts");
    });

    it("does not modify fileTreeOpen when tree is collapsed", () => {
      useLayoutStore.setState({ filePanelOpen: false, fileTreeOpen: false });
      const { result } = renderHook(() => useOpenFilePreview());

      act(() => result.current.openPreview("/abs/file.ts"));

      expect(useLayoutStore.getState().filePanelOpen).toBe(true);
      expect(useLayoutStore.getState().fileTreeOpen).toBe(false);
    });

    it("does not toggle filePanelOpen when panel is already open", () => {
      useLayoutStore.setState({ filePanelOpen: true });
      const { result } = renderHook(() => useOpenFilePreview());

      act(() => result.current.openPreview("/abs/file.ts"));

      expect(useFilePreviewStore.getState().selectedPath).toBe("/abs/file.ts");
      expect(useLayoutStore.getState().filePanelOpen).toBe(true);
    });
  });

  describe("openExternal", () => {
    it("calls openPath for absolute path", async () => {
      const { result } = renderHook(() => useOpenFilePreview());

      await act(() => result.current.openExternal("/abs/doc.exe"));

      expect(openPath).toHaveBeenCalledWith("/abs/doc.exe");
      expect(invoke).not.toHaveBeenCalled();
    });

    it("calls invoke open_with_app for relative path with workspace root", async () => {
      setWorkspaceRoot("/workspace/root");
      const { result } = renderHook(() => useOpenFilePreview());

      await act(() => result.current.openExternal("docs/report.exe"));

      expect(invoke).toHaveBeenCalledWith("open_with_app", {
        args: { workspaceRoot: "/workspace/root", path: "docs/report.exe", openWith: null },
      });
      expect(openPath).not.toHaveBeenCalled();
    });

    it("does nothing for relative path with no workspace root", async () => {
      const { result } = renderHook(() => useOpenFilePreview());

      await act(() => result.current.openExternal("relative/file.exe"));

      expect(openPath).not.toHaveBeenCalled();
      expect(invoke).not.toHaveBeenCalled();
    });
  });

  describe("open", () => {
    it("routes previewable file to openPreview", () => {
      useLayoutStore.setState({ filePanelOpen: false });
      const { result } = renderHook(() => useOpenFilePreview());

      act(() => result.current.open("/abs/readme.md"));

      expect(useFilePreviewStore.getState().selectedPath).toBe("/abs/readme.md");
      expect(openPath).not.toHaveBeenCalled();
    });

    it("routes unsupported file to openExternal", async () => {
      const { result } = renderHook(() => useOpenFilePreview());

      await act(() => result.current.open("/abs/archive.zip"));

      expect(openPath).toHaveBeenCalledWith("/abs/archive.zip");
      expect(useFilePreviewStore.getState().selectedPath).toBeNull();
    });
  });
});
