// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, act } from "@testing-library/react";
import { FileTreePanel } from "./FileTreePanel";

// ── Capture props passed to FileTreeItem ────────────────────────────────────

type CapturedProps = {
  focusedPath: string | null;
  onSelectFile: (path: string) => void;
  onToggleExpand: (path: string) => void;
};

let capturedProps: CapturedProps | null = null;

vi.mock("./FileTreeItem", () => ({
  FileTreeItem: (props: CapturedProps & { entry: { path: string; name: string } }) => {
    capturedProps = {
      focusedPath: props.focusedPath,
      onSelectFile: props.onSelectFile,
      onToggleExpand: props.onToggleExpand,
    };
    return <div data-testid={`tree-item-${props.entry.path}`}>{props.entry.name}</div>;
  },
}));

vi.mock("./FileTreeDialogs", () => ({
  FileTreeDialogs: () => null,
}));

vi.mock("./FileTreeSearch", () => ({
  FileTreeSearch: () => null,
}));

// ── Mock stores ─────────────────────────────────────────────────────────────

const mockSetSelected = vi.fn();

vi.mock("@/stores/workspaceStore", () => ({
  useWorkspaceStore: (sel: (s: Record<string, unknown>) => unknown) =>
    sel({ activeWorkspace: { path: "/workspace" } }),
}));

vi.mock("@/stores/filePreviewStore", () => ({
  useFilePreviewStore: (sel: (s: Record<string, unknown>) => unknown) =>
    sel({
      selectedPath: null,
      lastOpenedDirPath: null,
      setSelected: mockSetSelected,
      pendingExpandPath: null,
      setPendingExpandPath: vi.fn(),
    }),
  dirOfPath: (p: string) => (p.includes("/") ? p.replace(/\/[^/]+$/, "") : ""),
}));

vi.mock("@/stores/layoutStore", () => ({
  useLayoutStore: (sel: (s: Record<string, unknown>) => unknown) =>
    sel({ fileTreeShowHidden: false, setFileTreeShowHidden: vi.fn() }),
}));

// ── Mock hooks ──────────────────────────────────────────────────────────────

vi.mock("@/hooks/useFileTreeDialogs", () => ({
  useFileTreeDialogs: () => ({
    onNewFile: vi.fn(),
    onNewFolder: vi.fn(),
    onDelete: vi.fn(),
    dialogState: {},
  }),
}));

vi.mock("@/hooks/useFileTreeDnD", () => ({
  useFileTreeDnD: () => ({
    draggedPath: null,
    dropTargetPath: null,
    onDragStart: vi.fn(),
    onDragEnd: vi.fn(),
    onDragOver: vi.fn(),
    onDragLeave: vi.fn(),
    onDrop: vi.fn(),
    onRootDragOver: vi.fn(),
    onRootDrop: vi.fn(),
  }),
}));

vi.mock("@/hooks/useFileTreeSearch", () => ({
  useFileTreeSearch: () => ({
    filteredRootEntries: [
      { name: "src", path: "src", isDir: true, mtimeSecs: 0 },
      { name: "README.md", path: "README.md", isDir: false, mtimeSecs: 0 },
    ],
    searchOpen: false,
    searchQuery: "",
    setSearchQuery: vi.fn(),
    openSearch: vi.fn(),
    closeSearch: vi.fn(),
    matchCount: 0,
  }),
}));

vi.mock("@/hooks/useFileClipboard", () => ({
  useFileClipboard: () => ({
    sourcePath: null,
    mode: null,
    onCopy: vi.fn(),
    onCut: vi.fn(),
    onPaste: vi.fn(),
  }),
}));

vi.mock("@/hooks/useFileTreeKeyboard", () => ({
  useFileTreeKeyboard: () => ({ flatList: [], handleKeyDown: vi.fn() }),
  isEditableTarget: () => false,
}));

// ── Mock Tauri ──────────────────────────────────────────────────────────────

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn().mockResolvedValue([]),
}));

vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn().mockResolvedValue(() => {}),
}));

// ── Mock i18n & UI ──────────────────────────────────────────────────────────

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (k: string) => k }),
}));

vi.mock("@/components/ui/scroll-area", () => ({
  ScrollArea: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock("@/components/ui/context-menu", () => ({
  ContextMenu: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  ContextMenuContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  ContextMenuItem: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  ContextMenuTrigger: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock("@/lib/file-utils", () => ({
  getAvailableDuplicateName: vi.fn(),
}));

// ── Tests ───────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  capturedProps = null;
});
afterEach(cleanup);

describe("FileTreePanel focusedPath sync", () => {
  it("passes null focusedPath initially", () => {
    render(<FileTreePanel />);
    expect(capturedProps).not.toBeNull();
    expect(capturedProps!.focusedPath).toBeNull();
  });

  it("syncs focusedPath when onSelectFile is called", () => {
    render(<FileTreePanel />);
    expect(capturedProps!.focusedPath).toBeNull();

    act(() => {
      capturedProps!.onSelectFile("README.md");
    });

    expect(mockSetSelected).toHaveBeenCalledWith("README.md");
    expect(capturedProps!.focusedPath).toBe("README.md");
  });

  it("syncs focusedPath when onToggleExpand is called", () => {
    render(<FileTreePanel />);
    expect(capturedProps!.focusedPath).toBeNull();

    act(() => {
      capturedProps!.onToggleExpand("src");
    });

    expect(capturedProps!.focusedPath).toBe("src");
  });

  it("updates focusedPath across multiple interactions", () => {
    render(<FileTreePanel />);

    act(() => {
      capturedProps!.onSelectFile("README.md");
    });
    expect(capturedProps!.focusedPath).toBe("README.md");

    act(() => {
      capturedProps!.onToggleExpand("src");
    });
    expect(capturedProps!.focusedPath).toBe("src");
  });

  it("renders file tree items when workspace is active", () => {
    render(<FileTreePanel />);
    expect(screen.getByTestId("tree-item-src")).toBeTruthy();
    expect(screen.getByTestId("tree-item-README.md")).toBeTruthy();
  });
});
