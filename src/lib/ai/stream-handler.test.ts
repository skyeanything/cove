import { describe, expect, it, vi, beforeEach } from "vitest";
import type { StreamLike, StreamUpdate } from "./stream-types";
import { handleAgentStream } from "./stream-handler";

vi.mock("./stream-debug", () => ({
  createStreamDebugLogger: () => ({
    start: vi.fn(),
    event: vi.fn(),
    finish: vi.fn(),
  }),
  parseErrorLike: vi.fn((v: unknown) => {
    if (typeof v === "string") return v;
    if (v instanceof Error) return v.message;
    if (v && typeof v === "object" && "message" in v) return (v as { message: string }).message;
    return undefined;
  }),
}));

/** Helper: create an async iterable from an array */
async function* asyncIter(parts: Array<Record<string, unknown>>) {
  for (const p of parts) yield p;
}

/** Helper: create a StreamLike from an array of stream parts */
function makeStream(
  parts: Array<Record<string, unknown>>,
  usage?: { inputTokens?: number; outputTokens?: number },
): StreamLike {
  return {
    fullStream: asyncIter(parts),
    usage: Promise.resolve(usage ?? { inputTokens: 10, outputTokens: 20 }),
  } as unknown as StreamLike;
}

/** Helper: create a StreamLike that throws during iteration */
function makeErrorStream(
  parts: Array<Record<string, unknown>>,
  error: Error,
): StreamLike {
  async function* errorIter() {
    for (const p of parts) yield p;
    throw error;
  }
  return {
    fullStream: errorIter(),
    usage: Promise.resolve({}),
  } as unknown as StreamLike;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("handleAgentStream", () => {
  // --- text streaming ---

  it("accumulates text-delta events into content", async () => {
    const stream = makeStream([
      { type: "text-delta", text: "Hello" },
      { type: "text-delta", text: " world" },
    ]);
    const updates: StreamUpdate[] = [];

    const result = await handleAgentStream(stream, (u) => updates.push({ ...u }));

    expect(result.content).toBe("Hello world");
    expect(result.error).toBeUndefined();
    expect(result.inputTokens).toBe(10);
    expect(result.outputTokens).toBe(20);
    expect(result.parts).toHaveLength(1);
    expect(result.parts[0]).toEqual({ type: "text", text: "Hello world" });
    expect(updates.length).toBe(2);
  });

  it("merges consecutive text-delta into one text part", async () => {
    const stream = makeStream([
      { type: "text-delta", text: "a" },
      { type: "text-delta", text: "b" },
      { type: "text-delta", text: "c" },
    ]);

    const result = await handleAgentStream(stream, () => {});

    expect(result.parts).toHaveLength(1);
    expect(result.parts[0]).toEqual({ type: "text", text: "abc" });
  });

  // --- reasoning ---

  it("accumulates reasoning-delta events", async () => {
    const stream = makeStream([
      { type: "reasoning-delta", text: "think" },
      { type: "reasoning-delta", text: "ing" },
    ]);
    const updates: StreamUpdate[] = [];

    const result = await handleAgentStream(stream, (u) => updates.push({ ...u }));

    expect(result.reasoning).toBe("thinking");
    expect(result.parts).toEqual([
      { type: "reasoning", text: "thinking" },
    ]);
  });

  it("handles reasoning whole-block events", async () => {
    const stream = makeStream([
      { type: "reasoning", text: "full reasoning" },
    ]);

    const result = await handleAgentStream(stream, () => {});

    expect(result.reasoning).toBe("full reasoning");
  });

  // --- tool calls (complete) ---

  it("handles tool-call event (non-streaming)", async () => {
    const stream = makeStream([
      { type: "tool-call", toolCallId: "tc-1", toolName: "read", input: { filePath: "a.ts" } },
      { type: "tool-result", toolCallId: "tc-1", output: "file content" },
    ]);

    const result = await handleAgentStream(stream, () => {});

    expect(result.toolCalls).toHaveLength(1);
    expect(result.toolCalls[0]!.id).toBe("tc-1");
    expect(result.toolCalls[0]!.toolName).toBe("read");
    expect(result.toolCalls[0]!.args).toEqual({ filePath: "a.ts" });
    expect(result.toolCalls[0]!.result).toBe("file content");
    expect(result.toolCalls[0]!.isLoading).toBe(false);
  });

  // --- streaming tool calls (input-start/delta/end) ---

  it("handles streaming tool-input events", async () => {
    const stream = makeStream([
      { type: "tool-input-start", id: "tc-2", toolName: "bash" },
      { type: "tool-input-delta", id: "tc-2", delta: '{"com' },
      { type: "tool-input-delta", id: "tc-2", delta: 'mand":"ls"}' },
      { type: "tool-input-end", id: "tc-2" },
      { type: "tool-result", toolCallId: "tc-2", output: "dir listing" },
    ]);

    const result = await handleAgentStream(stream, () => {});

    expect(result.toolCalls).toHaveLength(1);
    expect(result.toolCalls[0]!.args).toEqual({ command: "ls" });
    expect(result.toolCalls[0]!.result).toBe("dir listing");
    expect(result.toolCalls[0]!.isLoading).toBe(false);
    // argsJsonStream should be cleaned up
    expect(result.toolCalls[0]!.argsJsonStream).toBeUndefined();
  });

  it("handles tool-input-end with invalid JSON gracefully", async () => {
    const stream = makeStream([
      { type: "tool-input-start", id: "tc-3", toolName: "bash" },
      { type: "tool-input-delta", id: "tc-3", delta: "not-json" },
      { type: "tool-input-end", id: "tc-3" },
    ]);

    const result = await handleAgentStream(stream, () => {});

    expect(result.toolCalls[0]!.args).toEqual({});
  });

  // --- tool-call updating existing streaming tool ---

  it("tool-call event updates existing streaming tool entry", async () => {
    const stream = makeStream([
      { type: "tool-input-start", id: "tc-4", toolName: "read" },
      { type: "tool-call", toolCallId: "tc-4", toolName: "read", input: { filePath: "b.ts" } },
    ]);

    const result = await handleAgentStream(stream, () => {});

    expect(result.toolCalls).toHaveLength(1);
    expect(result.toolCalls[0]!.args).toEqual({ filePath: "b.ts" });
    expect(result.toolCalls[0]!.argsJsonStream).toBeUndefined();
  });

  // --- mixed text + tool ---

  it("handles interleaved text and tool events", async () => {
    const stream = makeStream([
      { type: "text-delta", text: "Let me read " },
      { type: "tool-call", toolCallId: "tc-5", toolName: "read", input: { filePath: "c.ts" } },
      { type: "tool-result", toolCallId: "tc-5", output: "content" },
      { type: "text-delta", text: "Done." },
    ]);

    const result = await handleAgentStream(stream, () => {});

    expect(result.content).toBe("Let me read Done.");
    expect(result.toolCalls).toHaveLength(1);
    expect(result.parts).toHaveLength(3); // text, tool, text
    expect(result.parts[0]!.type).toBe("text");
    expect(result.parts[1]!.type).toBe("tool");
    expect(result.parts[2]!.type).toBe("text");
  });

  // --- onPartType callback ---

  it("calls onPartType for each event type", async () => {
    const stream = makeStream([
      { type: "text-delta", text: "x" },
      { type: "reasoning-delta", text: "r" },
      { type: "tool-call", toolCallId: "tc-6", toolName: "t", input: {} },
      { type: "tool-result", toolCallId: "tc-6", output: "o" },
    ]);
    const partTypes: string[] = [];

    await handleAgentStream(stream, () => {}, (pt) => partTypes.push(pt));

    expect(partTypes).toEqual(["text-delta", "reasoning-delta", "tool-call", "tool-result"]);
  });

  // --- error in stream events ---

  it("captures error event from stream", async () => {
    const stream = makeStream([
      { type: "text-delta", text: "partial" },
      { type: "error", error: "rate limit exceeded" },
    ]);

    const result = await handleAgentStream(stream, () => {});

    expect(result.content).toBe("partial");
    expect(result.error).toBe("rate limit exceeded");
    expect(result.inputTokens).toBeUndefined();
  });

  // --- thrown error during iteration ---

  it("catches thrown error from stream iteration", async () => {
    const stream = makeErrorStream(
      [{ type: "text-delta", text: "before" }],
      new Error("stream broke"),
    );

    const result = await handleAgentStream(stream, () => {});

    expect(result.content).toBe("before");
    expect(result.error).toBe("stream broke");
  });

  // --- usage not available ---

  it("handles usage rejection gracefully", async () => {
    const rejecting = Promise.reject(new Error("no usage"));
    rejecting.catch(() => {}); // suppress unhandled rejection
    const stream: StreamLike = {
      fullStream: asyncIter([{ type: "text-delta", text: "ok" }]),
      usage: rejecting,
    } as unknown as StreamLike;

    const result = await handleAgentStream(stream, () => {});

    expect(result.content).toBe("ok");
    expect(result.inputTokens).toBeUndefined();
    expect(result.outputTokens).toBeUndefined();
    expect(result.error).toBeUndefined();
  });

  // --- empty stream ---

  it("handles empty stream", async () => {
    const stream = makeStream([]);

    const result = await handleAgentStream(stream, () => {});

    expect(result.content).toBe("");
    expect(result.reasoning).toBe("");
    expect(result.toolCalls).toEqual([]);
    expect(result.parts).toEqual([]);
  });

  // --- tool-input-delta with unknown id ---

  it("ignores tool-input-delta with unknown id", async () => {
    const stream = makeStream([
      { type: "tool-input-delta", id: "unknown", delta: "x" },
    ]);

    const result = await handleAgentStream(stream, () => {});

    expect(result.toolCalls).toEqual([]);
  });

  // --- tool-result with unknown toolCallId ---

  it("ignores tool-result with unknown toolCallId", async () => {
    const stream = makeStream([
      { type: "tool-result", toolCallId: "unknown", output: "x" },
    ]);

    const result = await handleAgentStream(stream, () => {});

    expect(result.toolCalls).toEqual([]);
  });

  // --- tool-input-available (alias for tool-call) ---

  it("handles tool-input-available as tool-call complete", async () => {
    const stream = makeStream([
      { type: "tool-input-available", toolCallId: "tc-7", toolName: "edit", input: { old: "a" } },
    ]);

    const result = await handleAgentStream(stream, () => {});

    expect(result.toolCalls).toHaveLength(1);
    expect(result.toolCalls[0]!.toolName).toBe("edit");
    expect(result.toolCalls[0]!.args).toEqual({ old: "a" });
  });

  // --- tool durationMs ---

  it("calculates tool durationMs on result", async () => {
    const stream = makeStream([
      { type: "tool-call", toolCallId: "tc-8", toolName: "bash", input: {} },
      { type: "tool-result", toolCallId: "tc-8", output: "done" },
    ]);

    const result = await handleAgentStream(stream, () => {});

    // durationMs should be set (>= 0)
    expect(result.toolCalls[0]!.durationMs).toBeDefined();
    expect(typeof result.toolCalls[0]!.durationMs).toBe("number");
  });
});
