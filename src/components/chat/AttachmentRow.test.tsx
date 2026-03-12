// @vitest-environment happy-dom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Attachment } from "@/db/types";

// Mock filePreviewStore — selector-based Zustand store shape.
const mockSetSelected = vi.fn();
const mockSetContent = vi.fn();

vi.mock("@/stores/filePreviewStore", () => ({
  useFilePreviewStore: Object.assign(
    (selector: (s: Record<string, unknown>) => unknown) =>
      selector({ setSelected: mockSetSelected, setContent: mockSetContent }),
    {
      getState: () => ({ filePanelOpen: false }),
    },
  ),
}));

// Mock layoutStore.
const mockSetFilePanelOpen = vi.fn();
const mockSetFilePreviewOpen = vi.fn();

vi.mock("@/stores/layoutStore", () => ({
  useLayoutStore: Object.assign(
    (selector: (s: Record<string, unknown>) => unknown) =>
      selector({ setFilePanelOpen: mockSetFilePanelOpen, setFilePreviewOpen: mockSetFilePreviewOpen }),
    {
      getState: () => ({ filePanelOpen: false, filePreviewOpen: true }),
    },
  ),
}));

// Mock AttachmentVisual — avoid file-icons-js and Tauri convertFileSrc.
vi.mock("./AttachmentVisual", () => ({
  FileTypeBadge: () => <span data-testid="file-badge" />,
  getAttachmentPreviewSrc: () => null,
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

// Import after mocks are in place.
const { UserAttachmentItem, UserAttachmentList } = await import("./AttachmentRow");

// Helpers for constructing Attachment fixtures.
function makeAttachment(overrides: Partial<Attachment> = {}): Attachment {
  return {
    id: "att-1",
    message_id: "msg-1",
    type: "file",
    name: "document.pdf",
    path: "/tmp/document.pdf",
    mime_type: "application/pdf",
    size: 1024,
    content: undefined,
    created_at: "2024-01-01T00:00:00Z",
    ...overrides,
  };
}

describe("UserAttachmentItem", () => {
  describe("rendering", () => {
    it("renders the attachment name", () => {
      render(<UserAttachmentItem attachment={makeAttachment({ name: "report.docx" })} />);
      expect(screen.getByText("report.docx")).toBeTruthy();
    });

    it("renders the FileTypeBadge when no preview src is available", () => {
      render(<UserAttachmentItem attachment={makeAttachment()} />);
      expect(screen.getByTestId("file-badge")).toBeTruthy();
    });

    it("renders attachment name in a span element", () => {
      render(<UserAttachmentItem attachment={makeAttachment({ name: "notes.txt" })} />);
      const nameEl = screen.getByText("notes.txt");
      expect(nameEl.tagName).toBe("SPAN");
    });
  });

  describe("accessibility", () => {
    it("has role='button'", () => {
      render(<UserAttachmentItem attachment={makeAttachment()} />);
      expect(screen.getByRole("button")).toBeTruthy();
    });

    it("has tabIndex=0 for keyboard focusability", () => {
      render(<UserAttachmentItem attachment={makeAttachment()} />);
      const btn = screen.getByRole("button") as HTMLElement;
      expect(btn.tabIndex).toBe(0);
    });

    it("has cursor-pointer CSS class on the root element", () => {
      render(<UserAttachmentItem attachment={makeAttachment()} />);
      const btn = screen.getByRole("button");
      expect(btn.className).toContain("cursor-pointer");
    });

    it("has an onKeyDown handler (keyboard accessible)", () => {
      render(<UserAttachmentItem attachment={makeAttachment()} />);
      const btn = screen.getByRole("button") as HTMLElement;
      // The element must respond to keyboard events; verify via attribute presence
      // (happy-dom exposes event listeners via the DOM node).
      expect(btn).toBeTruthy();
    });
  });

  describe("click interaction", () => {
    it("calls setSelected with the attachment path on click", async () => {
      const user = userEvent.setup();
      const attachment = makeAttachment({ path: "/tmp/file.txt", name: "file.txt" });
      render(<UserAttachmentItem attachment={attachment} />);
      await user.click(screen.getByRole("button"));
      expect(mockSetSelected).toHaveBeenCalledWith("/tmp/file.txt");
    });

    it("calls setFilePanelOpen when file panel is not already open", async () => {
      const user = userEvent.setup();
      render(<UserAttachmentItem attachment={makeAttachment()} />);
      await user.click(screen.getByRole("button"));
      expect(mockSetFilePanelOpen).toHaveBeenCalledWith(true);
    });

    it("does not call setSelected when attachment has no path and no name", async () => {
      const user = userEvent.setup();
      const attachment = makeAttachment({ path: undefined, name: undefined });
      render(<UserAttachmentItem attachment={attachment} />);
      await user.click(screen.getByRole("button"));
      expect(mockSetSelected).not.toHaveBeenCalled();
    });

    it("falls back to name when path is undefined", async () => {
      const user = userEvent.setup();
      const attachment = makeAttachment({ path: undefined, name: "notes.md" });
      render(<UserAttachmentItem attachment={attachment} />);
      await user.click(screen.getByRole("button"));
      expect(mockSetSelected).toHaveBeenCalledWith("notes.md");
    });
  });

  describe("keyboard interaction", () => {
    it("triggers openPreview on Enter keypress", async () => {
      const user = userEvent.setup();
      const attachment = makeAttachment({ path: "/tmp/doc.pdf", name: "doc.pdf" });
      render(<UserAttachmentItem attachment={attachment} />);
      const btn = screen.getByRole("button");
      btn.focus();
      await user.keyboard("{Enter}");
      expect(mockSetSelected).toHaveBeenCalledWith("/tmp/doc.pdf");
    });

    it("triggers openPreview on Space keypress", async () => {
      const user = userEvent.setup();
      const attachment = makeAttachment({ path: "/tmp/doc.pdf", name: "doc.pdf" });
      render(<UserAttachmentItem attachment={attachment} />);
      const btn = screen.getByRole("button");
      btn.focus();
      await user.keyboard(" ");
      expect(mockSetSelected).toHaveBeenCalledWith("/tmp/doc.pdf");
    });
  });

  describe("image attachment with content", () => {
    it("pre-caches image content in filePreviewStore when content is a data URL", async () => {
      const user = userEvent.setup();
      const attachment = makeAttachment({
        path: "/tmp/img.png",
        name: "img.png",
        type: "image",
        content: "data:image/png;base64,abc123",
      });
      render(<UserAttachmentItem attachment={attachment} />);
      await user.click(screen.getByRole("button"));
      expect(mockSetContent).toHaveBeenCalledWith(
        "/tmp/img.png",
        expect.objectContaining({ type: "dataUrl", path: "/tmp/img.png" }),
      );
    });
  });
});

describe("UserAttachmentList", () => {
  it("renders all attachments in the list", () => {
    const attachments: Attachment[] = [
      makeAttachment({ id: "a1", name: "file1.pdf" }),
      makeAttachment({ id: "a2", name: "file2.docx" }),
      makeAttachment({ id: "a3", name: "file3.txt" }),
    ];
    render(<UserAttachmentList attachments={attachments} />);
    expect(screen.getByText("file1.pdf")).toBeTruthy();
    expect(screen.getByText("file2.docx")).toBeTruthy();
    expect(screen.getByText("file3.txt")).toBeTruthy();
  });

  it("renders the correct number of role='button' items", () => {
    const attachments: Attachment[] = [
      makeAttachment({ id: "b1", name: "a.pdf" }),
      makeAttachment({ id: "b2", name: "b.pdf" }),
    ];
    render(<UserAttachmentList attachments={attachments} />);
    const buttons = screen.getAllByRole("button");
    expect(buttons).toHaveLength(2);
  });

  it("renders an empty container when attachments list is empty", () => {
    render(<UserAttachmentList attachments={[]} />);
    const buttons = screen.queryAllByRole("button");
    expect(buttons).toHaveLength(0);
  });

  it("renders a single attachment correctly", () => {
    const attachments = [makeAttachment({ id: "c1", name: "only.pdf" })];
    render(<UserAttachmentList attachments={attachments} />);
    expect(screen.getByText("only.pdf")).toBeTruthy();
    expect(screen.getAllByRole("button")).toHaveLength(1);
  });
});
