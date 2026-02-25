import type { ToolCallInfo, MessagePart } from "@/stores/chat-types";
import type { StreamLike, StreamResult, StreamUpdate, StreamDebugOptions } from "./stream-types";
import { createStreamDebugLogger, parseErrorLike } from "./stream-debug";

export type { StreamResult, StreamUpdate };

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
      onUpdate({ streamingContent: fullContent, streamingParts: [...parts], streamingToolCalls: [...toolCalls] });
      continue;
    }

    if (part.type === "reasoning-delta") {
      onPartType?.("reasoning-delta");
      const text = part.text ?? (part as { delta?: string }).delta ?? "";
      fullReasoning += text;
      const last = parts[parts.length - 1];
      if (last?.type === "reasoning") { last.text += text; } else { parts.push({ type: "reasoning", text }); }
      onUpdate({ streamingContent: fullContent, streamingReasoning: fullReasoning, streamingToolCalls: [...toolCalls], streamingParts: [...parts] });
      continue;
    }

    // 官方 @ai-sdk/deepseek 在 fullStream 中可能发出 type: 'reasoning' 整块（.text）
    if (part.type === "reasoning") {
      onPartType?.("reasoning-delta");
      const text = (part as { text?: string }).text ?? "";
      fullReasoning += text;
      const last = parts[parts.length - 1];
      if (last?.type === "reasoning") { last.text += text; } else { parts.push({ type: "reasoning", text }); }
      onUpdate({ streamingContent: fullContent, streamingReasoning: fullReasoning, streamingToolCalls: [...toolCalls], streamingParts: [...parts] });
      continue;
    }

    // 流式工具参数：先创建占位，再逐 delta 累积 JSON 字符串
    if (part.type === "tool-input-start") {
      onPartType?.("tool-call");
      const id = (part as { id?: string }).id ?? crypto.randomUUID();
      const toolName = (part as { toolName?: string }).toolName ?? "unknown";
      const tc: ToolCallInfo = { id, toolName, args: {}, isLoading: true, startTime: Date.now(), argsJsonStream: "" };
      toolCalls.push(tc);
      parts.push({ type: "tool", ...tc });
      onUpdate({ streamingToolCalls: [...toolCalls], streamingParts: [...parts] });
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
          onUpdate({ streamingToolCalls: [...toolCalls], streamingParts: [...parts] });
        }
      }
      continue;
    }

    if (part.type === "tool-input-end") {
      const id = (part as { id?: string }).id;
      if (id) {
        const tc = toolCalls.find((t) => t.id === id);
        if (tc && tc.argsJsonStream !== undefined) {
          try { tc.args = (JSON.parse(tc.argsJsonStream) as Record<string, unknown>) ?? {}; } catch { tc.args = {}; }
          delete tc.argsJsonStream;
          const partInParts = parts.find((p) => p.type === "tool" && p.id === id);
          if (partInParts && partInParts.type === "tool") {
            partInParts.args = tc.args;
            delete (partInParts as ToolCallInfo).argsJsonStream;
          }
          onUpdate({ streamingToolCalls: [...toolCalls], streamingParts: [...parts] });
        }
      }
      continue;
    }

    const isToolCallComplete = part.type === "tool-call" || part.type === "tool-input-available";
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
          id, toolName: part.toolName ?? "unknown",
          args: (part.input as Record<string, unknown>) ?? {}, isLoading: true, startTime: Date.now(),
        };
        toolCalls.push(tc);
        parts.push({ type: "tool", ...tc });
      }
      onUpdate({ streamingToolCalls: [...toolCalls], streamingParts: [...parts] });
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
      onUpdate({ streamingToolCalls: [...toolCalls], streamingParts: [...parts] });
      continue;
    }

    if (part.type === "error") {
      streamError = parseErrorLike(part.error) ?? "Unknown stream error";
    }
  }
  } catch (err) {
    // Catch stream-level errors thrown by the SDK (e.g. AI_MissingToolResultsError)
    if (!streamError) streamError = parseErrorLike(err) ?? "Unknown stream error";
  }

  if (streamError) {
    debug.finish({ contentChars: fullContent.length, reasoningChars: fullReasoning.length, error: streamError });
    return { content: fullContent, reasoning: fullReasoning, parts, toolCalls, error: streamError };
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

  debug.finish({ contentChars: fullContent.length, reasoningChars: fullReasoning.length });
  return { content: fullContent, reasoning: fullReasoning, parts, toolCalls, inputTokens, outputTokens };
}
