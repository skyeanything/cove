// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup, waitFor } from "@testing-library/react";
import { FilePathChip, clearExistsCache } from "./FilePathChip";
import { FloatingPreviewContext } from "@/hooks/useFloatingPreview";
import type { FloatingPreviewContextValue } from "@/hooks/useFloatingPreview";

const mockOpenPreview = vi.fn();
const mockOpenExternal = vi.fn();

vi.mock("@/hooks/useOpenFilePreview", () => ({
  useOpenFilePreview: () => ({
    open: vi.fn(),
    openPreview: mockOpenPreview,
    openExternal: mockOpenExternal,
  }),
}));

vi.mock("@/lib/file-tree-icons", () => ({
  getFileIcon: () => null,
}));

const mockInvoke = vi.fn();
vi.mock("@tauri-apps/api/core", () => ({
  invoke: (...args: unknown[]) => mockInvoke(...args),
}));

let mockWorkspaceRoot: string | null = "/workspace";
vi.mock("@/stores/filePreviewStore", () => ({
  useFilePreviewStore: (selector: (s: { workspaceRoot: string | null }) => unknown) =>
    selector({ workspaceRoot: mockWorkspaceRoot }),
}));

beforeEach(() => {
  mockOpenPreview.mockClear();
  mockOpenExternal.mockClear();
  mockInvoke.mockClear();
  mockWorkspaceRoot = "/workspace";
  clearExistsCache();
});

afterEach(cleanup);

// ── Helper: wrap in FloatingPreviewContext ────────────────────────────────────

function makeFloatingCtx(
  overrides?: Partial<FloatingPreviewContextValue>,
): FloatingPreviewContextValue {
  return {
    path: null,
    openPopup: vi.fn(),
    closePopup: vi.fn(),
    ...overrides,
  };
}

function renderWithFloatingCtx(
  chip: React.ReactElement,
  ctx: FloatingPreviewContextValue,
) {
  return render(
    <FloatingPreviewContext value={ctx}>{chip}</FloatingPreviewContext>,
  );
}

// ── Base rendering ────────────────────────────────────────────────────────────

describe("FilePathChip", () => {
  it("renders basename of path as display text by default", () => {
    render(<FilePathChip path="/some/dir/report.pdf" />);
    expect(screen.getByText("report.pdf")).toBeTruthy();
  });

  it("renders custom label when provided", () => {
    render(<FilePathChip path="/some/dir/report.pdf" label="My Report" />);
    expect(screen.getByText("My Report")).toBeTruthy();
    expect(screen.queryByText("report.pdf")).toBeNull();
  });

  it("calls openPreview(path) when clicked (no provider, previewable file)", () => {
    render(<FilePathChip path="/some/dir/report.pdf" />);
    fireEvent.click(screen.getByRole("button"));
    expect(mockOpenPreview).toHaveBeenCalledOnce();
    expect(mockOpenPreview).toHaveBeenCalledWith("/some/dir/report.pdf");
  });

  it("calls openPreview(path) on Enter keypress (no provider)", () => {
    render(<FilePathChip path="/some/dir/report.pdf" />);
    fireEvent.keyDown(screen.getByRole("button"), { key: "Enter" });
    expect(mockOpenPreview).toHaveBeenCalledOnce();
  });

  it("calls openPreview(path) on Space keypress (no provider)", () => {
    render(<FilePathChip path="/some/dir/report.pdf" />);
    fireEvent.keyDown(screen.getByRole("button"), { key: " " });
    expect(mockOpenPreview).toHaveBeenCalledOnce();
  });

  it("does not call any handler on unrelated keypress", () => {
    render(<FilePathChip path="/some/dir/report.pdf" />);
    fireEvent.keyDown(screen.getByRole("button"), { key: "Tab" });
    expect(mockOpenPreview).not.toHaveBeenCalled();
    expect(mockOpenExternal).not.toHaveBeenCalled();
  });

  it("compact variant does not have border styling", () => {
    render(<FilePathChip path="/some/dir/notes.md" compact />);
    const el = screen.getByRole("button");
    expect(el.className).not.toMatch(/border-border/);
    expect(el.className).toMatch(/inline-flex/);
  });

  it("standard variant has border styling", () => {
    render(<FilePathChip path="/some/dir/notes.md" />);
    const el = screen.getByRole("button");
    expect(el.className).toMatch(/border-border/);
    expect(el.className).toMatch(/rounded-md/);
  });

  it("sets title attribute to the full path", () => {
    render(<FilePathChip path="/some/dir/report.pdf" />);
    expect(screen.getByRole("button").getAttribute("title")).toBe("/some/dir/report.pdf");
  });

  it("is keyboard focusable via tabIndex", () => {
    render(<FilePathChip path="/some/dir/report.pdf" />);
    expect(screen.getByRole("button").getAttribute("tabindex")).toBe("0");
  });

  it("applies previewable styles for supported file types", () => {
    render(<FilePathChip path="/some/dir/notes.md" compact />);
    const el = screen.getByRole("button");
    expect(el.className).toMatch(/text-foreground-secondary/);
  });

  it("applies non-previewable styles for unsupported file types", () => {
    render(<FilePathChip path="/some/dir/archive.xyz" compact />);
    const el = screen.getByRole("button");
    expect(el.className).toMatch(/text-foreground-tertiary/);
  });
});

// ── Bare filename verification (from #379) ───────────────────────────────────

describe("FilePathChip bare filename verification", () => {
  it("renders bare filename as plain code initially (before verification)", () => {
    mockInvoke.mockReturnValue(new Promise(() => {}));
    render(<FilePathChip path="report.docx" />);
    const code = screen.getByText("report.docx");
    expect(code.tagName).toBe("CODE");
  });

  it("renders as chip after stat_file resolves (file exists)", async () => {
    mockInvoke.mockResolvedValue({ size: 100, isDir: false });
    render(<FilePathChip path="exists.pdf" />);
    await waitFor(() => {
      expect(screen.getByRole("button")).toBeTruthy();
    });
  });

  it("renders as plain code when stat_file rejects (file not found)", async () => {
    mockInvoke.mockRejectedValue({ kind: "NotFound" });
    render(<FilePathChip path="missing.docx" />);
    await waitFor(() => {
      const el = screen.getByText("missing.docx");
      expect(el.tagName).toBe("CODE");
    });
  });

  it("renders bare filename as plain code when no workspace root", () => {
    mockWorkspaceRoot = null;
    render(<FilePathChip path="noroot.csv" />);
    const el = screen.getByText("noroot.csv");
    expect(el.tagName).toBe("CODE");
  });

  it("does not verify paths that contain /", () => {
    render(<FilePathChip path="some/dir/file.pdf" />);
    expect(mockInvoke).not.toHaveBeenCalled();
    expect(screen.getByRole("button")).toBeTruthy();
  });
});

// ── FloatingPreviewContext integration ────────────────────────────────────────

describe("FilePathChip — with FloatingPreviewContext provider", () => {
  it("calls openPopup for previewable files when provider present", () => {
    const ctx = makeFloatingCtx();
    renderWithFloatingCtx(<FilePathChip path="/workspace/notes.md" />, ctx);
    fireEvent.click(screen.getByRole("button"));
    expect(ctx.openPopup).toHaveBeenCalledWith("/workspace/notes.md");
    expect(mockOpenPreview).not.toHaveBeenCalled();
  });

  it("calls openPopup for .pdf files when provider present", () => {
    const ctx = makeFloatingCtx();
    renderWithFloatingCtx(<FilePathChip path="/workspace/report.pdf" />, ctx);
    fireEvent.click(screen.getByRole("button"));
    expect(ctx.openPopup).toHaveBeenCalledWith("/workspace/report.pdf");
  });
});

describe("FilePathChip — unsupported files", () => {
  it("calls openExternal for unsupported files regardless of provider", () => {
    const ctx = makeFloatingCtx();
    renderWithFloatingCtx(<FilePathChip path="/workspace/archive.zip" />, ctx);
    fireEvent.click(screen.getByRole("button"));
    expect(ctx.openPopup).not.toHaveBeenCalled();
    expect(mockOpenExternal).toHaveBeenCalledWith("/workspace/archive.zip");
  });

  it("calls openExternal for unsupported files without provider", () => {
    render(<FilePathChip path="/workspace/archive.zip" />);
    fireEvent.click(screen.getByRole("button"));
    expect(mockOpenExternal).toHaveBeenCalledWith("/workspace/archive.zip");
  });
});
