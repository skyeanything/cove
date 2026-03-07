// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}));

import { invoke } from "@tauri-apps/api/core";
import { useFileTreeDnD } from "./useFileTreeDnD";

// Helper to create a minimal React.DragEvent mock
function makeDragEvent(
  overrides: {
    types?: string[];
    files?: Array<{ name: string; path?: string }>;
    data?: Record<string, string>;
  } = {},
): React.DragEvent {
  const data: Record<string, string> = overrides.data ?? {};
  const types = overrides.types ?? Object.keys(data);
  const files = overrides.files ?? [];

  return {
    preventDefault: vi.fn(),
    dataTransfer: {
      setData: vi.fn((key: string, val: string) => {
        data[key] = val;
      }),
      getData: vi.fn((key: string) => data[key] ?? ""),
      types,
      files: files as unknown as FileList,
      effectAllowed: "",
      dropEffect: "",
    },
    relatedTarget: null,
    currentTarget: { contains: () => false },
  } as unknown as React.DragEvent;
}

describe("useFileTreeDnD", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("initializes with null drag state", () => {
    const { result } = renderHook(() =>
      useFileTreeDnD({ workspaceRoot: "/test" }),
    );
    expect(result.current.draggedPath).toBeNull();
    expect(result.current.dropTargetPath).toBeNull();
  });

  it("sets draggedPath on drag start", () => {
    const { result } = renderHook(() =>
      useFileTreeDnD({ workspaceRoot: "/test" }),
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
      useFileTreeDnD({ workspaceRoot: "/test" }),
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
      useFileTreeDnD({ workspaceRoot: "/ws" }),
    );

    // Start dragging an internal file
    act(() => {
      result.current.onDragStart(makeDragEvent(), "dir/file.ts");
    });

    // Drop onto target directory
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

  it("allows external file drop over a directory", () => {
    const { result } = renderHook(() =>
      useFileTreeDnD({ workspaceRoot: "/ws" }),
    );

    const e = makeDragEvent({ types: ["Files"], files: [] });
    act(() => {
      result.current.onDragOver(e, "src", true);
    });

    expect(e.preventDefault).toHaveBeenCalled();
    expect(e.dataTransfer.dropEffect).toBe("copy");
    expect(result.current.dropTargetPath).toBe("src");
  });

  it("does not allow external file drop on a file node", () => {
    const { result } = renderHook(() =>
      useFileTreeDnD({ workspaceRoot: "/ws" }),
    );

    const e = makeDragEvent({ types: ["Files"], files: [] });
    act(() => {
      result.current.onDragOver(e, "src/file.ts", false);
    });

    expect(e.preventDefault).not.toHaveBeenCalled();
    expect(result.current.dropTargetPath).toBeNull();
  });

  it("invokes copy_external_file on external drop", async () => {
    vi.mocked(invoke).mockResolvedValue(undefined);
    const { result } = renderHook(() =>
      useFileTreeDnD({ workspaceRoot: "/ws" }),
    );

    const e = makeDragEvent({
      types: ["Files"],
      files: [{ name: "photo.png", path: "/Users/me/Desktop/photo.png" }],
    });

    act(() => {
      result.current.onDrop(e, "assets");
    });

    // Wait for async invoke
    await vi.waitFor(() => {
      expect(invoke).toHaveBeenCalledWith("copy_external_file", {
        args: {
          workspaceRoot: "/ws",
          externalPath: "/Users/me/Desktop/photo.png",
          destPath: "assets/photo.png",
        },
      });
    });
  });

  it("tries fallback name when first copy fails", async () => {
    vi.mocked(invoke)
      .mockRejectedValueOnce(new Error("destination already exists"))
      .mockResolvedValueOnce(undefined);

    const { result } = renderHook(() =>
      useFileTreeDnD({ workspaceRoot: "/ws" }),
    );

    const e = makeDragEvent({
      types: ["Files"],
      files: [{ name: "doc.pdf", path: "/ext/doc.pdf" }],
    });

    act(() => {
      result.current.onDrop(e, "");
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
  });

  it("allows external file drop on root area", () => {
    const { result } = renderHook(() =>
      useFileTreeDnD({ workspaceRoot: "/ws" }),
    );

    const e = makeDragEvent({ types: ["Files"], files: [] });
    act(() => {
      result.current.onRootDragOver(e);
    });

    expect(e.preventDefault).toHaveBeenCalled();
    expect(e.dataTransfer.dropEffect).toBe("copy");
    expect(result.current.dropTargetPath).toBe("");
  });

  it("invokes copy_external_file on root drop", async () => {
    vi.mocked(invoke).mockResolvedValue(undefined);
    const { result } = renderHook(() =>
      useFileTreeDnD({ workspaceRoot: "/ws" }),
    );

    const e = makeDragEvent({
      types: ["Files"],
      files: [{ name: "readme.txt", path: "/ext/readme.txt" }],
    });

    act(() => {
      result.current.onRootDrop(e);
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
  });

  it("extracts filename from Windows-style backslash path on external drop", async () => {
    vi.mocked(invoke).mockResolvedValue(undefined);
    const { result } = renderHook(() =>
      useFileTreeDnD({ workspaceRoot: "/ws" }),
    );

    const e = makeDragEvent({
      types: ["Files"],
      files: [{ name: "report.docx", path: "C:\\Users\\me\\Documents\\report.docx" }],
    });

    act(() => {
      result.current.onDrop(e, "docs");
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
  });

  it("does nothing when workspaceRoot is null", () => {
    const { result } = renderHook(() =>
      useFileTreeDnD({ workspaceRoot: null }),
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

  it("skips external files without a path property", async () => {
    vi.mocked(invoke).mockResolvedValue(undefined);
    const { result } = renderHook(() =>
      useFileTreeDnD({ workspaceRoot: "/ws" }),
    );

    // File without .path (e.g. browser-only File object)
    const e = makeDragEvent({
      types: ["Files"],
      files: [{ name: "no-path.txt" }],
    });

    act(() => {
      result.current.onDrop(e, "dir");
    });

    // Give time for async code to run
    await new Promise((r) => setTimeout(r, 50));
    expect(invoke).not.toHaveBeenCalled();
  });
});
