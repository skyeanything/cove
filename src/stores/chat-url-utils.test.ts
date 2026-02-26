// @vitest-environment happy-dom
import { describe, expect, it, vi, beforeEach } from "vitest";
import type { ModelMessage } from "ai";
import { setupTauriMocks } from "@/test-utils";

vi.mock("@/lib/url-utils", () => ({
  extractUrls: vi.fn().mockReturnValue([]),
  buildFetchBlockFromResults: vi.fn().mockReturnValue(""),
}));

import { extractUrls, buildFetchBlockFromResults } from "@/lib/url-utils";
import { getFetchBlockForText, injectFetchBlockIntoLastUserMessage } from "./chat-url-utils";

/** Extract text from a ModelMessage's first content part (test helper) */
function textOf(msg: ModelMessage): string {
  const c = msg as { content: Array<{ type: string; text?: string }> };
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

  it("returns empty string when no URLs found", async () => {
    mockExtractUrls.mockReturnValue([]);
    const result = await getFetchBlockForText("no urls here");
    expect(result).toBe("");
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
    expect(result).toBe("[fetched content]");
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
    expect(result).toBe("[error block]");
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
    expect(result).toBe("[multi]");
    expect(mockBuildBlock).toHaveBeenCalledWith([
      expect.objectContaining({ source: "https://a.com" }),
      expect.objectContaining({ source: "https://b.com" }),
    ]);
  });
});

describe("injectFetchBlockIntoLastUserMessage", () => {
  it("does nothing when fetchBlock is empty", () => {
    const msgs: ModelMessage[] = [
      { role: "user", content: [{ type: "text", text: "hello" }] },
    ];
    injectFetchBlockIntoLastUserMessage(msgs, "");
    expect(textOf(msgs[0]!)).toBe("hello");
  });

  it("appends fetchBlock to last user message text", () => {
    const msgs: ModelMessage[] = [
      { role: "user", content: [{ type: "text", text: "original" }] },
    ];
    injectFetchBlockIntoLastUserMessage(msgs, "\n\n[fetched]");
    expect(textOf(msgs[0]!)).toBe("original\n\n[fetched]");
  });

  it("targets the last user message when multiple exist", () => {
    const msgs: ModelMessage[] = [
      { role: "user", content: [{ type: "text", text: "first" }] },
      { role: "assistant", content: [{ type: "text", text: "reply" }] },
      { role: "user", content: [{ type: "text", text: "second" }] },
    ];
    injectFetchBlockIntoLastUserMessage(msgs, "[block]");
    // First user message unchanged
    expect(textOf(msgs[0]!)).toBe("first");
    // Last user message modified
    expect(textOf(msgs[2]!)).toBe("second[block]");
  });

  it("does nothing when no user messages exist", () => {
    const msgs: ModelMessage[] = [
      { role: "assistant", content: [{ type: "text", text: "hi" }] },
    ];
    // Should not throw
    injectFetchBlockIntoLastUserMessage(msgs, "[block]");
    expect(textOf(msgs[0]!)).toBe("hi");
  });

  it("does nothing for empty messages array", () => {
    const msgs: ModelMessage[] = [];
    injectFetchBlockIntoLastUserMessage(msgs, "[block]");
    expect(msgs).toHaveLength(0);
  });
});
