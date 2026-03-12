// @vitest-environment happy-dom
import { describe, expect, it, vi, beforeEach } from "vitest";
import type { ModelMessage } from "ai";
import { setupTauriMocks } from "@/test-utils";

vi.mock("@/lib/url-utils", () => ({
  extractUrls: vi.fn().mockReturnValue([]),
  buildFetchBlockFromResults: vi.fn().mockReturnValue(""),
}));

import { extractUrls, buildFetchBlockFromResults } from "@/lib/url-utils";
import { getFetchBlockForText, injectUrlFetchResult, injectFetchBlockIntoLastUserMessage } from "./chat-url-utils";
import type { UrlFetchResult } from "./chat-url-utils";

/** Extract text from a ModelMessage's first content part (test helper) */
function textOf(msg: ModelMessage): string {
  const c = msg as { content: string | Array<{ type: string; text?: string }> };
  if (typeof c.content === "string") return c.content;
  return c.content[0]?.text ?? "";
}

const mockExtractUrls = vi.mocked(extractUrls);
const mockBuildBlock = vi.mocked(buildFetchBlockFromResults);

describe("getFetchBlockForText", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockExtractUrls.mockReturnValue([]);
    mockBuildBlock.mockReturnValue("");
  });

  it("returns empty result when no URLs found", async () => {
    mockExtractUrls.mockReturnValue([]);
    const result = await getFetchBlockForText("no urls here");
    expect(result).toEqual({ textBlock: "", screenshotParts: [] });
  });

  it("invokes fetch_url for each URL and builds result", async () => {
    mockExtractUrls.mockReturnValue(["https://example.com"]);
    mockBuildBlock.mockReturnValue("[fetched content]");

    setupTauriMocks({
      fetch_url: () => ({
        ok: true,
        content_md: "Hello",
        source: "https://example.com",
      }),
    });

    const result = await getFetchBlockForText("check https://example.com");
    expect(result.textBlock).toBe("[fetched content]");
    expect(result.screenshotParts).toEqual([]);
    expect(mockBuildBlock).toHaveBeenCalledWith([
      expect.objectContaining({ ok: true, source: "https://example.com" }),
    ]);
  });

  it("handles invoke errors gracefully by pushing error result", async () => {
    mockExtractUrls.mockReturnValue(["https://fail.com"]);
    mockBuildBlock.mockReturnValue("[error block]");

    setupTauriMocks({
      fetch_url: () => {
        throw new Error("Network error");
      },
    });

    const result = await getFetchBlockForText("check https://fail.com");
    expect(result.textBlock).toBe("[error block]");
    expect(mockBuildBlock).toHaveBeenCalledWith([
      expect.objectContaining({ ok: false, error: "Network error", source: "https://fail.com" }),
    ]);
  });

  it("handles multiple URLs", async () => {
    mockExtractUrls.mockReturnValue(["https://a.com", "https://b.com"]);
    mockBuildBlock.mockReturnValue("[multi]");

    setupTauriMocks({
      fetch_url: (payload) => {
        const args = payload as { args: { url: string } };
        return { ok: true, content_md: "OK", source: args.args.url };
      },
    });

    const result = await getFetchBlockForText("a and b");
    expect(result.textBlock).toBe("[multi]");
    expect(mockBuildBlock).toHaveBeenCalledWith([
      expect.objectContaining({ source: "https://a.com" }),
      expect.objectContaining({ source: "https://b.com" }),
    ]);
  });

  it("does not call render_url when modelSupportsVision is false", async () => {
    mockExtractUrls.mockReturnValue(["https://example.com"]);
    mockBuildBlock.mockReturnValue("[text]");

    let renderCalled = false;
    setupTauriMocks({
      fetch_url: () => ({ ok: true, content_md: "Hello", source: "https://example.com" }),
      render_url: () => { renderCalled = true; return { ok: true, screenshot_base64: "AAAA", source: "https://example.com" }; },
    });

    const result = await getFetchBlockForText("check https://example.com", { modelSupportsVision: false });
    expect(result.textBlock).toBe("[text]");
    expect(result.screenshotParts).toEqual([]);
    expect(renderCalled).toBe(false);
  });

  it("calls render_url when modelSupportsVision is true", async () => {
    mockExtractUrls.mockReturnValue(["https://example.com"]);
    mockBuildBlock.mockReturnValue("[text]");

    setupTauriMocks({
      fetch_url: () => ({ ok: true, content_md: "Hello", source: "https://example.com" }),
      render_url: () => ({ ok: true, screenshot_base64: "AAAA", source: "https://example.com" }),
    });

    const result = await getFetchBlockForText("check https://example.com", { modelSupportsVision: true });
    expect(result.textBlock).toBe("[text]");
    expect(result.screenshotParts).toHaveLength(1);
    expect(result.screenshotParts[0]).toEqual({
      type: "image",
      image: "data:image/png;base64,AAAA",
    });
  });

  it("handles render_url failure gracefully (still returns text block)", async () => {
    mockExtractUrls.mockReturnValue(["https://example.com"]);
    mockBuildBlock.mockReturnValue("[text]");

    setupTauriMocks({
      fetch_url: () => ({ ok: true, content_md: "Hello", source: "https://example.com" }),
      render_url: () => { throw new Error("Chrome not found"); },
    });

    const result = await getFetchBlockForText("check https://example.com", { modelSupportsVision: true });
    expect(result.textBlock).toBe("[text]");
    expect(result.screenshotParts).toEqual([]);
  });

  it("returns screenshot parts when render_url succeeds", async () => {
    mockExtractUrls.mockReturnValue(["https://a.com", "https://b.com"]);
    mockBuildBlock.mockReturnValue("[multi]");

    setupTauriMocks({
      fetch_url: (payload) => {
        const args = payload as { args: { url: string } };
        return { ok: true, content_md: "OK", source: args.args.url };
      },
      render_url: (payload) => {
        const args = payload as { args: { url: string } };
        return { ok: true, screenshot_base64: "IMG", source: args.args.url };
      },
    });

    const result = await getFetchBlockForText("a and b", { modelSupportsVision: true });
    expect(result.textBlock).toBe("[multi]");
    expect(result.screenshotParts).toHaveLength(2);
  });
});

describe("injectUrlFetchResult", () => {
  it("does nothing when result is empty", () => {
    const msgs: ModelMessage[] = [
      { role: "user", content: [{ type: "text", text: "hello" }] },
    ];
    injectUrlFetchResult(msgs, { textBlock: "", screenshotParts: [] });
    expect(textOf(msgs[0]!)).toBe("hello");
  });

  it("appends textBlock to last user message", () => {
    const msgs: ModelMessage[] = [
      { role: "user", content: [{ type: "text", text: "original" }] },
    ];
    injectUrlFetchResult(msgs, { textBlock: "\n\n[fetched]", screenshotParts: [] });
    expect(textOf(msgs[0]!)).toBe("original\n\n[fetched]");
  });

  it("targets the last user message when multiple exist", () => {
    const msgs: ModelMessage[] = [
      { role: "user", content: [{ type: "text", text: "first" }] },
      { role: "assistant", content: [{ type: "text", text: "reply" }] },
      { role: "user", content: [{ type: "text", text: "second" }] },
    ];
    injectUrlFetchResult(msgs, { textBlock: "[block]", screenshotParts: [] });
    expect(textOf(msgs[0]!)).toBe("first");
    expect(textOf(msgs[2]!)).toBe("second[block]");
  });

  it("does nothing when no user messages exist", () => {
    const msgs: ModelMessage[] = [
      { role: "assistant", content: [{ type: "text", text: "hi" }] },
    ];
    injectUrlFetchResult(msgs, { textBlock: "[block]", screenshotParts: [] });
    expect(textOf(msgs[0]!)).toBe("hi");
  });

  it("does nothing for empty messages array", () => {
    const msgs: ModelMessage[] = [];
    injectUrlFetchResult(msgs, { textBlock: "[block]", screenshotParts: [] });
    expect(msgs).toHaveLength(0);
  });

  it("rebuilds content as multimodal when screenshotParts present", () => {
    const msgs: ModelMessage[] = [
      { role: "user", content: [{ type: "text", text: "check this" }] },
    ];
    const result: UrlFetchResult = {
      textBlock: "\n[fetched]",
      screenshotParts: [{ type: "image", image: "data:image/png;base64,AAAA" }],
    };
    injectUrlFetchResult(msgs, result);
    const content = (msgs[0] as { content: Array<{ type: string }> }).content;
    expect(content).toHaveLength(2);
    expect(content[0]).toEqual({ type: "text", text: "check this\n[fetched]" });
    expect(content[1]).toEqual({ type: "image", image: "data:image/png;base64,AAAA" });
  });
});

describe("injectFetchBlockIntoLastUserMessage (deprecated)", () => {
  it("delegates to injectUrlFetchResult for backward compat", () => {
    const msgs: ModelMessage[] = [
      { role: "user", content: [{ type: "text", text: "original" }] },
    ];
    injectFetchBlockIntoLastUserMessage(msgs, "\n\n[fetched]");
    expect(textOf(msgs[0]!)).toBe("original\n\n[fetched]");
  });
});
