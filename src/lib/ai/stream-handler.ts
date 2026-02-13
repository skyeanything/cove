import type { MessagePart, ToolCallInfo } from "@/stores/chatStore";

interface StreamLike {
  fullStream: AsyncIterable<{
    type: string;
    text?: string;
    /** tool-call / tool-result 使用 */
    toolCallId?: string;
    toolName?: string;
    input?: unknown;
    output?: unknown;
    error?: unknown;
    /** tool-input-start / tool-input-delta 使用（SDK fullStream 用 id） */
    id?: string;
    delta?: string;
  }>;
  usage: PromiseLike<{
    inputTokens?: number;
    outputTokens?: number;
  }>;
}

export interface StreamResult {
  content: string;
  reasoning: string;
  parts: MessagePart[];
  toolCalls: ToolCallInfo[];
  inputTokens?: number;
  outputTokens?: number;
  error?: string;
}

export interface StreamUpdate {
  streamingContent?: string;
  streamingReasoning?: string;
  streamingToolCalls?: ToolCallInfo[];
  streamingParts?: MessagePart[];
}

interface StreamDebugOptions {
  enabled?: boolean;
  label?: string;
  previewChars?: number;
}

function isStreamDebugEnabled(explicitEnabled?: boolean): boolean {
  if (typeof explicitEnabled === "boolean") return explicitEnabled;
  try {
    return globalThis.localStorage?.getItem("cove.streamDebug") === "1";
  } catch {
    return false;
  }
}

function createStreamDebugLogger(options?: StreamDebugOptions) {
  const enabled = isStreamDebugEnabled(options?.enabled);
  const label = options?.label ?? "stream";
  const previewChars = options?.previewChars ?? 24;

  let startedAt = 0;
  let lastAt = 0;
  let totalEvents = 0;
  let textDeltaEvents = 0;
  let reasoningDeltaEvents = 0;
  let textChars = 0;
  let reasoningChars = 0;

  const now = () => (typeof performance !== "undefined" ? performance.now() : Date.now());
  const safePreview = (s: string) => s.replace(/\n/g, "\\n").slice(0, previewChars);

  const log = (message: string, payload?: Record<string, unknown>) => {
    if (!enabled) return;
    if (payload) console.debug(`[stream-debug][${label}] ${message}`, payload);
    else console.debug(`[stream-debug][${label}] ${message}`);
  };

  return {
    start() {
      if (!enabled) return;
      startedAt = now();
      lastAt = startedAt;
      log("start");
    },
    event(part: { type: string; text?: string; delta?: string }) {
      if (!enabled) return;
      const t = now();
      const dt = Math.round(t - lastAt);
      lastAt = t;
      totalEvents += 1;

      if (part.type === "text-delta") {
        const text = part.text ?? "";
        textDeltaEvents += 1;
        textChars += text.length;
        log("text-delta", {
          event: totalEvents,
          dt_ms: dt,
          chunk_chars: text.length,
          chunk_preview: safePreview(text),
          text_delta_events: textDeltaEvents,
          text_chars_total: textChars,
        });
        return;
      }

      if (part.type === "reasoning-delta" || part.type === "reasoning") {
        const text = part.text ?? part.delta ?? "";
        reasoningDeltaEvents += 1;
        reasoningChars += text.length;
        log("reasoning-delta", {
          event: totalEvents,
          dt_ms: dt,
          chunk_chars: text.length,
          chunk_preview: safePreview(text),
          reasoning_delta_events: reasoningDeltaEvents,
          reasoning_chars_total: reasoningChars,
        });
        return;
      }

      log(part.type, { event: totalEvents, dt_ms: dt });
    },
    finish(extra?: { contentChars?: number; reasoningChars?: number; error?: string }) {
      if (!enabled) return;
      const elapsed = Math.round(now() - startedAt);
      log("finish", {
        elapsed_ms: elapsed,
        total_events: totalEvents,
        text_delta_events: textDeltaEvents,
        reasoning_delta_events: reasoningDeltaEvents,
        text_chars_total: textChars,
        reasoning_chars_total: reasoningChars,
        content_chars_final: extra?.contentChars,
        reasoning_chars_final: extra?.reasoningChars,
        error: extra?.error,
      });
    },
  };
}

export async function handleAgentStream(
  stream: StreamLike,
  onUpdate: (state: StreamUpdate) => void,
  onPartType?: (partType: "text-delta" | "reasoning-delta" | "tool-call" | "tool-result") => void,
  debugOptions?: StreamDebugOptions,
): Promise<StreamResult> {
  let fullContent = "";
  let fullReasoning = "";
  let streamError: string | undefined;
  const toolCalls: ToolCallInfo[] = [];
  const parts: MessagePart[] = [];
  const debug = createStreamDebugLogger(debugOptions);
  debug.start();

  try {
  for await (const part of stream.fullStream) {
    debug.event(part);
    if (part.type === "text-delta") {
      onPartType?.("text-delta");
      const text = part.text ?? "";
      fullContent += text;
      const last = parts[parts.length - 1];
      if (last?.type === "text") {
        last.text += text;
      } else {
        parts.push({ type: "text", text });
      }
      onUpdate({
        streamingContent: fullContent,
        streamingParts: [...parts],
        streamingToolCalls: [...toolCalls],
      });
      continue;
    }

    if (part.type === "reasoning-delta") {
      onPartType?.("reasoning-delta");
      const text = part.text ?? (part as { delta?: string }).delta ?? "";
      fullReasoning += text;
      const last = parts[parts.length - 1];
      if (last?.type === "reasoning") {
        last.text += text;
      } else {
        parts.push({ type: "reasoning", text });
      }
      onUpdate({
        streamingContent: fullContent,
        streamingReasoning: fullReasoning,
        streamingToolCalls: [...toolCalls],
        streamingParts: [...parts],
      });
      continue;
    }

    // 官方 @ai-sdk/deepseek 在 fullStream 中可能发出 type: 'reasoning' 整块（.text）
    if (part.type === "reasoning") {
      onPartType?.("reasoning-delta");
      const text = (part as { text?: string }).text ?? "";
      fullReasoning += text;
      const last = parts[parts.length - 1];
      if (last?.type === "reasoning") {
        last.text += text;
      } else {
        parts.push({ type: "reasoning", text });
      }
      onUpdate({
        streamingContent: fullContent,
        streamingReasoning: fullReasoning,
        streamingToolCalls: [...toolCalls],
        streamingParts: [...parts],
      });
      continue;
    }

    // 流式工具参数：先创建占位，再逐 delta 累积 JSON 字符串
    if (part.type === "tool-input-start") {
      onPartType?.("tool-call");
      const id = (part as { id?: string }).id ?? crypto.randomUUID();
      const toolName = (part as { toolName?: string }).toolName ?? "unknown";
      const tc: ToolCallInfo = {
        id,
        toolName,
        args: {},
        isLoading: true,
        startTime: Date.now(),
        argsJsonStream: "",
      };
      toolCalls.push(tc);
      parts.push({ type: "tool", ...tc });
      onUpdate({
        streamingToolCalls: [...toolCalls],
        streamingParts: [...parts],
      });
      continue;
    }

    if (part.type === "tool-input-delta") {
      const id = (part as { id?: string }).id;
      const delta = (part as { delta?: string }).delta ?? "";
      if (id) {
        const tc = toolCalls.find((t) => t.id === id);
        if (tc) {
          tc.argsJsonStream = (tc.argsJsonStream ?? "") + delta;
          const partInParts = parts.find((p) => p.type === "tool" && p.id === id);
          if (partInParts && partInParts.type === "tool") partInParts.argsJsonStream = tc.argsJsonStream;
          onUpdate({
            streamingToolCalls: [...toolCalls],
            streamingParts: [...parts],
          });
        }
      }
      continue;
    }

    if (part.type === "tool-input-end") {
      const id = (part as { id?: string }).id;
      if (id) {
        const tc = toolCalls.find((t) => t.id === id);
        if (tc && tc.argsJsonStream !== undefined) {
          try {
            tc.args = (JSON.parse(tc.argsJsonStream) as Record<string, unknown>) ?? {};
          } catch {
            tc.args = {};
          }
          delete tc.argsJsonStream;
          const partInParts = parts.find((p) => p.type === "tool" && p.id === id);
          if (partInParts && partInParts.type === "tool") {
            partInParts.args = tc.args;
            delete (partInParts as ToolCallInfo).argsJsonStream;
          }
          onUpdate({
            streamingToolCalls: [...toolCalls],
            streamingParts: [...parts],
          });
        }
      }
      continue;
    }

    // SDK 在工具调用完整到达时可能发 tool-call 或 tool-input-available，逻辑一致
    const isToolCallComplete =
      part.type === "tool-call" || part.type === "tool-input-available";
    if (isToolCallComplete) {
      onPartType?.("tool-call");
      const id = part.toolCallId ?? (part as { id?: string }).id ?? crypto.randomUUID();
      const existing = toolCalls.find((t) => t.id === id);
      if (existing) {
        existing.args = (part.input as Record<string, unknown>) ?? {};
        if (existing.argsJsonStream !== undefined) delete existing.argsJsonStream;
        const partInParts = parts.find((p) => p.type === "tool" && p.id === id);
        if (partInParts && partInParts.type === "tool") {
          partInParts.args = existing.args;
          if ((partInParts as ToolCallInfo).argsJsonStream !== undefined) delete (partInParts as ToolCallInfo).argsJsonStream;
        }
      } else {
        const tc: ToolCallInfo = {
          id,
          toolName: part.toolName ?? "unknown",
          args: (part.input as Record<string, unknown>) ?? {},
          isLoading: true,
          startTime: Date.now(),
        };
        toolCalls.push(tc);
        parts.push({ type: "tool", ...tc });
      }
      onUpdate({
        streamingToolCalls: [...toolCalls],
        streamingParts: [...parts],
      });
      continue;
    }

    if (part.type === "tool-result") {
      onPartType?.("tool-result");
      const toolCallId = part.toolCallId ?? "";
      const tc = toolCalls.find((t) => t.id === toolCallId);
      if (tc) {
        tc.result = part.output;
        tc.isLoading = false;
        if (tc.startTime != null) tc.durationMs = Date.now() - tc.startTime;
      }
      const partInParts = parts.find((p) => p.type === "tool" && p.id === toolCallId);
      if (partInParts && partInParts.type === "tool") {
        partInParts.result = part.output;
        partInParts.isLoading = false;
        if (tc?.durationMs != null) partInParts.durationMs = tc.durationMs;
      }
      onUpdate({
        streamingToolCalls: [...toolCalls],
        streamingParts: [...parts],
      });
      continue;
    }

    if (part.type === "error") {
      streamError = String(part.error);
    }
  }
  } catch (err) {
    // Catch stream-level errors thrown by the SDK (e.g. AI_MissingToolResultsError
    // from providers whose tool-call IDs don't match up across steps).
    // Without this, the for-await loop hangs or crashes and the UI gets stuck.
    if (!streamError) {
      streamError = err instanceof Error ? err.message : String(err);
    }
  }

  if (streamError) {
    debug.finish({
      contentChars: fullContent.length,
      reasoningChars: fullReasoning.length,
      error: streamError,
    });
    return {
      content: fullContent,
      reasoning: fullReasoning,
      parts,
      toolCalls,
      error: streamError,
    };
  }

  let inputTokens: number | undefined;
  let outputTokens: number | undefined;
  try {
    const usage = await stream.usage;
    inputTokens = usage.inputTokens;
    outputTokens = usage.outputTokens;
  } catch {
    // usage 可能不可用
  }

  debug.finish({
    contentChars: fullContent.length,
    reasoningChars: fullReasoning.length,
  });
  return {
    content: fullContent,
    reasoning: fullReasoning,
    parts,
    toolCalls,
    inputTokens,
    outputTokens,
  };
}

