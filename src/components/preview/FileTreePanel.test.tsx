// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { FileTreePanel } from "./FileTreePanel";

// ── Mock FileTreeItem to capture props ──────────────────────────

vi.mock("./FileTreeItem", () => ({
  FileTreeItem: (props: { entry: { path: string; name: string } }) => {
    return <div data-testid={`tree-item-${props.entry.path}`}>{props.entry.name}</div>;
  },
}));

vi.mock("./FileTreeDialogs", () => ({
  FileTreeDialogs: () => null,
}));

vi.mock("./FileTreeSearch", () => ({
  FileTreeSearch: () => null,
}));

// ── Mock stores ─────────────────────────────────────────────────

vi.mock("@/stores/workspaceStore", () => ({
  useWorkspaceStore: (sel: (s: Record<string, unknown>) => unknown) =>
    sel({
      workspaces: [
        { id: "ws-1", name: "my-project", path: "/workspace", is_default: false },
      ],
      activeWorkspace: { id: "ws-1", path: "/workspace" },
      add: vi.fn(),
      remove: vi.fn(),
      select: vi.fn(),
    }),
}));

const mockSetSelected = vi.fn();
const mockToggleSelected = vi.fn();

vi.mock("@/stores/filePreviewStore", () => ({
  useFilePreviewStore: Object.assign(
    (sel: (s: Record<string, unknown>) => unknown) =>
      sel({
        selectedPath: null,
        lastOpenedDirPath: null,
        setSelected: mockSetSelected,
        toggleSelected: mockToggleSelected,
        selectedEntries: [],
        pendingExpandPath: null,
        setPendingExpandPath: vi.fn(),
        setSelectedWorkspaceRoot: vi.fn(),
      }),
    {
      getState: () => ({
        selectedPath: null,
        lastOpenedDirPath: null,
        setSelected: mockSetSelected,
        toggleSelected: mockToggleSelected,
        selectedEntries: [],
        pendingExpandPath: null,
        setPendingExpandPath: vi.fn(),
        setSelectedWorkspaceRoot: vi.fn(),
      }),
    },
  ),
  dirOfPath: (p: string) => (p.includes("/") ? p.replace(/\/[^/]+$/, "") : ""),
}));

vi.mock("@/stores/dataStore", () => ({
  useDataStore: (sel: (s: Record<string, unknown>) => unknown) =>
    sel({ setActiveConversation: vi.fn() }),
}));

vi.mock("@/stores/chatStore", () => ({
  useChatStore: Object.assign(
    (sel: (s: Record<string, unknown>) => unknown) => sel({ reset: vi.fn() }),
    { getState: () => ({ reset: vi.fn() }) },
  ),
}));

const { mockLayoutState } = vi.hoisted(() => {
  const mockLayoutState = {
    fileTreeShowHidden: false,
    setFileTreeShowHidden: vi.fn(),
    setFileTreeOpen: vi.fn(),
    setFilePreviewOpen: vi.fn(),
    filePreviewOpen: false,
  };
  return { mockLayoutState };
});

vi.mock("@/stores/layoutStore", () => {
  const store = Object.assign(
    (sel: (s: Record<string, unknown>) => unknown) => sel(mockLayoutState),
    { getState: () => mockLayoutState },
  );
  return { useLayoutStore: store };
});

// ── Mock hooks ──────────────────────────────────────────────────

vi.mock("@/hooks/useFileTreeDialogs", () => ({
  useFileTreeDialogs: () => ({
    onNewFile: vi.fn(),
    onNewFolder: vi.fn(),
    onDelete: vi.fn(),
    deleteTarget: null,
    setDeleteTarget: vi.fn(),
    newFolderParentPath: null,
    newFolderName: "",
    setNewFolderName: vi.fn(),
    newFolderError: null,
    setNewFolderError: vi.fn(),
    handleConfirmDelete: vi.fn(),
    handleNewFolderConfirm: vi.fn(),
    handleNewFolderCancel: vi.fn(),
    newFileParentPath: null,
    newFileName: "",
    setNewFileName: vi.fn(),
    newFileError: null,
    setNewFileError: vi.fn(),
    handleNewFileConfirm: vi.fn(),
    handleNewFileCancel: vi.fn(),
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

vi.mock("@/hooks/useFileClipboard", () => ({
  useFileClipboard: () => ({
    sourcePath: null,
    mode: null,
    onCopy: vi.fn(),
    onCut: vi.fn(),
    onPaste: vi.fn(),
  }),
}));

// ── Mock Tauri ──────────────────────────────────────────────────

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn().mockResolvedValue([
    { name: "src", path: "src", isDir: true, mtimeSecs: 0 },
    { name: "README.md", path: "README.md", isDir: false, mtimeSecs: 0 },
  ]),
}));

vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn().mockResolvedValue(() => {}),
}));

vi.mock("@tauri-apps/plugin-dialog", () => ({
  open: vi.fn(),
}));

// ── Mock i18n & UI ──────────────────────────────────────────────

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
  ContextMenuSeparator: () => <hr />,
  ContextMenuTrigger: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock("@/components/ui/alert-dialog", () => ({
  AlertDialog: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  AlertDialogAction: ({ children }: { children: React.ReactNode }) => <button>{children}</button>,
  AlertDialogCancel: ({ children }: { children: React.ReactNode }) => <button>{children}</button>,
  AlertDialogContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  AlertDialogDescription: ({ children }: { children: React.ReactNode }) => <p>{children}</p>,
  AlertDialogFooter: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  AlertDialogHeader: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  AlertDialogTitle: ({ children }: { children: React.ReactNode }) => <h2>{children}</h2>,
}));

// ── Tests ───────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
});
afterEach(cleanup);

describe("FileTreePanel multi-workspace", () => {
  it("renders workspace header", () => {
    render(<FileTreePanel />);
    expect(screen.getByText("sidebar.workspace")).toBeTruthy();
  });

  it("renders workspace root node with name", async () => {
    render(<FileTreePanel />);
    expect(screen.getByText("my-project")).toBeTruthy();
  });

  it("renders file tree items when workspace loads", async () => {
    render(<FileTreePanel />);
    // Wait for async listDir to resolve and render items
    await vi.waitFor(() => {
      expect(screen.getByTestId("tree-item-src")).toBeTruthy();
      expect(screen.getByTestId("tree-item-README.md")).toBeTruthy();
    });
  });
});
