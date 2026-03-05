import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("./summary", () => ({
  maybeGenerateSummary: vi.fn(),
}));
vi.mock("./soul-observe", () => ({
  maybeRecordObservation: vi.fn(),
}));
vi.mock("ai", () => ({
  generateText: vi.fn(),
}));

import { maybeGenerateSummary } from "./summary";
import { maybeRecordObservation } from "./soul-observe";
import { generateText } from "ai";
import { runPostConversationTasks } from "./post-conversation";
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

describe("runPostConversationTasks", () => {
  const mockModel = {} as Parameters<typeof runPostConversationTasks>[2];
  const messages = [makeMsg("user", "hi"), makeMsg("assistant", "hello")];

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(maybeGenerateSummary).mockResolvedValue(undefined);
    vi.mocked(maybeRecordObservation).mockResolvedValue(undefined);
    vi.mocked(generateText).mockResolvedValue({ text: "result" } as Awaited<
      ReturnType<typeof generateText>
    >);
  });

  it("calls summary and observation hooks", () => {
    runPostConversationTasks("conv-1", messages, mockModel);

    expect(maybeGenerateSummary).toHaveBeenCalledWith(
      "conv-1",
      messages,
      expect.any(Function),
    );
    expect(maybeRecordObservation).toHaveBeenCalledWith(
      "conv-1",
      messages,
      expect.any(Function),
    );
  });

  it("does not throw when summary hook rejects", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.mocked(maybeGenerateSummary).mockRejectedValue(new Error("fail"));

    runPostConversationTasks("conv-1", messages, mockModel);

    // Allow microtask to settle
    await new Promise((r) => setTimeout(r, 10));
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });

  it("does not throw when observation hook rejects", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.mocked(maybeRecordObservation).mockRejectedValue(new Error("fail"));

    runPostConversationTasks("conv-1", messages, mockModel);

    await new Promise((r) => setTimeout(r, 10));
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });
});
