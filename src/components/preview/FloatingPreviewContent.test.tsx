// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { FloatingPreviewContent } from "./FloatingPreviewContent";

// ── Mock dependencies ────────────────────────────────────────────────────────

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock("@/stores/workspaceStore", () => ({
  useWorkspaceStore: (sel: (s: Record<string, unknown>) => unknown) =>
    sel({ activeWorkspace: { path: "/workspace" } }),
}));

let mockLoading = false;
let mockError: string | null = null;
let mockCached: { type: "text"; text: string } | { type: "dataUrl"; dataUrl: string } | null = null;

vi.mock("@/hooks/usePreviewContent", () => ({
  usePreviewContent: () => ({
    loading: mockLoading,
    error: mockError,
    cached: mockCached,
  }),
}));

vi.mock("@/components/preview/CodeViewer", () => ({
  CodeViewer: ({ code, path }: { code: string; path: string }) => (
    <pre data-testid="code-viewer" data-path={path}>{code}</pre>
  ),
}));

vi.mock("@/components/preview/CsvViewer", () => ({
  CsvViewer: ({ text }: { text: string }) => (
    <div data-testid="csv-viewer">{text}</div>
  ),
}));

vi.mock("@/components/preview/HtmlViewer", () => ({
  HtmlViewer: ({ code }: { code: string }) => (
    <div data-testid="html-viewer">{code}</div>
  ),
}));

vi.mock("@/components/chat/MarkdownContent", () => ({
  MarkdownContent: ({ source }: { source: string }) => (
    <div data-testid="markdown-content">{source}</div>
  ),
}));

vi.mock("@/components/preview/PdfViewer", () => ({
  PdfViewer: ({ dataUrl }: { dataUrl: string }) => (
    <div data-testid="pdf-viewer" data-src={dataUrl}>PDF</div>
  ),
}));

vi.mock("@/components/preview/DocxViewer", () => ({
  DocxViewer: ({ dataUrl }: { dataUrl: string }) => (
    <div data-testid="docx-viewer" data-src={dataUrl}>DOCX</div>
  ),
}));

vi.mock("@/components/preview/XlsxViewer", () => ({
  XlsxViewer: ({ dataUrl }: { dataUrl: string }) => (
    <div data-testid="xlsx-viewer" data-src={dataUrl}>XLSX</div>
  ),
}));

vi.mock("@/components/preview/PptxViewer", () => ({
  PptxViewer: ({ dataUrl }: { dataUrl: string }) => (
    <div data-testid="pptx-viewer" data-src={dataUrl}>PPTX</div>
  ),
}));

vi.mock("@/components/ui/scroll-area", () => ({
  ScrollArea: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="scroll-area">{children}</div>
  ),
}));

// ── Helpers ──────────────────────────────────────────────────────────────────

function renderContent(path: string) {
  return render(<FloatingPreviewContent path={path} />);
}

// ── Setup / Teardown ─────────────────────────────────────────────────────────

beforeEach(() => {
  mockLoading = false;
  mockError = null;
  mockCached = null;
});

afterEach(cleanup);

// ── Loading state ────────────────────────────────────────────────────────────

describe("FloatingPreviewContent — loading state", () => {
  it("renders loading text while loading", () => {
    mockLoading = true;
    renderContent("/workspace/file.ts");
    expect(screen.getByText("preview.loading")).toBeTruthy();
  });

  it("does not render any viewer while loading", () => {
    mockLoading = true;
    renderContent("/workspace/file.ts");
    expect(screen.queryByTestId("code-viewer")).toBeNull();
    expect(screen.queryByTestId("csv-viewer")).toBeNull();
    expect(screen.queryByTestId("markdown-content")).toBeNull();
  });
});

// ── Error state ──────────────────────────────────────────────────────────────

describe("FloatingPreviewContent — error state", () => {
  it("renders error message when error is set", () => {
    mockError = "Failed to read file";
    renderContent("/workspace/file.ts");
    expect(screen.getByText("Failed to read file")).toBeTruthy();
  });

  it("does not render any viewer when error is set", () => {
    mockError = "Some error";
    renderContent("/workspace/file.ts");
    expect(screen.queryByTestId("code-viewer")).toBeNull();
  });

  it("error container has destructive text styling class", () => {
    mockError = "Disk error";
    renderContent("/workspace/file.ts");
    const errorEl = screen.getByText("Disk error");
    expect(errorEl.closest("div")?.className).toMatch(/text-destructive/);
  });
});

// ── Code files ───────────────────────────────────────────────────────────────

describe("FloatingPreviewContent — code files", () => {
  it("renders CodeViewer for .ts files", () => {
    mockCached = { type: "text", text: "const x = 1;" };
    renderContent("/workspace/src/index.ts");
    expect(screen.getByTestId("code-viewer")).toBeTruthy();
    expect(screen.getByTestId("code-viewer").textContent).toBe("const x = 1;");
  });

  it("renders CodeViewer for .js files", () => {
    mockCached = { type: "text", text: "function foo() {}" };
    renderContent("/workspace/app.js");
    expect(screen.getByTestId("code-viewer")).toBeTruthy();
  });

  it("passes the path prop to CodeViewer", () => {
    mockCached = { type: "text", text: "// code" };
    renderContent("/workspace/utils.ts");
    expect(screen.getByTestId("code-viewer").dataset.path).toBe("/workspace/utils.ts");
  });
});

// ── Markdown files ────────────────────────────────────────────────────────────

describe("FloatingPreviewContent — markdown files", () => {
  it("renders MarkdownContent for .md files", () => {
    mockCached = { type: "text", text: "# Hello\nWorld" };
    renderContent("/workspace/README.md");
    expect(screen.getByTestId("markdown-content")).toBeTruthy();
  });

  it("does not render CodeViewer for .md files", () => {
    mockCached = { type: "text", text: "# Title" };
    renderContent("/workspace/CHANGELOG.md");
    expect(screen.queryByTestId("code-viewer")).toBeNull();
  });
});

// ── CSV files ────────────────────────────────────────────────────────────────

describe("FloatingPreviewContent — CSV files", () => {
  it("renders CsvViewer for .csv files", () => {
    mockCached = { type: "text", text: "Name,Age\nAlice,30\n" };
    renderContent("/workspace/data.csv");
    expect(screen.getByTestId("csv-viewer")).toBeTruthy();
  });
});

// ── Image files ──────────────────────────────────────────────────────────────

describe("FloatingPreviewContent — image files", () => {
  it("renders an img tag for image files", () => {
    mockCached = { type: "dataUrl", dataUrl: "data:image/png;base64,abc" };
    renderContent("/workspace/screenshot.png");
    const img = document.querySelector("img");
    expect(img).not.toBeNull();
    expect(img!.getAttribute("src")).toBe("data:image/png;base64,abc");
  });

  it("uses the path as the img alt text", () => {
    mockCached = { type: "dataUrl", dataUrl: "data:image/jpg;base64,xyz" };
    renderContent("/workspace/photo.jpg");
    const img = document.querySelector("img");
    expect(img!.getAttribute("alt")).toBe("/workspace/photo.jpg");
  });
});

// ── PDF files ────────────────────────────────────────────────────────────────

describe("FloatingPreviewContent — PDF files", () => {
  it("renders PdfViewer when cached dataUrl is available", () => {
    mockCached = { type: "dataUrl", dataUrl: "data:application/pdf;base64,abc" };
    renderContent("/workspace/report.pdf");
    expect(screen.getByTestId("pdf-viewer")).toBeTruthy();
  });
});

// ── Office files ─────────────────────────────────────────────────────────────

describe("FloatingPreviewContent — office files", () => {
  it("renders DocxViewer for .docx files", () => {
    mockCached = { type: "dataUrl", dataUrl: "data:application/docx;base64,abc" };
    renderContent("/workspace/doc.docx");
    expect(screen.getByTestId("docx-viewer")).toBeTruthy();
  });

  it("renders XlsxViewer for .xlsx files", () => {
    mockCached = { type: "dataUrl", dataUrl: "data:application/xlsx;base64,abc" };
    renderContent("/workspace/sheet.xlsx");
    expect(screen.getByTestId("xlsx-viewer")).toBeTruthy();
  });

  it("renders PptxViewer for .pptx files", () => {
    mockCached = { type: "dataUrl", dataUrl: "data:application/pptx;base64,abc" };
    renderContent("/workspace/slides.pptx");
    expect(screen.getByTestId("pptx-viewer")).toBeTruthy();
  });
});

// ── Txt files ─────────────────────────────────────────────────────────────────

describe("FloatingPreviewContent — txt files", () => {
  it("renders text with line numbers for .txt files", () => {
    mockCached = { type: "text", text: "line one\nline two\nline three" };
    renderContent("/workspace/notes.txt");
    const lineNumSpans = document.querySelectorAll(".file-preview-line-num");
    expect(lineNumSpans.length).toBe(3);
  });

  it("line numbers are sequential starting at 1", () => {
    mockCached = { type: "text", text: "a\nb\nc" };
    renderContent("/workspace/notes.txt");
    const lineNumSpans = Array.from(document.querySelectorAll(".file-preview-line-num"));
    expect(lineNumSpans.map((el) => el.textContent?.trim())).toEqual(["1", "2", "3"]);
  });

  it("does not render CodeViewer for .txt files", () => {
    mockCached = { type: "text", text: "plain text" };
    renderContent("/workspace/readme.txt");
    expect(screen.queryByTestId("code-viewer")).toBeNull();
  });
});
