import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("@/db/repos/summaryRepo", () => ({
  summaryRepo: {
    getByConversation: vi.fn(),
    create: vi.fn(),
  },
}));

import { summaryRepo } from "@/db/repos/summaryRepo";
import { maybeGenerateSummary } from "./summary";
import type { Message } from "@/db/types";

function makeMsg(role: "user" | "assistant", content: string): Message {
  return {
    id: crypto.randomUUID(),
    conversation_id: "conv-1",
    role,
    content,
    created_at: new Date().toISOString(),
  };
}

function makeMessages(count: number): Message[] {
  return Array.from({ length: count }, (_, i) =>
    makeMsg(i % 2 === 0 ? "user" : "assistant", `msg ${i}`),
  );
}

describe("maybeGenerateSummary", () => {
  const generateFn = vi.fn<(p: string) => Promise<string>>();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(summaryRepo.getByConversation).mockResolvedValue(undefined);
  });

  it("skips when fewer than 4 substantive messages", async () => {
    const messages = [makeMsg("user", "hi"), makeMsg("assistant", "hello")];
    await maybeGenerateSummary("conv-1", messages, generateFn);
    expect(generateFn).not.toHaveBeenCalled();
  });

  it("skips when summary exists and conversation has not grown enough", async () => {
    vi.mocked(summaryRepo.getByConversation).mockResolvedValue({
      id: "s1",
      conversation_id: "conv-1",
      summary: "existing",
      created_at: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
    });
    await maybeGenerateSummary("conv-1", makeMessages(6), generateFn);
    expect(generateFn).not.toHaveBeenCalled();
  });

  it("skips when summary was recently refreshed even with enough messages", async () => {
    vi.mocked(summaryRepo.getByConversation).mockResolvedValue({
      id: "s1",
      conversation_id: "conv-1",
      summary: "recent summary",
      created_at: new Date().toISOString(), // just created
    });
    await maybeGenerateSummary("conv-1", makeMessages(10), generateFn);
    expect(generateFn).not.toHaveBeenCalled();
  });

  it("updates summary when conversation has grown and cooldown elapsed", async () => {
    vi.mocked(summaryRepo.getByConversation).mockResolvedValue({
      id: "s1",
      conversation_id: "conv-1",
      summary: "old summary",
      created_at: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
    });
    generateFn.mockResolvedValue(
      '{"summary":"Updated summary","keywords":"new,stuff"}',
    );
    // 8 messages + 2h old = stale
    await maybeGenerateSummary("conv-1", makeMessages(8), generateFn);
    expect(generateFn).toHaveBeenCalledOnce();
    expect(summaryRepo.create).toHaveBeenCalledWith(
      "s1", // reuses existing ID
      "conv-1",
      "Updated summary",
      "new,stuff",
    );
  });

  it("generates and stores summary for new conversations", async () => {
    generateFn.mockResolvedValue(
      '{"summary":"Test summary","keywords":"test,conversation"}',
    );
    await maybeGenerateSummary("conv-1", makeMessages(6), generateFn);
    expect(generateFn).toHaveBeenCalledOnce();
    expect(summaryRepo.create).toHaveBeenCalledWith(
      expect.any(String),
      "conv-1",
      "Test summary",
      "test,conversation",
    );
  });

  it("handles non-JSON response gracefully", async () => {
    generateFn.mockResolvedValue("Just a plain text summary");
    await maybeGenerateSummary("conv-1", makeMessages(6), generateFn);
    expect(summaryRepo.create).toHaveBeenCalledWith(
      expect.any(String),
      "conv-1",
      "Just a plain text summary",
      "",
    );
  });

  it("logs error but does not throw on failure", async () => {
    generateFn.mockRejectedValue(new Error("LLM down"));
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    await maybeGenerateSummary("conv-1", makeMessages(6), generateFn);
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });
});
