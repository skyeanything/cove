// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import React from "react";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
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

  it("sets dropTargetPath on drag over a directory", () => {
    const { result } = renderHook(() =>
      useFileTreeDnD({ workspaceRoot: "/ws" }),
    );

    act(() => {
      result.current.onDragStart(makeDragEvent(), "file.ts");
    });

    const overEvent = makeDragEvent({ types: ["text/plain"] });
    act(() => {
      result.current.onDragOver(overEvent, "src", true);
    });

    expect(result.current.dropTargetPath).toBe("src");
    expect(overEvent.preventDefault).toHaveBeenCalled();
  });

  it("does not set dropTargetPath when hovering over a file", () => {
    const { result } = renderHook(() =>
      useFileTreeDnD({ workspaceRoot: "/ws" }),
    );

    act(() => {
      result.current.onDragStart(makeDragEvent(), "file.ts");
    });

    const overEvent = makeDragEvent({ types: ["text/plain"] });
    act(() => {
      result.current.onDragOver(overEvent, "src/index.ts", false);
    });

    expect(result.current.dropTargetPath).toBeNull();
    expect(overEvent.preventDefault).not.toHaveBeenCalled();
  });

  it("prevents dropping a folder into itself or its descendant", () => {
    const { result } = renderHook(() =>
      useFileTreeDnD({ workspaceRoot: "/ws" }),
    );

    act(() => {
      result.current.onDragStart(makeDragEvent(), "src");
    });

    const overEvent = makeDragEvent({ types: ["text/plain"] });
    act(() => {
      result.current.onDragOver(overEvent, "src/nested", true);
    });

    expect(result.current.dropTargetPath).toBeNull();
    expect(overEvent.preventDefault).not.toHaveBeenCalled();
  });

  it("clears dropTargetPath on drag leave", () => {
    const { result } = renderHook(() =>
      useFileTreeDnD({ workspaceRoot: "/ws" }),
    );

    act(() => {
      result.current.onDragStart(makeDragEvent(), "file.ts");
    });

    const overEvent = makeDragEvent({ types: ["text/plain"] });
    act(() => {
      result.current.onDragOver(overEvent, "src", true);
    });
    expect(result.current.dropTargetPath).toBe("src");

    const leaveEvent = makeDragEvent();
    act(() => {
      result.current.onDragLeave(leaveEvent, "src");
    });
    expect(result.current.dropTargetPath).toBeNull();
  });

  it("calls refreshDir on source and target after move", async () => {
    vi.mocked(invoke).mockResolvedValue(undefined);
    const refreshDir = vi.fn();
    const { result } = renderHook(() =>
      useFileTreeDnD({ workspaceRoot: "/ws", refreshDir }),
    );

    act(() => {
      result.current.onDragStart(makeDragEvent(), "src/file.ts");
    });

    const dropEvent = makeDragEvent({
      types: ["text/plain"],
      data: { "text/plain": "src/file.ts" },
    });
    act(() => {
      result.current.onDrop(dropEvent, "dest");
    });

    await vi.waitFor(() => {
      expect(refreshDir).toHaveBeenCalledWith("src");
      expect(refreshDir).toHaveBeenCalledWith("dest");
    });
  });

  it("moves to root via onRootDrop", () => {
    vi.mocked(invoke).mockResolvedValue(undefined);
    const { result } = renderHook(() =>
      useFileTreeDnD({ workspaceRoot: "/ws" }),
    );

    act(() => {
      result.current.onDragStart(makeDragEvent(), "sub/file.ts");
    });

    const dropEvent = makeDragEvent({
      types: ["text/plain"],
      data: { "text/plain": "sub/file.ts" },
    });
    act(() => {
      result.current.onRootDrop(dropEvent);
    });

    expect(invoke).toHaveBeenCalledWith("move_file", {
      args: { workspaceRoot: "/ws", fromPath: "sub/file.ts", toPath: "file.ts" },
    });
  });

  it("does not move root-level item via onRootDrop", () => {
    const { result } = renderHook(() =>
      useFileTreeDnD({ workspaceRoot: "/ws" }),
    );

    act(() => {
      result.current.onDragStart(makeDragEvent(), "file.ts");
    });

    const dropEvent = makeDragEvent({
      types: ["text/plain"],
      data: { "text/plain": "file.ts" },
    });
    act(() => {
      result.current.onRootDrop(dropEvent);
    });

    expect(invoke).not.toHaveBeenCalled();
  });

  it("allows onRootDragOver only for nested items", () => {
    const { result } = renderHook(() =>
      useFileTreeDnD({ workspaceRoot: "/ws" }),
    );

    // Nested item - should allow
    act(() => {
      result.current.onDragStart(makeDragEvent(), "sub/file.ts");
    });

    const overEvent = makeDragEvent();
    act(() => {
      result.current.onRootDragOver(overEvent);
    });
    expect(overEvent.preventDefault).toHaveBeenCalled();
    expect(result.current.dropTargetPath).toBe("");
  });

  it("blocks onRootDragOver for root-level items", () => {
    const { result } = renderHook(() =>
      useFileTreeDnD({ workspaceRoot: "/ws" }),
    );

    act(() => {
      result.current.onDragStart(makeDragEvent(), "file.ts");
    });

    const overEvent = makeDragEvent();
    act(() => {
      result.current.onRootDragOver(overEvent);
    });
    expect(overEvent.preventDefault).not.toHaveBeenCalled();
  });

  it("skips move when source equals destination", () => {
    const { result } = renderHook(() =>
      useFileTreeDnD({ workspaceRoot: "/ws" }),
    );

    act(() => {
      result.current.onDragStart(makeDragEvent(), "dir/file.ts");
    });

    const dropEvent = makeDragEvent({
      types: ["text/plain"],
      data: { "text/plain": "dir/file.ts" },
    });
    act(() => {
      result.current.onDrop(dropEvent, "dir");
    });

    expect(invoke).not.toHaveBeenCalled();
  });
});
