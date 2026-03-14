// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { computeSidebarMax, computeChatMax, SIDEBAR_MIN, CHAT_MIN } from "./layout-utils";

// Mock Tauri APIs
vi.mock("@tauri-apps/api/event", () => ({ listen: vi.fn().mockResolvedValue(() => {}) }));
vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn().mockResolvedValue(null) }));
vi.mock("@/lib/settings-window", () => ({ openSettingsWindow: vi.fn() }));

// Mock child components to avoid deep dependency chains
vi.mock("@/components/sidebar/LeftSidebar", () => ({
  LeftSidebar: ({ open }: { open: boolean }) => <div data-testid="left-sidebar" data-open={open} />,
}));
vi.mock("@/components/sidebar/SearchMessagesDialog", () => ({
  SearchMessagesDialog: () => null,
}));
vi.mock("@/components/chat/ChatArea", () => ({
  ChatArea: () => <div data-testid="chat-area" />,
}));
vi.mock("@/components/preview/FilePanelHeader", () => ({
  FilePanelHeader: () => <div data-testid="file-panel-header" />,
}));
vi.mock("@/components/preview/FileTreePanel", () => ({
  FileTreePanel: () => <div data-testid="file-tree-panel" />,
}));
vi.mock("@/components/preview/FilePreviewPanel", () => ({
  FilePreviewPanel: () => <div data-testid="file-preview-panel" />,
}));
vi.mock("./WindowControls", () => ({
  WindowControls: () => <div data-testid="window-controls" />,
}));
vi.mock("@/components/common/GitBashBanner", () => ({
  GitBashBanner: () => null,
}));
vi.mock("@/components/preview/FloatingPreviewPopup", () => ({
  FloatingPreviewProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

// Mock stores with controllable state
const mockLayoutState = {
  leftSidebarOpen: true,
  leftSidebarWidth: 260,
  toggleLeftSidebar: vi.fn(),
  setLeftSidebarWidth: vi.fn(),
  chatWidth: 640,
  setChatWidth: vi.fn(),
  filePanelOpen: true,
  filePanelClosing: false,
  filePanelOpening: false,
  fileTreeOpen: true,
  filePreviewOpen: true,
  fileTreeWidth: 260,
  setFileTreeWidth: vi.fn(),
  setFilePanelOpen: vi.fn(),
  confirmFilePanelClosed: vi.fn(),
  confirmFilePanelOpened: vi.fn(),
};

vi.mock("@/stores/layoutStore", () => ({
  useLayoutStore: (selector: (s: typeof mockLayoutState) => unknown) => selector(mockLayoutState),
}));
vi.mock("@/stores/dataStore", () => ({
  useDataStore: (selector: (s: Record<string, unknown>) => unknown) =>
    selector({ setActiveConversation: vi.fn() }),
}));
vi.mock("@/stores/chatStore", () => ({
  useChatStore: Object.assign(
    (selector: (s: Record<string, unknown>) => unknown) => selector({ reset: vi.fn() }),
    { getState: () => ({ reset: vi.fn() }) },
  ),
}));
vi.mock("@/stores/workspaceStore", () => ({
  useWorkspaceStore: (selector: (s: Record<string, unknown>) => unknown) =>
    selector({ activeWorkspace: null }),
}));
vi.mock("@/stores/filePreviewStore", () => ({
  useFilePreviewStore: Object.assign(
    (selector: (s: Record<string, unknown>) => unknown) =>
      selector({ selectedPath: null, setWorkspaceRoot: vi.fn() }),
    { getState: () => ({ selectedPath: null, setWorkspaceRoot: vi.fn(), invalidate: vi.fn(), setSelected: vi.fn(), setPreviewError: vi.fn() }) },
  ),
}));

import { AppLayout } from "./AppLayout";

beforeEach(() => {
  Object.defineProperty(window, "innerWidth", { value: 1440, writable: true, configurable: true });
});

afterEach(() => {
  cleanup();
});

describe("AppLayout", () => {
  it("renders without crashing", () => {
    const { container } = render(<AppLayout />);
    expect(container.querySelector("[data-testid='chat-area']")).toBeTruthy();
  });

  it("computes sidebar and chat max that fit within viewport", () => {
    const vw = 1440;
    const sidebarW = mockLayoutState.leftSidebarWidth;
    const sMax = computeSidebarMax(vw);
    const cMax = computeChatMax(vw, true, sidebarW);

    // Both should leave room for the other panel
    expect(sMax).toBeLessThan(vw);
    expect(sidebarW + cMax + 100).toBeLessThanOrEqual(vw);
  });

  it("dynamic max values align between store and UI for sidebar-open case", () => {
    const vw = 1440;
    const sidebarW = 300;
    const uiMax = computeChatMax(vw, true, sidebarW);
    // Store uses same formula: vw - sidebarW - 100
    expect(uiMax).toBe(vw - sidebarW - 100);
  });

  it("dynamic max values align between store and UI for sidebar-closed case", () => {
    const vw = 1440;
    const uiMax = computeChatMax(vw, false, 300);
    // Both should use SIDEBAR_MIN when closed
    expect(uiMax).toBe(vw - SIDEBAR_MIN - 100);
  });
});
