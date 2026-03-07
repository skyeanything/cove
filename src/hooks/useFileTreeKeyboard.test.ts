import { describe, it, expect } from "vitest";
import { flattenVisible } from "./useFileTreeKeyboard";

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
