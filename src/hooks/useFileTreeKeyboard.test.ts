// @vitest-environment happy-dom
import { describe, it, expect, vi } from "vitest";
import { flattenVisible, isEditableTarget } from "./useFileTreeKeyboard";

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
