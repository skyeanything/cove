// @vitest-environment happy-dom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, cleanup, fireEvent } from "@testing-library/react";
import { FileTreeItem, type ListDirEntry } from "./FileTreeItem";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

vi.mock("@/lib/file-tree-icons", () => ({
  getFileIcon: () => null,
}));

vi.mock("@/components/ui/context-menu", () => ({
  ContextMenu: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  ContextMenuContent: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="context-menu">{children}</div>
  ),
  ContextMenuItem: ({ children, onClick }: { children: React.ReactNode; onClick?: () => void }) => (
    <button onClick={onClick}>{children}</button>
  ),
  ContextMenuSeparator: () => <hr />,
  ContextMenuTrigger: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

afterEach(cleanup);

const noop = () => {};

const fileEntry: ListDirEntry = {
  name: "index.ts",
  path: "src/index.ts",
  isDir: false,
  mtimeSecs: 0,
};

const dirEntry: ListDirEntry = {
  name: "src",
  path: "src",
  isDir: true,
  mtimeSecs: 0,
};

function defaultProps(overrides: Partial<Parameters<typeof FileTreeItem>[0]> = {}) {
  return {
    entry: fileEntry,
    workspaceRoot: "/workspace",
    selectedPath: null,
    selectedEntries: undefined as string[] | undefined,
    expandedDirs: new Set<string>(),
    loadedChildren: {},
    editingPath: null,
    onToggleExpand: noop,
    onSelectFile: noop as (e: React.MouseEvent, path: string, isDir: boolean, name: string) => void,
    onLoadChildren: noop,
    onNewFolder: noop,
    onRename: noop,
    onRevealInFinder: noop,
    onCopyRelativePath: noop,
    onCopyAbsolutePath: noop,
    onDelete: noop,
    onRenameSubmit: noop,
    onRenameCancel: noop,
    ...overrides,
  };
}

describe("FileTreeItem selection visibility", () => {
  it("applies selected background when selectedPath matches", () => {
    const { container } = render(
      <FileTreeItem {...defaultProps({ selectedPath: "src/index.ts" })} />,
    );
    const button = container.querySelector("button");
    expect(button).not.toBeNull();
    expect(button!.className).toContain("bg-background-tertiary");
  });

  it("applies selected background via selectedEntries", () => {
    const { container } = render(
      <FileTreeItem {...defaultProps({ selectedEntries: ["src/index.ts"] })} />,
    );
    const button = container.querySelector("button");
    expect(button!.className).toContain("bg-background-tertiary");
  });

  it("does not apply selected background when path does not match", () => {
    const { container } = render(
      <FileTreeItem {...defaultProps({ selectedPath: "other/file.ts" })} />,
    );
    const button = container.querySelector("button");
    expect(button!.className).not.toContain("bg-background-tertiary text-foreground");
  });
});

describe("FileTreeItem click handlers", () => {
  it("calls onSelectFile when clicking a file", () => {
    const onSelectFile = vi.fn();
    const { container } = render(
      <FileTreeItem {...defaultProps({ onSelectFile })} />,
    );
    const button = container.querySelector("button")!;
    fireEvent.click(button);
    expect(onSelectFile).toHaveBeenCalledTimes(1);
    // Design version signature: (event, path, isDir, name)
    expect(onSelectFile.mock.calls[0]![1]).toBe("src/index.ts");
    expect(onSelectFile.mock.calls[0]![2]).toBe(false);
    expect(onSelectFile.mock.calls[0]![3]).toBe("index.ts");
  });

  it("calls onToggleExpand when clicking a directory", () => {
    const onToggleExpand = vi.fn();
    const { container } = render(
      <FileTreeItem
        {...defaultProps({ entry: dirEntry, onToggleExpand })}
      />,
    );
    const button = container.querySelector("button")!;
    fireEvent.click(button);
    expect(onToggleExpand).toHaveBeenCalledWith("src");
  });

  it("does not call handlers when editing", () => {
    const onSelectFile = vi.fn();
    const { container } = render(
      <FileTreeItem
        {...defaultProps({ onSelectFile, editingPath: "src/index.ts" })}
      />,
    );
    const button = container.querySelector("button")!;
    fireEvent.click(button);
    expect(onSelectFile).not.toHaveBeenCalled();
  });
});

describe("FileTreeItem drag-and-drop", () => {
  it("shows drop target ring when isDropTarget", () => {
    const { container } = render(
      <FileTreeItem
        {...defaultProps({ entry: dirEntry, dropTargetPath: "src" })}
      />,
    );
    const button = container.querySelector("button");
    expect(button!.className).toContain("ring-accent/50");
  });

  it("shows dragged opacity when isDragged", () => {
    const { container } = render(
      <FileTreeItem
        {...defaultProps({ draggedPath: "src/index.ts" })}
      />,
    );
    const button = container.querySelector("button");
    expect(button!.className).toContain("opacity-40");
  });
});
