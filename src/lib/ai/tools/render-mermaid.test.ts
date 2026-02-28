// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi, beforeEach } from "vitest";
import { setupTauriMocks } from "@/test-utils";

// ── Store mocks ──────────────────────────────────────────────────────────────

vi.mock("@/stores/workspaceStore", () => ({
  useWorkspaceStore: {
    getState: vi.fn(),
  },
}));

import { useWorkspaceStore } from "@/stores/workspaceStore";

const mockWorkspace = vi.mocked(useWorkspaceStore.getState);

function withWorkspace(path = "/workspace") {
  mockWorkspace.mockReturnValue({
    activeWorkspace: { id: "ws-1", path, name: "ws", is_default: 1, created_at: "" },
  } as ReturnType<typeof mockWorkspace>);
}

function withNoWorkspace() {
  mockWorkspace.mockReturnValue({
    activeWorkspace: null,
  } as ReturnType<typeof mockWorkspace>);
}

// ── beautiful-mermaid mock ──────────────────────────────────────────────────

const mockRenderMermaidSVG = vi.fn();

vi.mock("beautiful-mermaid", () => ({
  renderMermaidSVG: (...args: unknown[]) => mockRenderMermaidSVG(...args),
  THEMES: {
    "zinc-light": { bg: "#FFFFFF", fg: "#27272A" },
    "zinc-dark": { bg: "#09090B", fg: "#FAFAFA" },
    "nord-light": { bg: "#ECEFF4", fg: "#2E3440" },
    "github-light": { bg: "#FFFFFF", fg: "#1F2328" },
  },
}));

// ── Canvas / Image mocks ────────────────────────────────────────────────────

const BASE64_STUB = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAA";
const DATA_URL_STUB = `data:image/png;base64,${BASE64_STUB}`;

function setupCanvasMocks() {
  const mockCtx = {
    fillStyle: "",
    fillRect: vi.fn(),
    drawImage: vi.fn(),
  };
  const origCreateElement = document.createElement.bind(document);
  vi.spyOn(document, "createElement").mockImplementation((tag: string) => {
    if (tag === "canvas") {
      return {
        width: 0,
        height: 0,
        getContext: () => mockCtx,
        toDataURL: () => DATA_URL_STUB,
      } as unknown as HTMLCanvasElement;
    }
    return origCreateElement(tag);
  });

  vi.stubGlobal(
    "Image",
    class MockImage {
      width = 0;
      height = 0;
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      private _src = "";
      get src() {
        return this._src;
      }
      set src(val: string) {
        this._src = val;
        Promise.resolve().then(() => this.onload?.());
      }
    },
  );

  return mockCtx;
}

// ── Import tool after mocks ──────────────────────────────────────────────────
import { renderMermaidTool } from "./render-mermaid";

// ── Helpers ──────────────────────────────────────────────────────────────────

type ExecInput = Parameters<NonNullable<typeof renderMermaidTool.execute>>[0];
type ExecOptions = Parameters<NonNullable<typeof renderMermaidTool.execute>>[1];

async function exec(input: ExecInput) {
  return renderMermaidTool.execute!(input, {} as ExecOptions);
}

const SVG_STUB = '<svg viewBox="0 0 100 100"><rect/></svg>';

// ── Tests ────────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  withWorkspace("/workspace");
  mockRenderMermaidSVG.mockReturnValue(SVG_STUB);
  setupCanvasMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

// ── No workspace ─────────────────────────────────────────────────────────────

describe("renderMermaidTool – no workspace", () => {
  it("returns error when no workspace is active", async () => {
    withNoWorkspace();
    const result = await exec({ code: "graph TD; A-->B" });
    expect(result).toContain("请先在输入框上方选择工作区目录");
    expect(mockRenderMermaidSVG).not.toHaveBeenCalled();
  });
});

// ── Filename normalization ───────────────────────────────────────────────────

describe("renderMermaidTool – filename normalization", () => {
  function setupWriteMock() {
    let capturedPath = "";
    setupTauriMocks({
      write_binary_file: (payload) => {
        const args = payload as { args: { path: string } };
        capturedPath = args.args.path;
        return `/workspace/${args.args.path}`;
      },
    });
    return () => capturedPath;
  }

  it("generates timestamped filename when omitted", async () => {
    const getPath = setupWriteMock();
    await exec({ code: "graph TD; A-->B" });
    expect(getPath()).toMatch(/^mermaid-\d+\.png$/);
  });

  it("uses provided .png filename as-is", async () => {
    const getPath = setupWriteMock();
    await exec({ code: "graph TD; A-->B", filename: "chart.png" });
    expect(getPath()).toBe("chart.png");
  });

  it("appends .png when extension is missing", async () => {
    const getPath = setupWriteMock();
    await exec({ code: "graph TD; A-->B", filename: "chart" });
    expect(getPath()).toBe("chart.png");
  });

  it("preserves .PNG (case-insensitive check)", async () => {
    const getPath = setupWriteMock();
    await exec({ code: "graph TD; A-->B", filename: "chart.PNG" });
    expect(getPath()).toBe("chart.PNG");
  });

  it("appends .png to non-png extension", async () => {
    const getPath = setupWriteMock();
    await exec({ code: "graph TD; A-->B", filename: "chart.svg" });
    expect(getPath()).toBe("chart.svg.png");
  });
});

// ── Successful render ────────────────────────────────────────────────────────

describe("renderMermaidTool – successful render", () => {
  it("writes file and returns success message", async () => {
    let capturedArgs: Record<string, unknown> = {};
    setupTauriMocks({
      write_binary_file: (payload) => {
        capturedArgs = (payload as { args: Record<string, unknown> }).args;
        return "/workspace/diagram.png";
      },
    });

    const result = await exec({ code: "graph TD; A-->B", filename: "diagram.png" });

    expect(capturedArgs.workspaceRoot).toBe("/workspace");
    expect(capturedArgs.path).toBe("diagram.png");
    expect(typeof capturedArgs.contentBase64).toBe("string");
    expect((capturedArgs.contentBase64 as string).length).toBeGreaterThan(0);
    expect(result).toBe("Mermaid diagram saved to: /workspace/diagram.png");
  });

  it("passes dark theme colors to renderMermaidSVG", async () => {
    setupTauriMocks({
      write_binary_file: () => "/workspace/out.png",
    });

    await exec({ code: "graph TD; A-->B", theme: "dark" });

    expect(mockRenderMermaidSVG).toHaveBeenCalledWith(
      "graph TD; A-->B",
      expect.objectContaining({ bg: "#09090B", fg: "#FAFAFA" }),
    );
  });

  it("uses zinc-light theme when not specified", async () => {
    setupTauriMocks({
      write_binary_file: () => "/workspace/out.png",
    });

    await exec({ code: "graph TD; A-->B" });

    expect(mockRenderMermaidSVG).toHaveBeenCalledWith(
      "graph TD; A-->B",
      expect.objectContaining({ bg: "#FFFFFF", fg: "#27272A" }),
    );
  });
});

// ── Error handling ───────────────────────────────────────────────────────────

describe("renderMermaidTool – error handling", () => {
  it("returns error when renderMermaidSVG throws", async () => {
    mockRenderMermaidSVG.mockImplementation(() => {
      throw new Error("Parse error in graph");
    });
    setupTauriMocks({
      write_binary_file: () => "/workspace/out.png",
    });

    const result = await exec({ code: "invalid mermaid" });
    expect(result).toContain("render_mermaid failed:");
    expect(result).toContain("Parse error in graph");
  });

  it("returns error when write_binary_file throws", async () => {
    setupTauriMocks({
      write_binary_file: () => {
        throw new Error("disk full");
      },
    });

    const result = await exec({ code: "graph TD; A-->B" });
    expect(result).toContain("render_mermaid failed:");
    expect(result).toContain("disk full");
  });

  it("handles non-Error thrown values", async () => {
    mockRenderMermaidSVG.mockImplementation(() => {
      throw "unexpected string error";
    });
    setupTauriMocks({
      write_binary_file: () => "/workspace/out.png",
    });

    const result = await exec({ code: "graph TD; A-->B" });
    expect(result).toContain("render_mermaid failed:");
    expect(result).toContain("unexpected string error");
  });
});
