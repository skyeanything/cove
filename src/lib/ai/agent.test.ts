import { describe, expect, it, vi, beforeEach } from "vitest";
import type { Message } from "@/db/types";

vi.mock("ai", () => ({
  streamText: vi.fn(),
  stepCountIs: vi.fn((n: number) => `stepCountIs(${n})`),
}));
vi.mock("./context", () => ({
  buildSystemPrompt: vi.fn(() => "default-system-prompt"),
}));
vi.mock("./tools", () => ({
  AGENT_TOOLS: { read: "read-tool-mock" },
}));

import { streamText, stepCountIs } from "ai";
import { buildSystemPrompt } from "./context";
import { AGENT_TOOLS } from "./tools";
import { toModelMessages, runAgent } from "./agent";

const mockStreamText = vi.mocked(streamText);
const mockStepCountIs = vi.mocked(stepCountIs);
const mockBuildSystemPrompt = vi.mocked(buildSystemPrompt);

beforeEach(() => {
  vi.clearAllMocks();
  mockStreamText.mockReturnValue("stream-result" as never);
  mockBuildSystemPrompt.mockReturnValue("default-system-prompt");
});

// ---------- toModelMessages ----------

describe("toModelMessages", () => {
  it("converts user message", () => {
    const msgs: Message[] = [
      { id: "1", conversation_id: "c1", role: "user", content: "hello", created_at: "" },
    ];
    const result = toModelMessages(msgs);

    expect(result).toEqual([
      { role: "user", content: [{ type: "text", text: "hello" }] },
    ]);
  });

  it("converts system message", () => {
    const msgs: Message[] = [
      { id: "1", conversation_id: "c1", role: "system", content: "you are helpful", created_at: "" },
    ];
    const result = toModelMessages(msgs);

    expect(result).toEqual([{ role: "system", content: "you are helpful" }]);
  });

  it("converts assistant message without parts as text", () => {
    const msgs: Message[] = [
      { id: "1", conversation_id: "c1", role: "assistant", content: "hi there", created_at: "" },
    ];
    const result = toModelMessages(msgs);

    expect(result).toEqual([
      { role: "assistant", content: [{ type: "text", text: "hi there" }] },
    ]);
  });

  it("handles null content as empty string", () => {
    const msgs: Message[] = [
      { id: "1", conversation_id: "c1", role: "user", content: undefined, created_at: "" },
    ];
    const result = toModelMessages(msgs);

    expect(result).toEqual([
      { role: "user", content: [{ type: "text", text: "" }] },
    ]);
  });

  it("reconstructs assistant message with text parts", () => {
    const parts = JSON.stringify([{ type: "text", text: "hello world" }]);
    const msgs: Message[] = [
      { id: "1", conversation_id: "c1", role: "assistant", content: "hello world", parts, created_at: "" },
    ];
    const result = toModelMessages(msgs);

    expect(result).toHaveLength(1);
    expect(result[0]!.role).toBe("assistant");
  });

  it("reconstructs assistant message with tool calls and results", () => {
    const parts = JSON.stringify([
      { type: "text", text: "let me check" },
      { type: "tool", id: "tc-1", toolName: "read", args: { filePath: "a.ts" }, result: "content" },
    ]);
    const msgs: Message[] = [
      { id: "1", conversation_id: "c1", role: "assistant", content: "let me check", parts, created_at: "" },
    ];
    const result = toModelMessages(msgs);

    // assistant message + tool result message
    expect(result).toHaveLength(2);
    expect(result[0]!.role).toBe("assistant");
    // The assistant content should contain text + tool-call + reasoning (for DeepSeek compat)
    const assistantContent = (result[0]! as { content: unknown[] }).content;
    expect(assistantContent.some((p: unknown) => (p as { type: string }).type === "tool-call")).toBe(true);
    // Tool result message
    expect(result[1]!.role).toBe("tool");
  });

  it("uses placeholder for interrupted tool call (no result)", () => {
    const parts = JSON.stringify([
      { type: "tool", id: "tc-1", toolName: "bash", args: { command: "ls" } },
    ]);
    const msgs: Message[] = [
      { id: "1", conversation_id: "c1", role: "assistant", content: "", parts, created_at: "" },
    ];
    const result = toModelMessages(msgs);

    expect(result).toHaveLength(2);
    const toolMsg = result[1]! as { content: Array<{ output: { value: string } }> };
    expect(toolMsg.content[0]!.output.value).toContain("interrupted");
  });

  it("falls back to content when parts is invalid JSON", () => {
    const msgs: Message[] = [
      { id: "1", conversation_id: "c1", role: "assistant", content: "fallback", parts: "not-json", created_at: "" },
    ];
    const result = toModelMessages(msgs);

    expect(result).toEqual([
      { role: "assistant", content: [{ type: "text", text: "fallback" }] },
    ]);
  });

  it("falls back when parts is not an array", () => {
    const msgs: Message[] = [
      { id: "1", conversation_id: "c1", role: "assistant", content: "fb", parts: JSON.stringify("string"), created_at: "" },
    ];
    const result = toModelMessages(msgs);

    expect(result).toEqual([
      { role: "assistant", content: [{ type: "text", text: "fb" }] },
    ]);
  });

  it("falls back when parts array has no content", () => {
    const msgs: Message[] = [
      { id: "1", conversation_id: "c1", role: "assistant", content: "fb", parts: JSON.stringify([]), created_at: "" },
    ];
    const result = toModelMessages(msgs);

    expect(result).toEqual([
      { role: "assistant", content: [{ type: "text", text: "fb" }] },
    ]);
  });

  it("skips reasoning parts in reconstruction", () => {
    const parts = JSON.stringify([
      { type: "reasoning", text: "thinking..." },
      { type: "text", text: "answer" },
    ]);
    const msgs: Message[] = [
      { id: "1", conversation_id: "c1", role: "assistant", content: "answer", parts, created_at: "" },
    ];
    const result = toModelMessages(msgs);

    expect(result).toHaveLength(1);
    const content = (result[0]! as { content: unknown[] }).content;
    // Should have text but not reasoning
    expect(content).toEqual([{ type: "text", text: "answer" }]);
  });

  it("ignores unknown role messages", () => {
    const msgs: Message[] = [
      { id: "1", conversation_id: "c1", role: "tool" as Message["role"], content: "x", created_at: "" },
    ];
    const result = toModelMessages(msgs);

    expect(result).toEqual([]);
  });

  it("converts multiple mixed messages in order", () => {
    const msgs: Message[] = [
      { id: "1", conversation_id: "c1", role: "system", content: "sys", created_at: "" },
      { id: "2", conversation_id: "c1", role: "user", content: "hi", created_at: "" },
      { id: "3", conversation_id: "c1", role: "assistant", content: "hello", created_at: "" },
    ];
    const result = toModelMessages(msgs);

    expect(result).toHaveLength(3);
    expect(result[0]!.role).toBe("system");
    expect(result[1]!.role).toBe("user");
    expect(result[2]!.role).toBe("assistant");
  });

  it("normalizes non-string tool result to JSON", () => {
    const parts = JSON.stringify([
      { type: "tool", id: "tc-1", toolName: "read", args: {}, result: { lines: 42 } },
    ]);
    const msgs: Message[] = [
      { id: "1", conversation_id: "c1", role: "assistant", content: "", parts, created_at: "" },
    ];
    const result = toModelMessages(msgs);
    const toolMsg = result[1]! as { content: Array<{ output: { type: string; value: string } }> };
    expect(toolMsg.content[0]!.output.type).toBe("text");
    // JSON.stringify with indent
    expect(toolMsg.content[0]!.output.value).toContain("42");
  });

  // ---------- Summary injection ----------

  it("injects summary message as system message", () => {
    const msgs: Message[] = [
      { id: "s1", conversation_id: "c1", role: "system", content: "Summary of old conversation", parent_id: "__context_summary__", created_at: "2025-01-01T00:00:00Z" },
      { id: "2", conversation_id: "c1", role: "user", content: "recent question", created_at: "2025-01-01T00:05:00Z" },
      { id: "3", conversation_id: "c1", role: "assistant", content: "recent answer", created_at: "2025-01-01T00:06:00Z" },
    ];
    const result = toModelMessages(msgs, { summaryUpTo: "2025-01-01T00:04:00Z" });

    expect(result).toHaveLength(3);
    expect(result[0]!.role).toBe("system");
    expect((result[0] as { content: string }).content).toBe("Summary of old conversation");
    expect(result[1]!.role).toBe("user");
    expect(result[2]!.role).toBe("assistant");
  });

  it("skips old messages covered by summaryUpTo", () => {
    const msgs: Message[] = [
      { id: "s1", conversation_id: "c1", role: "system", content: "Summary", parent_id: "__context_summary__", created_at: "2025-01-01T00:00:00Z" },
      { id: "1", conversation_id: "c1", role: "user", content: "old question", created_at: "2025-01-01T00:01:00Z" },
      { id: "2", conversation_id: "c1", role: "assistant", content: "old answer", created_at: "2025-01-01T00:02:00Z" },
      { id: "3", conversation_id: "c1", role: "user", content: "new question", created_at: "2025-01-01T00:05:00Z" },
    ];
    const result = toModelMessages(msgs, { summaryUpTo: "2025-01-01T00:03:00Z" });

    // Summary + new question only (old messages skipped)
    expect(result).toHaveLength(2);
    expect(result[0]!.role).toBe("system");
    expect(result[1]!.role).toBe("user");
    expect((result[1] as { content: unknown[] }).content).toEqual([{ type: "text", text: "new question" }]);
  });

  it("places summary as first message even when not first in input", () => {
    const msgs: Message[] = [
      { id: "1", conversation_id: "c1", role: "user", content: "old question", created_at: "2025-01-01T00:01:00Z" },
      { id: "s1", conversation_id: "c1", role: "system", content: "Summary text", parent_id: "__context_summary__", created_at: "2025-01-01T00:03:00Z" },
      { id: "2", conversation_id: "c1", role: "user", content: "new question", created_at: "2025-01-01T00:05:00Z" },
    ];
    const result = toModelMessages(msgs, { summaryUpTo: "2025-01-01T00:02:00Z" });

    // Summary first, then only the new question (old question skipped)
    expect(result).toHaveLength(2);
    expect(result[0]!.role).toBe("system");
    expect((result[0] as { content: string }).content).toBe("Summary text");
    expect(result[1]!.role).toBe("user");
    expect((result[1] as { content: unknown[] }).content).toEqual([{ type: "text", text: "new question" }]);
  });

  it("behaves identically without options", () => {
    const msgs: Message[] = [
      { id: "1", conversation_id: "c1", role: "user", content: "hi", created_at: "" },
      { id: "2", conversation_id: "c1", role: "assistant", content: "hello", created_at: "" },
    ];
    const result = toModelMessages(msgs);

    expect(result).toHaveLength(2);
    expect(result[0]!.role).toBe("user");
    expect(result[1]!.role).toBe("assistant");
  });
});

// ---------- runAgent ----------

describe("runAgent", () => {
  const fakeModel = { id: "test-model" } as never;
  const fakeMessages = [{ role: "user", content: "hi" }] as never;

  it("calls streamText with correct defaults", () => {
    runAgent({ model: fakeModel, messages: fakeMessages });

    expect(mockStreamText).toHaveBeenCalledTimes(1);
    const call = mockStreamText.mock.calls[0]![0];
    expect(call.model).toBe(fakeModel);
    expect(call.messages).toBe(fakeMessages);
    expect(call.system).toBe("default-system-prompt");
    expect(call.tools).toBe(AGENT_TOOLS);
    expect(mockStepCountIs).toHaveBeenCalledWith(30);
  });

  it("uses provided system prompt", () => {
    runAgent({ model: fakeModel, messages: fakeMessages, system: "custom prompt" });

    const call = mockStreamText.mock.calls[0]![0];
    expect(call.system).toBe("custom prompt");
    expect(mockBuildSystemPrompt).not.toHaveBeenCalled();
  });

  it("uses provided tools", () => {
    const customTools = { myTool: "custom" } as never;
    runAgent({ model: fakeModel, messages: fakeMessages, tools: customTools });

    const call = mockStreamText.mock.calls[0]![0];
    expect(call.tools).toBe(customTools);
  });

  it("uses provided maxSteps", () => {
    runAgent({ model: fakeModel, messages: fakeMessages, maxSteps: 10 });

    expect(mockStepCountIs).toHaveBeenCalledWith(10);
  });

  it("passes abortSignal", () => {
    const ac = new AbortController();
    runAgent({ model: fakeModel, messages: fakeMessages, abortSignal: ac.signal });

    const call = mockStreamText.mock.calls[0]![0];
    expect(call.abortSignal).toBe(ac.signal);
  });

  it("passes maxOutputTokens when positive", () => {
    runAgent({ model: fakeModel, messages: fakeMessages, maxOutputTokens: 4096 });

    const call = mockStreamText.mock.calls[0]![0];
    expect((call as Record<string, unknown>).maxOutputTokens).toBe(4096);
  });

  it("omits maxOutputTokens when zero", () => {
    runAgent({ model: fakeModel, messages: fakeMessages, maxOutputTokens: 0 });

    const call = mockStreamText.mock.calls[0]![0];
    expect((call as Record<string, unknown>).maxOutputTokens).toBeUndefined();
  });

  it("returns streamText result", () => {
    const result = runAgent({ model: fakeModel, messages: fakeMessages });

    expect(result).toBe("stream-result");
  });
});
