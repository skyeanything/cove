// @vitest-environment happy-dom
import { describe, expect, it, vi, beforeEach } from "vitest";
import { setupTauriMocks } from "@/test-utils";
import type { FetchUrlResult } from "@/lib/url-utils";

vi.mock("@/stores/workspaceStore", () => ({
  useWorkspaceStore: {
    getState: vi.fn().mockReturnValue({
      activeWorkspace: null,
    }),
  },
}));

import { useWorkspaceStore } from "@/stores/workspaceStore";
import { fetchUrlTool } from "./fetch-url";

// -- Helpers --

type ExecInput = Parameters<NonNullable<typeof fetchUrlTool.execute>>[0];
type ExecOptions = Parameters<NonNullable<typeof fetchUrlTool.execute>>[1];

async function exec(url: string, opts: Partial<ExecInput> = {}) {
  return fetchUrlTool.execute!({ url, ...opts } as ExecInput, {} as ExecOptions);
}

function makeFetchResult(overrides: Partial<FetchUrlResult> = {}): FetchUrlResult {
  return {
    ok: true,
    source: "https://example.com",
    title: "Example Domain",
    content_md: "# Example\n\nSome content.",
    error: undefined,
    ...overrides,
  };
}

// -- Tests --

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(useWorkspaceStore.getState).mockReturnValue({
    activeWorkspace: null,
  } as ReturnType<typeof useWorkspaceStore.getState>);
});

describe("fetchUrlTool - success with title", () => {
  it("formats result as Markdown with linked title", async () => {
    setupTauriMocks({
      fetch_url: () => makeFetchResult({
        source: "https://example.com",
        title: "My Page",
        content_md: "Hello content",
      }),
    });

    const result = await exec("https://example.com");
    expect(result).toContain("## [My Page](https://example.com)");
    expect(result).toContain("Hello content");
  });
});

describe("fetchUrlTool - success without title", () => {
  it("uses URL as title fallback when title is absent", async () => {
    setupTauriMocks({
      fetch_url: () => makeFetchResult({
        source: "https://example.com/no-title",
        title: undefined,
        content_md: "Content without title",
      }),
    });

    const result = await exec("https://example.com/no-title");
    expect(result).toContain("## https://example.com/no-title");
    expect(result).toContain("Content without title");
  });
});

describe("fetchUrlTool - failure with error message", () => {
  it("returns source + error when ok=false and error is set", async () => {
    setupTauriMocks({
      fetch_url: () => makeFetchResult({
        ok: false,
        source: "https://bad.example.com",
        error: "connection refused",
        content_md: undefined,
      }),
    });

    const result = await exec("https://bad.example.com");
    expect(result).toContain("bad.example.com");
    expect(result).toContain("fetch failed");
    expect(result).toContain("connection refused");
  });
});

describe("fetchUrlTool - failure with no error and no content", () => {
  it("returns 'no readable content' when ok=false and no error", async () => {
    setupTauriMocks({
      fetch_url: () => makeFetchResult({
        ok: false,
        source: "https://empty.example.com",
        error: undefined,
        content_md: undefined,
      }),
    });

    const result = await exec("https://empty.example.com");
    expect(result).toContain("empty.example.com");
    expect(result).toContain("returned no readable content");
  });
});

describe("fetchUrlTool - low quality with cookie retry suggestion", () => {
  it("suggests cookie retry when ok=true but low_quality and retry_with_cookies", async () => {
    setupTauriMocks({
      fetch_url: () => makeFetchResult({
        ok: true,
        source: "https://protected.example.com",
        content_md: "short",
        low_quality: true,
        retry_with_cookies: true,
      }),
    });

    const result = await exec("https://protected.example.com");
    expect(result).toContain("low-quality content");
    expect(result).toContain("useCookies=true");
    expect(result).not.toContain("## ");
  });

  it("suggests cookie retry when ok=false and retry_with_cookies", async () => {
    setupTauriMocks({
      fetch_url: () => makeFetchResult({
        ok: false,
        source: "https://blocked.example.com",
        error: "Forbidden (403)",
        content_md: undefined,
        retry_with_cookies: true,
      }),
    });

    const result = await exec("https://blocked.example.com");
    expect(result).toContain("fetch failed");
    expect(result).toContain("Forbidden (403)");
    expect(result).toContain("useCookies=true");
  });
});

describe("fetchUrlTool - invoke throws", () => {
  it("catches Error and returns failure message", async () => {
    setupTauriMocks({
      fetch_url: () => {
        throw new Error("network timeout");
      },
    });

    const result = await exec("https://timeout.example.com");
    expect(result).toContain("Fetch failed");
    expect(result).toContain("network timeout");
  });

  it("handles non-Error thrown values", async () => {
    setupTauriMocks({
      fetch_url: () => {
        throw "unknown error string";
      },
    });

    const result = await exec("https://example.com");
    expect(result).toContain("Fetch failed");
    expect(result).toContain("unknown error string");
  });
});

describe("fetchUrlTool - saveAsPdf", () => {
  it("returns error when no workspace is active", async () => {
    const result = await exec("https://example.com", { saveAsPdf: true });
    expect(result).toContain("no active workspace");
  });

  it("calls render_url and saves PDF via write_binary_file", async () => {
    vi.mocked(useWorkspaceStore.getState).mockReturnValue({
      activeWorkspace: { path: "/tmp/workspace" },
    } as ReturnType<typeof useWorkspaceStore.getState>);

    setupTauriMocks({
      render_url: () => ({ ok: true, pdf_base64: "PDFDATA", source: "https://example.com" }),
      write_binary_file: () => "/tmp/workspace/example_com_123.pdf",
    });

    const result = await exec("https://example.com", { saveAsPdf: true });
    expect(result).toContain("PDF saved to:");
  });

  it("returns error when render_url fails", async () => {
    vi.mocked(useWorkspaceStore.getState).mockReturnValue({
      activeWorkspace: { path: "/tmp/workspace" },
    } as ReturnType<typeof useWorkspaceStore.getState>);

    setupTauriMocks({
      render_url: () => ({ ok: false, error: "Chrome not found", source: "https://example.com" }),
    });

    const result = await exec("https://example.com", { saveAsPdf: true });
    expect(result).toContain("PDF export failed");
    expect(result).toContain("Chrome not found");
  });
});

describe("fetchUrlTool - saveAsPng", () => {
  it("returns error when no workspace is active", async () => {
    const result = await exec("https://example.com", { saveAsPng: true });
    expect(result).toContain("no active workspace");
  });

  it("calls render_url and saves PNG via write_binary_file", async () => {
    vi.mocked(useWorkspaceStore.getState).mockReturnValue({
      activeWorkspace: { path: "/tmp/workspace" },
    } as ReturnType<typeof useWorkspaceStore.getState>);

    setupTauriMocks({
      render_url: () => ({ ok: true, screenshot_base64: "PNGDATA", source: "https://example.com" }),
      write_binary_file: () => "/tmp/workspace/example_com_123.png",
    });

    const result = await exec("https://example.com", { saveAsPng: true });
    expect(result).toContain("PNG screenshot saved to:");
  });

  it("returns error when render_url fails", async () => {
    vi.mocked(useWorkspaceStore.getState).mockReturnValue({
      activeWorkspace: { path: "/tmp/workspace" },
    } as ReturnType<typeof useWorkspaceStore.getState>);

    setupTauriMocks({
      render_url: () => ({ ok: false, error: "Chrome not found", source: "https://example.com" }),
    });

    const result = await exec("https://example.com", { saveAsPng: true });
    expect(result).toContain("PNG export failed");
    expect(result).toContain("Chrome not found");
  });
});

describe("fetchUrlTool - saveAsMarkdown", () => {
  it("returns error when no workspace is active", async () => {
    const result = await exec("https://example.com", { saveAsMarkdown: true });
    expect(result).toContain("no active workspace");
  });

  it("fetches content and saves as .md file", async () => {
    vi.mocked(useWorkspaceStore.getState).mockReturnValue({
      activeWorkspace: { path: "/tmp/workspace" },
    } as ReturnType<typeof useWorkspaceStore.getState>);

    setupTauriMocks({
      fetch_url: () => ({
        ok: true,
        source: "https://example.com",
        title: "Example",
        content_md: "# Hello\nWorld",
      }),
      write_file: () => undefined,
    });

    const result = await exec("https://example.com", { saveAsMarkdown: true });
    expect(result).toContain("Markdown saved to:");
    expect(result).toContain(".md");
  });

  it("returns error when fetch fails", async () => {
    vi.mocked(useWorkspaceStore.getState).mockReturnValue({
      activeWorkspace: { path: "/tmp/workspace" },
    } as ReturnType<typeof useWorkspaceStore.getState>);

    setupTauriMocks({
      fetch_url: () => ({
        ok: false,
        source: "https://example.com",
        error: "connection refused",
      }),
    });

    const result = await exec("https://example.com", { saveAsMarkdown: true });
    expect(result).toContain("Markdown export failed");
    expect(result).toContain("connection refused");
  });
});
