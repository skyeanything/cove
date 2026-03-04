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

  it("skips when summary already exists", async () => {
    vi.mocked(summaryRepo.getByConversation).mockResolvedValue({
      id: "s1",
      conversation_id: "conv-1",
      summary: "existing",
      created_at: "",
    });
    const messages = Array.from({ length: 6 }, (_, i) =>
      makeMsg(i % 2 === 0 ? "user" : "assistant", `msg ${i}`),
    );
    await maybeGenerateSummary("conv-1", messages, generateFn);
    expect(generateFn).not.toHaveBeenCalled();
  });

  it("generates and stores summary for qualifying conversations", async () => {
    const messages = Array.from({ length: 6 }, (_, i) =>
      makeMsg(i % 2 === 0 ? "user" : "assistant", `msg ${i}`),
    );
    generateFn.mockResolvedValue(
      '{"summary":"Test summary","keywords":"test,conversation"}',
    );
    await maybeGenerateSummary("conv-1", messages, generateFn);
    expect(generateFn).toHaveBeenCalledOnce();
    expect(summaryRepo.create).toHaveBeenCalledWith(
      expect.any(String),
      "conv-1",
      "Test summary",
      "test,conversation",
    );
  });

  it("handles non-JSON response gracefully", async () => {
    const messages = Array.from({ length: 6 }, (_, i) =>
      makeMsg(i % 2 === 0 ? "user" : "assistant", `msg ${i}`),
    );
    generateFn.mockResolvedValue("Just a plain text summary");
    await maybeGenerateSummary("conv-1", messages, generateFn);
    expect(summaryRepo.create).toHaveBeenCalledWith(
      expect.any(String),
      "conv-1",
      "Just a plain text summary",
      "",
    );
  });

  it("logs error but does not throw on failure", async () => {
    const messages = Array.from({ length: 6 }, (_, i) =>
      makeMsg(i % 2 === 0 ? "user" : "assistant", `msg ${i}`),
    );
    generateFn.mockRejectedValue(new Error("LLM down"));
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    await maybeGenerateSummary("conv-1", messages, generateFn);
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });
});
