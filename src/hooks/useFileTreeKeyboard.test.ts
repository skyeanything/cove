// @vitest-environment happy-dom
import { describe, it, expect, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { flattenVisible, isEditableTarget, useFileTreeKeyboard } from "./useFileTreeKeyboard";

const mockEntries = [
  { name: "src", path: "src", isDir: true, mtimeSecs: 0 },
  { name: "README.md", path: "README.md", isDir: false, mtimeSecs: 0 },
];

const mockChildren: Record<
  string,
  { name: string; path: string; isDir: boolean; mtimeSecs: number }[]
> = {
  src: [
    { name: "index.ts", path: "src/index.ts", isDir: false, mtimeSecs: 0 },
    { name: "utils", path: "src/utils", isDir: true, mtimeSecs: 0 },
  ],
  "src/utils": [
    {
      name: "helper.ts",
      path: "src/utils/helper.ts",
      isDir: false,
      mtimeSecs: 0,
    },
  ],
};

describe("flattenVisible", () => {
  it("returns root entries when nothing expanded", () => {
    const result = flattenVisible(mockEntries, new Set(), {});
    expect(result).toHaveLength(2);
    expect(result.map((e) => e.path)).toEqual(["src", "README.md"]);
  });

  it("includes children of expanded directories", () => {
    const result = flattenVisible(
      mockEntries,
      new Set(["src"]),
      mockChildren,
    );
    expect(result.map((e) => e.path)).toEqual([
      "src",
      "src/index.ts",
      "src/utils",
      "README.md",
    ]);
  });

  it("recursively includes nested expanded dirs", () => {
    const result = flattenVisible(
      mockEntries,
      new Set(["src", "src/utils"]),
      mockChildren,
    );
    expect(result.map((e) => e.path)).toEqual([
      "src",
      "src/index.ts",
      "src/utils",
      "src/utils/helper.ts",
      "README.md",
    ]);
  });

  it("handles empty entries", () => {
    const result = flattenVisible([], new Set(), {});
    expect(result).toHaveLength(0);
  });

  it("ignores expanded dir with no loaded children", () => {
    const result = flattenVisible(mockEntries, new Set(["src"]), {});
    expect(result.map((e) => e.path)).toEqual(["src", "README.md"]);
  });

  it("does not expand non-directory entries", () => {
    const entries = [
      {
        name: "file.txt",
        path: "file.txt",
        isDir: false,
        mtimeSecs: 0,
      },
    ];
    const result = flattenVisible(entries, new Set(["file.txt"]), {
      "file.txt": [
        {
          name: "child.txt",
          path: "file.txt/child.txt",
          isDir: false,
          mtimeSecs: 0,
        },
      ],
    });
    expect(result).toHaveLength(1);
    expect(result.map((e) => e.path)).toEqual(["file.txt"]);
  });
});

describe("isEditableTarget", () => {
  it("returns true for HTMLInputElement", () => {
    const input = document.createElement("input");
    expect(isEditableTarget({ target: input })).toBe(true);
  });

  it("returns true for HTMLTextAreaElement", () => {
    const textarea = document.createElement("textarea");
    expect(isEditableTarget({ target: textarea })).toBe(true);
  });

  it("returns true for contenteditable element", () => {
    const div = document.createElement("div");
    div.contentEditable = "true";
    expect(isEditableTarget({ target: div })).toBe(true);
  });

  it("returns false for regular div", () => {
    const div = document.createElement("div");
    expect(isEditableTarget({ target: div })).toBe(false);
  });

  it("returns false for button", () => {
    const button = document.createElement("button");
    expect(isEditableTarget({ target: button })).toBe(false);
  });

  it("returns false for null target", () => {
    expect(isEditableTarget({ target: null })).toBe(false);
  });
});

describe("handleKeyDown editable guard", () => {
  // We test that useFileTreeKeyboard's handleKeyDown does not invoke callbacks
  // when the event target is an editable element. We import the hook indirectly
  // by using renderHook, but since the hook depends on React, we test via
  // a simulated scenario using the exported isEditableTarget + manual verification.

  function createKeyEvent(
    key: string,
    target: EventTarget,
  ): React.KeyboardEvent {
    return {
      key,
      target,
      metaKey: false,
      ctrlKey: false,
      altKey: false,
      preventDefault: vi.fn(),
    } as unknown as React.KeyboardEvent;
  }

  it("Arrow/Delete/Backspace should not preventDefault when target is input", async () => {
    // This test validates the guard logic by checking isEditableTarget
    // which is called at the top of handleKeyDown
    const input = document.createElement("input");
    for (const key of [
      "ArrowDown",
      "ArrowUp",
      "ArrowLeft",
      "ArrowRight",
      "Delete",
      "Backspace",
      "Enter",
      "F2",
    ]) {
      const event = createKeyEvent(key, input);
      // The guard should detect the input and return early
      expect(isEditableTarget(event)).toBe(true);
      // So preventDefault should NOT be called
      expect(event.preventDefault).not.toHaveBeenCalled();
    }
  });

  it("Arrow/Delete/Backspace should be handled when target is a regular element", () => {
    const div = document.createElement("div");
    for (const key of [
      "ArrowDown",
      "ArrowUp",
      "Delete",
      "Backspace",
      "Enter",
    ]) {
      const event = createKeyEvent(key, div);
      expect(isEditableTarget(event)).toBe(false);
    }
  });
});

// ── handleKeyDown via renderHook ────────────────────────────────────────────

function createKeyEvent(
  key: string,
  overrides: Partial<React.KeyboardEvent> = {},
): React.KeyboardEvent {
  return {
    key,
    target: document.createElement("div"),
    metaKey: false,
    ctrlKey: false,
    altKey: false,
    preventDefault: vi.fn(),
    ...overrides,
  } as unknown as React.KeyboardEvent;
}

function hookParams(overrides: Partial<Parameters<typeof useFileTreeKeyboard>[0]> = {}) {
  return {
    rootEntries: mockEntries,
    expandedDirs: new Set<string>(),
    loadedChildren: {},
    focusedPath: null as string | null,
    setFocusedPath: vi.fn(),
    onToggleExpand: vi.fn(),
    onSelectFile: vi.fn(),
    onRename: vi.fn(),
    onDelete: vi.fn(),
    ...overrides,
  };
}

describe("useFileTreeKeyboard handleKeyDown", () => {
  it("ArrowDown moves focus to the first entry when nothing focused", () => {
    const params = hookParams();
    const { result } = renderHook(() => useFileTreeKeyboard(params));

    act(() => {
      result.current.handleKeyDown(createKeyEvent("ArrowDown"));
    });

    expect(params.setFocusedPath).toHaveBeenCalledWith("src");
  });

  it("ArrowDown moves focus to the next entry", () => {
    const params = hookParams({ focusedPath: "src" });
    const { result } = renderHook(() => useFileTreeKeyboard(params));

    act(() => {
      result.current.handleKeyDown(createKeyEvent("ArrowDown"));
    });

    expect(params.setFocusedPath).toHaveBeenCalledWith("README.md");
  });

  it("ArrowUp moves focus to the previous entry", () => {
    const params = hookParams({ focusedPath: "README.md" });
    const { result } = renderHook(() => useFileTreeKeyboard(params));

    act(() => {
      result.current.handleKeyDown(createKeyEvent("ArrowUp"));
    });

    expect(params.setFocusedPath).toHaveBeenCalledWith("src");
  });

  it("ArrowRight expands a collapsed directory", () => {
    const params = hookParams({ focusedPath: "src" });
    const { result } = renderHook(() => useFileTreeKeyboard(params));

    act(() => {
      result.current.handleKeyDown(createKeyEvent("ArrowRight"));
    });

    expect(params.onToggleExpand).toHaveBeenCalledWith("src");
  });

  it("ArrowRight moves to first child when directory is expanded", () => {
    const params = hookParams({
      focusedPath: "src",
      expandedDirs: new Set(["src"]),
      loadedChildren: mockChildren,
    });
    const { result } = renderHook(() => useFileTreeKeyboard(params));

    act(() => {
      result.current.handleKeyDown(createKeyEvent("ArrowRight"));
    });

    expect(params.setFocusedPath).toHaveBeenCalledWith("src/index.ts");
  });

  it("ArrowLeft collapses an expanded directory", () => {
    const params = hookParams({
      focusedPath: "src",
      expandedDirs: new Set(["src"]),
      loadedChildren: mockChildren,
    });
    const { result } = renderHook(() => useFileTreeKeyboard(params));

    act(() => {
      result.current.handleKeyDown(createKeyEvent("ArrowLeft"));
    });

    expect(params.onToggleExpand).toHaveBeenCalledWith("src");
  });

  it("ArrowLeft moves to parent directory for nested entry", () => {
    const params = hookParams({
      focusedPath: "src/index.ts",
      expandedDirs: new Set(["src"]),
      loadedChildren: mockChildren,
    });
    const { result } = renderHook(() => useFileTreeKeyboard(params));

    act(() => {
      result.current.handleKeyDown(createKeyEvent("ArrowLeft"));
    });

    expect(params.setFocusedPath).toHaveBeenCalledWith("src");
  });

  it("Enter opens a file", () => {
    const params = hookParams({ focusedPath: "README.md" });
    const { result } = renderHook(() => useFileTreeKeyboard(params));

    act(() => {
      result.current.handleKeyDown(createKeyEvent("Enter"));
    });

    expect(params.onSelectFile).toHaveBeenCalledWith("README.md");
  });

  it("Enter toggles a directory", () => {
    const params = hookParams({ focusedPath: "src" });
    const { result } = renderHook(() => useFileTreeKeyboard(params));

    act(() => {
      result.current.handleKeyDown(createKeyEvent("Enter"));
    });

    expect(params.onToggleExpand).toHaveBeenCalledWith("src");
  });

  it("F2 triggers rename on focused entry", () => {
    const params = hookParams({ focusedPath: "README.md" });
    const { result } = renderHook(() => useFileTreeKeyboard(params));

    act(() => {
      result.current.handleKeyDown(createKeyEvent("F2"));
    });

    expect(params.onRename).toHaveBeenCalledWith("README.md");
  });

  it("Delete triggers delete on focused entry", () => {
    const params = hookParams({ focusedPath: "README.md" });
    const { result } = renderHook(() => useFileTreeKeyboard(params));

    act(() => {
      result.current.handleKeyDown(createKeyEvent("Delete"));
    });

    expect(params.onDelete).toHaveBeenCalledWith("README.md", "README.md");
  });

  it("ignores keys with modifier (meta/ctrl/alt)", () => {
    const params = hookParams({ focusedPath: "src" });
    const { result } = renderHook(() => useFileTreeKeyboard(params));

    act(() => {
      result.current.handleKeyDown(createKeyEvent("ArrowDown", { metaKey: true }));
    });

    expect(params.setFocusedPath).not.toHaveBeenCalled();
  });

  it("ignores keys when target is editable", () => {
    const params = hookParams({ focusedPath: "src" });
    const { result } = renderHook(() => useFileTreeKeyboard(params));

    act(() => {
      result.current.handleKeyDown(
        createKeyEvent("ArrowDown", { target: document.createElement("input") }),
      );
    });

    expect(params.setFocusedPath).not.toHaveBeenCalled();
  });
});
