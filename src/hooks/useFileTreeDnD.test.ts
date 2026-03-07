// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import React from "react";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}));

// Store the drag-drop callback so tests can trigger Tauri events
let dragDropCallback: ((event: { payload: unknown }) => void) | null = null;
const mockUnlisten = vi.fn();

vi.mock("@tauri-apps/api/webview", () => ({
  getCurrentWebview: () => ({
    onDragDropEvent: (cb: (event: { payload: unknown }) => void) => {
      dragDropCallback = cb;
      return Promise.resolve(mockUnlisten);
    },
  }),
}));

import { invoke } from "@tauri-apps/api/core";
import { useFileTreeDnD } from "./useFileTreeDnD";

function makeDragEvent(
  overrides: {
    types?: string[];
    data?: Record<string, string>;
  } = {},
): React.DragEvent {
  const data: Record<string, string> = overrides.data ?? {};
  const types = overrides.types ?? Object.keys(data);

  return {
    preventDefault: vi.fn(),
    dataTransfer: {
      setData: vi.fn((key: string, val: string) => {
        data[key] = val;
      }),
      getData: vi.fn((key: string) => data[key] ?? ""),
      types,
      effectAllowed: "",
      dropEffect: "",
    },
    relatedTarget: null,
    currentTarget: { contains: () => false },
  } as unknown as React.DragEvent;
}

function makeContainerRef() {
  return { current: document.createElement("div") } as React.RefObject<HTMLDivElement | null>;
}

describe("useFileTreeDnD", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    dragDropCallback = null;
  });

  it("initializes with null drag state", () => {
    const { result } = renderHook(() =>
      useFileTreeDnD({ workspaceRoot: "/test", containerRef: makeContainerRef() }),
    );
    expect(result.current.draggedPath).toBeNull();
    expect(result.current.dropTargetPath).toBeNull();
    expect(result.current.isExternalDragOver).toBe(false);
  });

  it("sets draggedPath on drag start", () => {
    const { result } = renderHook(() =>
      useFileTreeDnD({ workspaceRoot: "/test", containerRef: makeContainerRef() }),
    );
    const e = makeDragEvent();

    act(() => {
      result.current.onDragStart(e, "src/file.ts");
    });

    expect(result.current.draggedPath).toBe("src/file.ts");
    expect(e.dataTransfer.setData).toHaveBeenCalledWith(
      "text/plain",
      "src/file.ts",
    );
  });

  it("clears state on drag end", () => {
    const { result } = renderHook(() =>
      useFileTreeDnD({ workspaceRoot: "/test", containerRef: makeContainerRef() }),
    );

    act(() => {
      result.current.onDragStart(makeDragEvent(), "src/file.ts");
    });
    act(() => {
      result.current.onDragEnd();
    });

    expect(result.current.draggedPath).toBeNull();
    expect(result.current.dropTargetPath).toBeNull();
  });

  it("performs internal move on drop with text/plain data", () => {
    vi.mocked(invoke).mockResolvedValue(undefined);
    const { result } = renderHook(() =>
      useFileTreeDnD({ workspaceRoot: "/ws", containerRef: makeContainerRef() }),
    );

    act(() => {
      result.current.onDragStart(makeDragEvent(), "dir/file.ts");
    });

    const dropEvent = makeDragEvent({
      types: ["text/plain"],
      data: { "text/plain": "dir/file.ts" },
    });
    act(() => {
      result.current.onDrop(dropEvent, "other");
    });

    expect(invoke).toHaveBeenCalledWith("move_file", {
      args: { workspaceRoot: "/ws", fromPath: "dir/file.ts", toPath: "other/file.ts" },
    });
  });

  it("does nothing when workspaceRoot is null", () => {
    const { result } = renderHook(() =>
      useFileTreeDnD({ workspaceRoot: null, containerRef: makeContainerRef() }),
    );

    const e = makeDragEvent({
      types: ["text/plain"],
      data: { "text/plain": "file.ts" },
    });
    act(() => {
      result.current.onDrop(e, "dir");
    });

    expect(invoke).not.toHaveBeenCalled();
  });

  describe("Tauri native drag-drop (external files)", () => {
    it("sets isExternalDragOver on enter event", () => {
      const { result } = renderHook(() =>
        useFileTreeDnD({ workspaceRoot: "/ws", containerRef: makeContainerRef() }),
      );

      expect(dragDropCallback).not.toBeNull();
      act(() => {
        dragDropCallback!({
          payload: { type: "enter", paths: ["/ext/file.txt"], position: { x: 0, y: 0 } },
        });
      });

      expect(result.current.isExternalDragOver).toBe(true);
    });

    it("clears state on leave event", () => {
      const { result } = renderHook(() =>
        useFileTreeDnD({ workspaceRoot: "/ws", containerRef: makeContainerRef() }),
      );

      act(() => {
        dragDropCallback!({
          payload: { type: "enter", paths: ["/ext/file.txt"], position: { x: 0, y: 0 } },
        });
      });
      expect(result.current.isExternalDragOver).toBe(true);

      act(() => {
        dragDropCallback!({ payload: { type: "leave" } });
      });
      expect(result.current.isExternalDragOver).toBe(false);
      expect(result.current.dropTargetPath).toBeNull();
    });

    it("resolves drop target from data-tree-path on over event", () => {
      // Set up a DOM element with data-tree-path
      const btn = document.createElement("button");
      btn.setAttribute("data-tree-path", "src");
      btn.setAttribute("data-tree-is-dir", "true");
      document.body.appendChild(btn);
      btn.getBoundingClientRect = () => ({ x: 10, y: 10, width: 100, height: 30 } as DOMRect);

      vi.spyOn(document, "elementFromPoint").mockReturnValue(btn);

      const { result } = renderHook(() =>
        useFileTreeDnD({ workspaceRoot: "/ws", containerRef: makeContainerRef() }),
      );

      act(() => {
        dragDropCallback!({
          payload: { type: "over", position: { x: 50, y: 20 } },
        });
      });

      expect(result.current.dropTargetPath).toBe("src");

      document.body.removeChild(btn);
      vi.restoreAllMocks();
    });

    it("uses parent dir when hovering over a file on over event", () => {
      const btn = document.createElement("button");
      btn.setAttribute("data-tree-path", "src/index.ts");
      btn.setAttribute("data-tree-is-dir", "false");
      document.body.appendChild(btn);

      vi.spyOn(document, "elementFromPoint").mockReturnValue(btn);

      const { result } = renderHook(() =>
        useFileTreeDnD({ workspaceRoot: "/ws", containerRef: makeContainerRef() }),
      );

      act(() => {
        dragDropCallback!({
          payload: { type: "over", position: { x: 50, y: 20 } },
        });
      });

      expect(result.current.dropTargetPath).toBe("src");

      document.body.removeChild(btn);
      vi.restoreAllMocks();
    });

    it("invokes copy_external_file on drop event", async () => {
      vi.mocked(invoke).mockResolvedValue(undefined);

      const btn = document.createElement("button");
      btn.setAttribute("data-tree-path", "assets");
      btn.setAttribute("data-tree-is-dir", "true");
      document.body.appendChild(btn);
      vi.spyOn(document, "elementFromPoint").mockReturnValue(btn);

      renderHook(() =>
        useFileTreeDnD({ workspaceRoot: "/ws", containerRef: makeContainerRef() }),
      );

      act(() => {
        dragDropCallback!({
          payload: {
            type: "drop",
            paths: ["/Users/me/Desktop/photo.png"],
            position: { x: 50, y: 20 },
          },
        });
      });

      await vi.waitFor(() => {
        expect(invoke).toHaveBeenCalledWith("copy_external_file", {
          args: {
            workspaceRoot: "/ws",
            externalPath: "/Users/me/Desktop/photo.png",
            destPath: "assets/photo.png",
          },
        });
      });

      document.body.removeChild(btn);
      vi.restoreAllMocks();
    });

    it("drops to root when no tree target found", async () => {
      vi.mocked(invoke).mockResolvedValue(undefined);

      const rootDiv = document.createElement("div");
      rootDiv.setAttribute("data-tree-root", "true");
      document.body.appendChild(rootDiv);
      vi.spyOn(document, "elementFromPoint").mockReturnValue(rootDiv);

      renderHook(() =>
        useFileTreeDnD({ workspaceRoot: "/ws", containerRef: makeContainerRef() }),
      );

      act(() => {
        dragDropCallback!({
          payload: {
            type: "drop",
            paths: ["/ext/readme.txt"],
            position: { x: 50, y: 20 },
          },
        });
      });

      await vi.waitFor(() => {
        expect(invoke).toHaveBeenCalledWith("copy_external_file", {
          args: {
            workspaceRoot: "/ws",
            externalPath: "/ext/readme.txt",
            destPath: "readme.txt",
          },
        });
      });

      document.body.removeChild(rootDiv);
      vi.restoreAllMocks();
    });

    it("tries fallback name when first copy fails", async () => {
      vi.mocked(invoke)
        .mockRejectedValueOnce(new Error("destination already exists"))
        .mockResolvedValueOnce(undefined);

      const rootDiv = document.createElement("div");
      rootDiv.setAttribute("data-tree-root", "true");
      document.body.appendChild(rootDiv);
      vi.spyOn(document, "elementFromPoint").mockReturnValue(rootDiv);

      renderHook(() =>
        useFileTreeDnD({ workspaceRoot: "/ws", containerRef: makeContainerRef() }),
      );

      act(() => {
        dragDropCallback!({
          payload: {
            type: "drop",
            paths: ["/ext/doc.pdf"],
            position: { x: 50, y: 20 },
          },
        });
      });

      await vi.waitFor(() => {
        expect(invoke).toHaveBeenCalledTimes(2);
      });

      expect(invoke).toHaveBeenNthCalledWith(1, "copy_external_file", {
        args: { workspaceRoot: "/ws", externalPath: "/ext/doc.pdf", destPath: "doc.pdf" },
      });
      expect(invoke).toHaveBeenNthCalledWith(2, "copy_external_file", {
        args: {
          workspaceRoot: "/ws",
          externalPath: "/ext/doc.pdf",
          destPath: "doc (copy).pdf",
        },
      });

      document.body.removeChild(rootDiv);
      vi.restoreAllMocks();
    });

    it("does nothing on drop when workspaceRoot is null", () => {
      renderHook(() =>
        useFileTreeDnD({ workspaceRoot: null, containerRef: makeContainerRef() }),
      );

      act(() => {
        dragDropCallback!({
          payload: {
            type: "drop",
            paths: ["/ext/file.txt"],
            position: { x: 0, y: 0 },
          },
        });
      });

      expect(invoke).not.toHaveBeenCalled();
    });

    it("cleans up listener on unmount", async () => {
      const { unmount } = renderHook(() =>
        useFileTreeDnD({ workspaceRoot: "/ws", containerRef: makeContainerRef() }),
      );

      unmount();

      // The cleanup calls unlisten.then(fn => fn()), so we need to wait for the microtask
      await vi.waitFor(() => {
        expect(mockUnlisten).toHaveBeenCalled();
      });
    });

    it("handles Windows-style backslash paths", async () => {
      vi.mocked(invoke).mockResolvedValue(undefined);

      const btn = document.createElement("button");
      btn.setAttribute("data-tree-path", "docs");
      btn.setAttribute("data-tree-is-dir", "true");
      document.body.appendChild(btn);
      vi.spyOn(document, "elementFromPoint").mockReturnValue(btn);

      renderHook(() =>
        useFileTreeDnD({ workspaceRoot: "/ws", containerRef: makeContainerRef() }),
      );

      act(() => {
        dragDropCallback!({
          payload: {
            type: "drop",
            paths: ["C:\\Users\\me\\Documents\\report.docx"],
            position: { x: 50, y: 20 },
          },
        });
      });

      await vi.waitFor(() => {
        expect(invoke).toHaveBeenCalledWith("copy_external_file", {
          args: {
            workspaceRoot: "/ws",
            externalPath: "C:\\Users\\me\\Documents\\report.docx",
            destPath: "docs/report.docx",
          },
        });
      });

      document.body.removeChild(btn);
      vi.restoreAllMocks();
    });

    it("copies multiple files on single drop", async () => {
      vi.mocked(invoke).mockResolvedValue(undefined);

      const rootDiv = document.createElement("div");
      rootDiv.setAttribute("data-tree-root", "true");
      document.body.appendChild(rootDiv);
      vi.spyOn(document, "elementFromPoint").mockReturnValue(rootDiv);

      renderHook(() =>
        useFileTreeDnD({ workspaceRoot: "/ws", containerRef: makeContainerRef() }),
      );

      act(() => {
        dragDropCallback!({
          payload: {
            type: "drop",
            paths: ["/ext/a.txt", "/ext/b.txt"],
            position: { x: 50, y: 20 },
          },
        });
      });

      await vi.waitFor(() => {
        expect(invoke).toHaveBeenCalledTimes(2);
      });

      expect(invoke).toHaveBeenCalledWith("copy_external_file", {
        args: { workspaceRoot: "/ws", externalPath: "/ext/a.txt", destPath: "a.txt" },
      });
      expect(invoke).toHaveBeenCalledWith("copy_external_file", {
        args: { workspaceRoot: "/ws", externalPath: "/ext/b.txt", destPath: "b.txt" },
      });

      document.body.removeChild(rootDiv);
      vi.restoreAllMocks();
    });
  });
});
