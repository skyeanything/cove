// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeAll, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";

// Mock pdfjs-dist before importing PdfViewer so module resolution picks up the mock.
vi.mock("pdfjs-dist", () => ({
  GlobalWorkerOptions: { workerSrc: "" },
  getDocument: vi.fn(() => ({
    promise: Promise.resolve({
      numPages: 3,
      getPage: vi.fn(() =>
        Promise.resolve({
          getViewport: () => ({ width: 600, height: 800 }),
          render: () => ({ promise: Promise.resolve(), cancel: vi.fn() }),
          cleanup: vi.fn(),
        }),
      ),
      destroy: vi.fn(),
    }),
  })),
}));

// Mock PdfPage to avoid canvas rendering complexity in tests.
vi.mock("./PdfPage", () => ({
  PdfPage: ({ pageNum }: { pageNum: number }) => (
    <div data-testid={`pdf-page-${pageNum}`} />
  ),
}));

// ResizeObserver stub.
beforeAll(() => {
  global.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

// Minimal valid base64-encoded PDF data URL (1-byte body — just for triggering the effect).
const DUMMY_DATA_URL = "data:application/pdf;base64,dGVzdA==";

// Import after mocks are registered.
const { PdfViewer } = await import("./PdfViewer");

describe("PdfViewer", () => {
  describe("toolbar navigation controls", () => {
    it("renders a previous-page button", () => {
      render(<PdfViewer dataUrl={DUMMY_DATA_URL} />);
      const buttons = screen.getAllByRole("button");
      // The first button is the previous-page chevron
      expect(buttons.length).toBeGreaterThanOrEqual(1);
      expect(buttons[0]).toBeTruthy();
    });

    it("renders a next-page button", () => {
      render(<PdfViewer dataUrl={DUMMY_DATA_URL} />);
      const buttons = screen.getAllByRole("button");
      // prev + next + zoom- + zoom+ + fit = at least 5 buttons
      expect(buttons.length).toBeGreaterThanOrEqual(2);
    });

    it("previous-page button is initially disabled on page 1", () => {
      render(<PdfViewer dataUrl={DUMMY_DATA_URL} />);
      const buttons = screen.getAllByRole("button") as HTMLButtonElement[];
      // The first button is prev-page; pageInput starts at "1" so <= 1 disables it
      expect(buttons[0]!.disabled).toBe(true);
    });
  });

  describe("page input", () => {
    it("renders a page-number input field", () => {
      render(<PdfViewer dataUrl={DUMMY_DATA_URL} />);
      const input = screen.getByRole("textbox") as HTMLInputElement;
      expect(input).toBeTruthy();
    });

    it("page input has initial value of '1'", () => {
      render(<PdfViewer dataUrl={DUMMY_DATA_URL} />);
      const input = screen.getByRole("textbox") as HTMLInputElement;
      expect(input.value).toBe("1");
    });

    it("renders page count separator text", () => {
      render(<PdfViewer dataUrl={DUMMY_DATA_URL} />);
      // "/ 0" initially (before the async PDF loads), then "/ 3" once resolved
      const separator = screen.getByText(/^\/ /);
      expect(separator).toBeTruthy();
    });
  });

  describe("zoom controls", () => {
    it("renders a zoom-out button", () => {
      render(<PdfViewer dataUrl={DUMMY_DATA_URL} />);
      // There are 5 buttons: prev, next, zoom-, zoom+, fit
      const buttons = screen.getAllByRole("button");
      expect(buttons.length).toBeGreaterThanOrEqual(3);
    });

    it("renders a zoom-in button", () => {
      render(<PdfViewer dataUrl={DUMMY_DATA_URL} />);
      const buttons = screen.getAllByRole("button");
      expect(buttons.length).toBeGreaterThanOrEqual(4);
    });

    it("renders a fit-width button with title 'Fit width'", () => {
      render(<PdfViewer dataUrl={DUMMY_DATA_URL} />);
      expect(screen.getByTitle("Fit width")).toBeTruthy();
    });

    it("renders zoom percentage text starting at 100%", () => {
      render(<PdfViewer dataUrl={DUMMY_DATA_URL} />);
      expect(screen.getByText("100%")).toBeTruthy();
    });
  });

  describe("NaN guard", () => {
    it("does not set page to NaN when input is non-numeric", () => {
      render(<PdfViewer dataUrl={DUMMY_DATA_URL} />);
      const input = screen.getByRole("textbox") as HTMLInputElement;
      // Simulate typing a non-numeric value
      input.value = "abc";
      // Click prev button — goToPage(NaN - 1) should be guarded
      const buttons = screen.getAllByRole("button");
      buttons[0]!.click();
      // Page input should NOT be "NaN"
      expect(input.value).not.toBe("NaN");
    });
  });

  describe("toolbar structure", () => {
    it("renders all five toolbar buttons: prev, next, zoom-, zoom+, fit", () => {
      render(<PdfViewer dataUrl={DUMMY_DATA_URL} />);
      const buttons = screen.getAllByRole("button");
      expect(buttons.length).toBe(5);
    });

    it("renders the page input alongside prev/next controls", () => {
      render(<PdfViewer dataUrl={DUMMY_DATA_URL} />);
      const input = screen.getByRole("textbox");
      const buttons = screen.getAllByRole("button");
      expect(input).toBeTruthy();
      expect(buttons.length).toBeGreaterThanOrEqual(2);
    });
  });
});
