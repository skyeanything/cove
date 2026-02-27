import { describe, expect, it, vi, beforeEach } from "vitest";
import type { Message } from "@/db/types";
import { makeMessage } from "@/test-utils";

vi.mock("ai", () => ({
  generateText: vi.fn(),
}));
vi.mock("@/prompts/context-compression.md?raw", () => ({
  default: "{{existing_summary}}\n{{messages}}",
}));

import { generateText } from "ai";
import {
  estimateNextTurnTokens,
  shouldCompress,
  selectCompressionBoundary,
  generateSummary,
} from "./context-compression";

const mockGenerateText = vi.mocked(generateText);

beforeEach(() => {
  vi.clearAllMocks();
});

// ---------- estimateNextTurnTokens ----------

describe("estimateNextTurnTokens", () => {
  it("uses tokens_input + tokens_output when available", () => {
    const msgs: Message[] = [
      makeMessage({ role: "user", content: "hi" }),
      makeMessage({ role: "assistant", content: "hello", tokens_input: 500, tokens_output: 100 }),
    ];
    // 500 + 100 + ceil(10/4) = 603
    const result = estimateNextTurnTokens(msgs, 10);
    expect(result).toBe(603);
  });

  it("falls back to chars/4 when no token data", () => {
    const msgs: Message[] = [
      makeMessage({ role: "user", content: "a".repeat(400) }),
      makeMessage({ role: "assistant", content: "b".repeat(600) }),
    ];
    // (400 + 600 + 20) / 4 = 255
    const result = estimateNextTurnTokens(msgs, 20);
    expect(result).toBe(255);
  });

  it("handles empty messages array", () => {
    const result = estimateNextTurnTokens([], 100);
    expect(result).toBe(25); // ceil(100/4)
  });

  it("handles assistant with zero tokens_input", () => {
    const msgs: Message[] = [
      makeMessage({ role: "assistant", content: "test", tokens_input: 0 }),
    ];
    // Fallback: (4 + 50) / 4 = 14
    const result = estimateNextTurnTokens(msgs, 50);
    expect(result).toBe(14);
  });
});

// ---------- shouldCompress ----------

describe("shouldCompress", () => {
  it("returns false when fewer than 6 messages", () => {
    const msgs = Array.from({ length: 5 }, () =>
      makeMessage({ content: "x".repeat(10000), tokens_input: 50000, tokens_output: 10000 }),
    );
    expect(shouldCompress(msgs, 100_000)).toBe(false);
  });

  it("returns false when estimated tokens below threshold", () => {
    const msgs = Array.from({ length: 8 }, () =>
      makeMessage({ role: "user", content: "short" }),
    );
    expect(shouldCompress(msgs, 128_000)).toBe(false);
  });

  it("returns true when estimated tokens exceed threshold", () => {
    const msgs = Array.from({ length: 8 }, (_, i) =>
      makeMessage({
        role: i % 2 === 0 ? "user" : "assistant",
        content: "x".repeat(10000),
        tokens_input: i % 2 === 1 ? 80000 : undefined,
        tokens_output: i % 2 === 1 ? 20000 : undefined,
      }),
    );
    // Last assistant has tokens_input=80000, tokens_output=20000 → 100000+0 > 128000*0.75=96000
    expect(shouldCompress(msgs, 128_000)).toBe(true);
  });

  it("uses custom threshold", () => {
    const msgs = Array.from({ length: 6 }, () =>
      makeMessage({ content: "x".repeat(1000) }),
    );
    // Chars-based: ~6000/4=1500 tokens; threshold 0.01 of 10000 = 100
    expect(shouldCompress(msgs, 10_000, 0.01)).toBe(true);
  });
});

// ---------- selectCompressionBoundary ----------

describe("selectCompressionBoundary", () => {
  it("splits messages preserving recent ones within keep ratio", () => {
    const msgs = Array.from({ length: 10 }, (_, i) =>
      makeMessage({ content: "x".repeat(1000), created_at: `2025-01-01T00:0${i}:00Z` }),
    );
    // 10 msgs × 1000 chars ≈ 250 tokens each; keepBudget = 200 * 0.4 = 80 tokens
    const { toCompress, toKeep } = selectCompressionBoundary(msgs, 200, 0.4);
    expect(toCompress.length).toBeGreaterThan(0);
    expect(toKeep.length).toBeGreaterThan(0);
    expect(toCompress.length + toKeep.length).toBe(msgs.length);
  });

  it("does not split tool message groups", () => {
    const msgs: Message[] = [
      makeMessage({ role: "user", content: "x".repeat(100), created_at: "2025-01-01T00:00:00Z" }),
      makeMessage({ role: "assistant", content: "y".repeat(100), parts: JSON.stringify([{ type: "tool", id: "t1", toolName: "read", args: {} }]), created_at: "2025-01-01T00:01:00Z" }),
      makeMessage({ role: "tool", content: "result", created_at: "2025-01-01T00:01:01Z" }),
      makeMessage({ role: "user", content: "z".repeat(100), created_at: "2025-01-01T00:02:00Z" }),
      makeMessage({ role: "assistant", content: "w".repeat(100), created_at: "2025-01-01T00:03:00Z" }),
    ];
    const { toCompress, toKeep } = selectCompressionBoundary(msgs, 500, 0.3);

    // Tool messages should not be split from their assistant
    const keepRoles = toKeep.map((m) => m.role);
    const compressRoles = toCompress.map((m) => m.role);

    // If assistant with tool call is in keep, tool result should also be in keep
    for (let i = 0; i < toKeep.length; i++) {
      if (toKeep[i]!.role === "assistant" && toKeep[i]!.parts) {
        // Next message in keep should be tool if it exists in original
        const origIdx = msgs.findIndex((m) => m.id === toKeep[i]!.id);
        if (origIdx < msgs.length - 1 && msgs[origIdx + 1]!.role === "tool") {
          expect(toKeep[i + 1]?.role).toBe("tool");
        }
      }
    }
    expect(keepRoles.length + compressRoles.length).toBe(msgs.length);
  });

  it("returns empty toCompress when all messages fit in keep budget", () => {
    const msgs = [
      makeMessage({ content: "short", created_at: "2025-01-01T00:00:00Z" }),
      makeMessage({ content: "also short", created_at: "2025-01-01T00:01:00Z" }),
    ];
    const { toCompress, toKeep } = selectCompressionBoundary(msgs, 100_000);
    expect(toCompress).toHaveLength(0);
    expect(toKeep).toHaveLength(2);
  });

  it("keeps at least 2 messages", () => {
    const msgs = Array.from({ length: 4 }, (_, i) =>
      makeMessage({ content: "x".repeat(5000), created_at: `2025-01-01T00:0${i}:00Z` }),
    );
    const { toKeep } = selectCompressionBoundary(msgs, 100, 0.01);
    expect(toKeep.length).toBeGreaterThanOrEqual(2);
  });
});

// ---------- generateSummary ----------

describe("generateSummary", () => {
  it("calls generateText and returns structured result", async () => {
    mockGenerateText.mockResolvedValueOnce({ text: "Summary of conversation" } as never);

    const msgs: Message[] = [
      makeMessage({ role: "user", content: "What is AI?", created_at: "2025-01-01T00:00:00Z" }),
      makeMessage({ role: "assistant", content: "AI is...", created_at: "2025-01-01T00:01:00Z" }),
    ];

    const fakeModel = { id: "test" } as never;
    const result = await generateSummary(fakeModel, msgs, null);

    expect(result.summaryContent).toBe("Summary of conversation");
    expect(result.compressedUpTo).toBe("2025-01-01T00:01:00Z");
    expect(mockGenerateText).toHaveBeenCalledTimes(1);
  });

  it("includes existing summary in prompt for chain compression", async () => {
    mockGenerateText.mockResolvedValueOnce({ text: "Updated summary" } as never);

    const msgs: Message[] = [
      makeMessage({ role: "user", content: "More info", created_at: "2025-01-01T00:02:00Z" }),
    ];

    const fakeModel = { id: "test" } as never;
    await generateSummary(fakeModel, msgs, "Previous summary content");

    const call = mockGenerateText.mock.calls[0]![0];
    expect((call as Record<string, unknown>).system).toContain("Previous summary content");
  });

  it("serializes assistant messages with tool parts", async () => {
    mockGenerateText.mockResolvedValueOnce({ text: "Summary" } as never);

    const msgs: Message[] = [
      makeMessage({
        role: "assistant",
        content: "let me check",
        parts: JSON.stringify([
          { type: "text", text: "let me check" },
          { type: "tool", toolName: "read", args: { path: "a.ts" }, result: "content" },
        ]),
        created_at: "2025-01-01T00:00:00Z",
      }),
    ];

    const fakeModel = { id: "test" } as never;
    await generateSummary(fakeModel, msgs, null);

    const call = mockGenerateText.mock.calls[0]![0];
    const system = (call as Record<string, unknown>).system as string;
    expect(system).toContain("[Tool: read");
  });
});
