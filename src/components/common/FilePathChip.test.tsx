// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup, waitFor } from "@testing-library/react";
import { FilePathChip, clearExistsCache } from "./FilePathChip";

const mockOpen = vi.fn();
vi.mock("@/hooks/useOpenFilePreview", () => ({
  useOpenFilePreview: () => ({ open: mockOpen, openPreview: vi.fn(), openExternal: vi.fn() }),
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
  mockOpen.mockClear();
  mockInvoke.mockClear();
  mockWorkspaceRoot = "/workspace";
  clearExistsCache();
});

afterEach(cleanup);

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

  it("calls open(path) when clicked", () => {
    render(<FilePathChip path="/some/dir/report.pdf" />);
    fireEvent.click(screen.getByRole("button"));
    expect(mockOpen).toHaveBeenCalledOnce();
    expect(mockOpen).toHaveBeenCalledWith("/some/dir/report.pdf");
  });

  it("calls open(path) on Enter keypress", () => {
    render(<FilePathChip path="/some/dir/report.pdf" />);
    fireEvent.keyDown(screen.getByRole("button"), { key: "Enter" });
    expect(mockOpen).toHaveBeenCalledOnce();
    expect(mockOpen).toHaveBeenCalledWith("/some/dir/report.pdf");
  });

  it("calls open(path) on Space keypress", () => {
    render(<FilePathChip path="/some/dir/report.pdf" />);
    fireEvent.keyDown(screen.getByRole("button"), { key: " " });
    expect(mockOpen).toHaveBeenCalledOnce();
    expect(mockOpen).toHaveBeenCalledWith("/some/dir/report.pdf");
  });

  it("does not call open on unrelated keypress", () => {
    render(<FilePathChip path="/some/dir/report.pdf" />);
    fireEvent.keyDown(screen.getByRole("button"), { key: "Tab" });
    expect(mockOpen).not.toHaveBeenCalled();
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

describe("FilePathChip bare filename verification", () => {
  it("renders bare filename as plain code initially (before verification)", () => {
    mockInvoke.mockReturnValue(new Promise(() => {})); // never resolves
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
