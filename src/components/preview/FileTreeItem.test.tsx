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
    focusedPath: null,
    expandedDirs: new Set<string>(),
    loadedChildren: {},
    editingPath: null,
    onToggleExpand: noop,
    onSelectFile: noop,
    onLoadChildren: noop,
    onNewFile: noop,
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

describe("FileTreeItem focus visibility", () => {
  it("applies focus ring class when focusedPath matches", () => {
    const { container } = render(
      <FileTreeItem {...defaultProps({ focusedPath: "src/index.ts" })} />,
    );
    const button = container.querySelector("button");
    expect(button).not.toBeNull();
    expect(button!.className).toContain("ring-2");
    expect(button!.className).toContain("ring-accent");
  });

  it("applies background highlight when focused but not selected", () => {
    const { container } = render(
      <FileTreeItem
        {...defaultProps({ focusedPath: "src/index.ts", selectedPath: null })}
      />,
    );
    const button = container.querySelector("button");
    expect(button!.className).toContain("bg-background-tertiary");
  });

  it("does not apply background highlight when focused and selected", () => {
    const { container } = render(
      <FileTreeItem
        {...defaultProps({
          focusedPath: "src/index.ts",
          selectedPath: "src/index.ts",
        })}
      />,
    );
    const button = container.querySelector("button");
    // ring should still appear
    expect(button!.className).toContain("ring-accent");
    // but bg-background-tertiary should not (since isSelected is true)
    expect(button!.className).not.toContain("bg-background-tertiary");
  });

  it("does not apply focus ring when focusedPath does not match", () => {
    const { container } = render(
      <FileTreeItem {...defaultProps({ focusedPath: "other/file.ts" })} />,
    );
    const button = container.querySelector("button");
    expect(button!.className).not.toContain("ring-accent/60");
  });

  it("scrolls focused row into view", () => {
    const scrollIntoView = vi.fn();
    Element.prototype.scrollIntoView = scrollIntoView;

    render(
      <FileTreeItem {...defaultProps({ focusedPath: "src/index.ts" })} />,
    );

    expect(scrollIntoView).toHaveBeenCalledWith({ block: "nearest" });
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
    expect(onSelectFile).toHaveBeenCalledWith("src/index.ts");
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
