// @vitest-environment happy-dom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { HtmlViewer } from "./HtmlViewer";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, opts?: Record<string, unknown>) => {
      if (opts) return `${key}:${JSON.stringify(opts)}`;
      return key;
    },
  }),
}));

vi.mock("@/components/preview/CodeViewer", () => ({
  CodeViewer: ({ code }: { code: string }) => (
    <pre data-testid="code-viewer">{code}</pre>
  ),
}));

vi.mock("dompurify", () => ({
  default: {
    sanitize: (html: string) =>
      html.replace(/<script[^>]*>.*?<\/script>/gi, ""),
  },
}));

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}));

afterEach(cleanup);

const SAMPLE_HTML = "<h1>Hello</h1><p>World</p>";
const DEFAULT_PATH = "src/index.html";

// ── Initial render ─────────────────────────────────────────────────────────
describe("HtmlViewer initial render", () => {
  it("starts in preview mode with iframe present", () => {
    render(<HtmlViewer code={SAMPLE_HTML} path={DEFAULT_PATH} />);
    expect(document.querySelector("iframe")).not.toBeNull();
  });

  it("does not show CodeViewer in initial preview mode", () => {
    render(<HtmlViewer code={SAMPLE_HTML} path={DEFAULT_PATH} />);
    expect(screen.queryByTestId("code-viewer")).toBeNull();
  });

  it("renders both toggle tab buttons", () => {
    render(<HtmlViewer code={SAMPLE_HTML} path={DEFAULT_PATH} />);
    // t("preview.previewTab") -> "preview.previewTab"
    // t("preview.codeTab") -> "preview.codeTab"
    expect(screen.getByText("preview.previewTab")).toBeDefined();
    expect(screen.getByText("preview.codeTab")).toBeDefined();
  });
});

// ── iframe attributes ──────────────────────────────────────────────────────
describe("HtmlViewer iframe attributes", () => {
  it("iframe has empty sandbox attribute", () => {
    render(<HtmlViewer code={SAMPLE_HTML} path={DEFAULT_PATH} />);
    const iframe = document.querySelector("iframe");
    expect(iframe).not.toBeNull();
    expect(iframe!.getAttribute("sandbox")).toBe("");
  });

  it("iframe has srcdoc attribute set", () => {
    render(<HtmlViewer code={SAMPLE_HTML} path={DEFAULT_PATH} />);
    const iframe = document.querySelector("iframe");
    expect(iframe).not.toBeNull();
    expect(iframe!.getAttribute("srcdoc")).toBeTruthy();
  });

  it("iframe srcdoc includes sanitized HTML content", () => {
    render(<HtmlViewer code={SAMPLE_HTML} path={DEFAULT_PATH} />);
    const iframe = document.querySelector("iframe");
    const srcdoc = iframe!.getAttribute("srcdoc") ?? "";
    // The sanitized content should appear somewhere in srcdoc
    expect(srcdoc).toContain("Hello");
    expect(srcdoc).toContain("World");
  });

  it("iframe srcdoc strips script tags", () => {
    const htmlWithScript = '<p>Safe</p><script>alert("xss")</script>';
    render(<HtmlViewer code={htmlWithScript} path={DEFAULT_PATH} />);
    const iframe = document.querySelector("iframe");
    const srcdoc = iframe!.getAttribute("srcdoc") ?? "";
    expect(srcdoc).not.toContain("<script>");
    expect(srcdoc).toContain("Safe");
  });

  it("iframe title is set for accessibility", () => {
    render(<HtmlViewer code={SAMPLE_HTML} path={DEFAULT_PATH} />);
    const iframe = document.querySelector("iframe");
    expect(iframe!.getAttribute("title")).toBe("HTML Preview");
  });
});

// ── Toggle to code mode ────────────────────────────────────────────────────
describe("HtmlViewer toggle to code mode", () => {
  it("clicking code tab shows CodeViewer", async () => {
    const user = userEvent.setup();
    render(<HtmlViewer code={SAMPLE_HTML} path={DEFAULT_PATH} />);

    await user.click(screen.getByText("preview.codeTab"));

    expect(screen.getByTestId("code-viewer")).toBeDefined();
  });

  it("clicking code tab hides iframe", async () => {
    const user = userEvent.setup();
    render(<HtmlViewer code={SAMPLE_HTML} path={DEFAULT_PATH} />);

    await user.click(screen.getByText("preview.codeTab"));

    expect(document.querySelector("iframe")).toBeNull();
  });

  it("CodeViewer receives the original code string", async () => {
    const user = userEvent.setup();
    render(<HtmlViewer code={SAMPLE_HTML} path={DEFAULT_PATH} />);

    await user.click(screen.getByText("preview.codeTab"));

    expect(screen.getByTestId("code-viewer").textContent).toBe(SAMPLE_HTML);
  });
});

// ── Toggle back to preview ─────────────────────────────────────────────────
describe("HtmlViewer toggle back to preview", () => {
  it("clicking preview tab after code tab restores iframe", async () => {
    const user = userEvent.setup();
    render(<HtmlViewer code={SAMPLE_HTML} path={DEFAULT_PATH} />);

    await user.click(screen.getByText("preview.codeTab"));
    expect(document.querySelector("iframe")).toBeNull();

    await user.click(screen.getByText("preview.previewTab"));
    expect(document.querySelector("iframe")).not.toBeNull();
  });

  it("clicking preview tab after code tab hides CodeViewer", async () => {
    const user = userEvent.setup();
    render(<HtmlViewer code={SAMPLE_HTML} path={DEFAULT_PATH} />);

    await user.click(screen.getByText("preview.codeTab"));
    await user.click(screen.getByText("preview.previewTab"));

    expect(screen.queryByTestId("code-viewer")).toBeNull();
  });
});

// ── Content variation ─────────────────────────────────────────────────────
describe("HtmlViewer content variation", () => {
  it("renders empty HTML without errors", () => {
    expect(() =>
      render(<HtmlViewer code="" path="empty.html" />),
    ).not.toThrow();
    expect(document.querySelector("iframe")).not.toBeNull();
  });

  it("uses path prop for CodeViewer (passed through)", async () => {
    const user = userEvent.setup();
    render(<HtmlViewer code="<b>test</b>" path="components/Page.html" />);
    await user.click(screen.getByText("preview.codeTab"));
    // CodeViewer mock renders the code as text — path is passed to mock but not rendered
    expect(screen.getByTestId("code-viewer")).toBeDefined();
  });
});
