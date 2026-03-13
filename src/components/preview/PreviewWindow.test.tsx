// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent, act } from "@testing-library/react";
import { PreviewWindow } from "./PreviewWindow";

// ── Mock dependencies ────────────────────────────────────────────────────────

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

const mockOpenExternally = vi.fn();
vi.mock("./PreviewFileHeader", () => ({
  useOpenExternally: () => mockOpenExternally,
}));

vi.mock("./FloatingPreviewContent", () => ({
  FloatingPreviewContent: ({ path, workspaceRoot }: { path: string; workspaceRoot: string | null }) => (
    <div data-testid="floating-preview" data-path={path} data-workspace={workspaceRoot ?? ""} />
  ),
}));

vi.mock("@/lib/file-tree-icons", () => ({
  getFileIcon: (_path: string, _cls: string, _sw: number) => <span data-testid="file-icon" />,
}));

let listenCallback: ((event: { payload: { path: string; workspaceRoot: string | null } }) => void) | null = null;
const mockUnlisten = vi.fn();
vi.mock("@tauri-apps/api/event", () => ({
  listen: (_event: string, cb: typeof listenCallback) => {
    listenCallback = cb;
    return Promise.resolve(mockUnlisten);
  },
}));

// ── Helpers ──────────────────────────────────────────────────────────────────

function setLocationSearch(search: string) {
  Object.defineProperty(window, "location", {
    value: { search },
    writable: true,
    configurable: true,
  });
}

// ── Setup / Teardown ─────────────────────────────────────────────────────────

beforeEach(() => {
  mockOpenExternally.mockReset();
  mockUnlisten.mockReset();
  listenCallback = null;
  setLocationSearch("");
});

afterEach(cleanup);

// ── No path (placeholder) ────────────────────────────────────────────────────

describe("PreviewWindow — no path", () => {
  it("renders placeholder when no path in query params", () => {
    render(<PreviewWindow />);
    expect(screen.getByText("preview.selectFile")).toBeTruthy();
  });
});

// ── With path ────────────────────────────────────────────────────────────────

describe("PreviewWindow — with path", () => {
  beforeEach(() => {
    setLocationSearch("?path=/workspace/readme.md&workspace=/workspace");
  });

  it("renders filename in title bar", () => {
    render(<PreviewWindow />);
    expect(screen.getByText("readme.md")).toBeTruthy();
  });

  it("button click calls openExternally", () => {
    render(<PreviewWindow />);
    fireEvent.click(screen.getByText("preview.openDefault"));
    expect(mockOpenExternally).toHaveBeenCalledOnce();
  });

  it("button is NOT inside a data-tauri-drag-region ancestor", () => {
    render(<PreviewWindow />);
    const button = screen.getByText("preview.openDefault").closest("button");
    expect(button).toBeTruthy();
    // Walk up to check no ancestor has data-tauri-drag-region
    let el: HTMLElement | null = button;
    while (el) {
      expect(el.hasAttribute("data-tauri-drag-region")).toBe(false);
      el = el.parentElement;
    }
  });

  it("renders FloatingPreviewContent with path and workspace", () => {
    render(<PreviewWindow />);
    const preview = screen.getByTestId("floating-preview");
    expect(preview.dataset.path).toBe("/workspace/readme.md");
    expect(preview.dataset.workspace).toBe("/workspace");
  });
});

// ── Navigation events ────────────────────────────────────────────────────────

describe("PreviewWindow — preview-navigate events", () => {
  beforeEach(() => {
    setLocationSearch("?path=/workspace/old.ts&workspace=/workspace");
  });

  it("updates path and workspace on preview-navigate", () => {
    render(<PreviewWindow />);
    expect(listenCallback).toBeTruthy();
    act(() => {
      listenCallback!({ payload: { path: "/ws2/new.md", workspaceRoot: "/ws2" } });
    });
    expect(screen.getByText("new.md")).toBeTruthy();
    const preview = screen.getByTestId("floating-preview");
    expect(preview.dataset.path).toBe("/ws2/new.md");
    expect(preview.dataset.workspace).toBe("/ws2");
  });

  it("cleans up event listener on unmount", () => {
    const { unmount } = render(<PreviewWindow />);
    unmount();
    // mockUnlisten is called asynchronously via promise resolution
    // We need to flush the microtask queue
    return Promise.resolve().then(() => {
      expect(mockUnlisten).toHaveBeenCalledOnce();
    });
  });
});
