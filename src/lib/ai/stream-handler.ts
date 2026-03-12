import type { ToolCallInfo, MessagePart } from "@/stores/chat-types";
import type { StreamLike, StreamResult, StreamUpdate, StreamDebugOptions } from "./stream-types";
import { createStreamDebugLogger, parseErrorLike } from "./stream-debug";
import { createStreamThrottle } from "./stream-throttle";

export type { StreamResult, StreamUpdate };

interface StepTextBuffer {
  text: string;
  hasToolCall: boolean;
}

function appendTextPart(parts: MessagePart[], text: string) {
  if (!text) return;
  const last = parts[parts.length - 1];
  if (last?.type === "text") {
    last.text += text;
    return;
  }
  parts.push({ type: "text", text });
}

function completeToolCall(
  toolCalls: ToolCallInfo[],
  parts: MessagePart[],
  toolCallId: string,
  result: unknown,
) {
  const tc = toolCalls.find((t) => t.id === toolCallId);
  if (tc) {
    tc.result = result;
    tc.isLoading = false;
    if (tc.startTime != null) tc.durationMs = Date.now() - tc.startTime;
  }
  const partInParts = parts.find((p) => p.type === "tool" && p.id === toolCallId);
  if (partInParts && partInParts.type === "tool") {
    partInParts.result = result;
    partInParts.isLoading = false;
    if (tc?.durationMs != null) partInParts.durationMs = tc.durationMs;
  }
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
  let usesStepBoundaries = false;
  let stepTextBuffer: StepTextBuffer | null = null;
  const toolCalls: ToolCallInfo[] = [];
  const parts: MessagePart[] = [];
  const debug = createStreamDebugLogger(debugOptions);
  debug.start();

  const throttle = createStreamThrottle(
    () => ({
      streamingContent: fullContent,
      streamingReasoning: fullReasoning,
      streamingToolCalls: toolCalls.map((tc) => ({ ...tc })),
      streamingParts: parts.map((p) => (p.type === "tool" ? { ...p } : p)),
    }),
    onUpdate,
  );

  const ensureStepTextBuffer = () => {
    if (!usesStepBoundaries) return null;
    if (!stepTextBuffer) {
      stepTextBuffer = { text: "", hasToolCall: false };
    }
    return stepTextBuffer;
  };

  const commitStepText = () => {
    if (!stepTextBuffer) return;
    const { text, hasToolCall } = stepTextBuffer;
    stepTextBuffer = null;
    if (hasToolCall || !text) return;
    fullContent += text;
    appendTextPart(parts, text);
    throttle.markDirty();
  };

  try {
    for await (const part of stream.fullStream) {
      debug.event(part);

      if (part.type === "start-step") {
        usesStepBoundaries = true;
        stepTextBuffer = { text: "", hasToolCall: false };
        continue;
      }

      if (part.type === "finish-step") {
        commitStepText();
        continue;
      }

      if (part.type === "finish") {
        commitStepText();
        continue;
      }

      if (part.type === "text-delta") {
        onPartType?.("text-delta");
        const text = part.text ?? "";
        const stepBuffer = ensureStepTextBuffer();
        if (stepBuffer) {
          stepBuffer.text += text;
          continue;
        }
        fullContent += text;
        appendTextPart(parts, text);
        throttle.markDirty();
        continue;
      }

      if (part.type === "reasoning-delta") {
        onPartType?.("reasoning-delta");
        const text = part.text ?? (part as { delta?: string }).delta ?? "";
        fullReasoning += text;
        const last = parts[parts.length - 1];
        if (last?.type === "reasoning") { last.text += text; } else { parts.push({ type: "reasoning", text }); }
        throttle.markDirty();
        continue;
      }

      // 官方 @ai-sdk/deepseek 在 fullStream 中可能发出 type: 'reasoning' 整块（.text）
      if (part.type === "reasoning") {
        onPartType?.("reasoning-delta");
        const text = (part as { text?: string }).text ?? "";
        fullReasoning += text;
        const last = parts[parts.length - 1];
        if (last?.type === "reasoning") { last.text += text; } else { parts.push({ type: "reasoning", text }); }
        throttle.markDirty();
        continue;
      }

      // 流式工具参数：先创建占位，再逐 delta 累积 JSON 字符串
      if (part.type === "tool-input-start") {
        const stepBuffer = ensureStepTextBuffer();
        if (stepBuffer) stepBuffer.hasToolCall = true;
        onPartType?.("tool-call");
        const id = (part as { id?: string }).id ?? crypto.randomUUID();
        const toolName = (part as { toolName?: string }).toolName ?? "unknown";
        const tc: ToolCallInfo = { id, toolName, args: {}, isLoading: true, startTime: Date.now(), argsJsonStream: "" };
        toolCalls.push(tc);
        parts.push({ type: "tool", ...tc });
        throttle.markDirty();
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
            throttle.markDirty();
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
            throttle.markDirty();
          }
        }
        continue;
      }

      const isToolCallComplete = part.type === "tool-call" || part.type === "tool-input-available";
      if (isToolCallComplete) {
        const stepBuffer = ensureStepTextBuffer();
        if (stepBuffer) stepBuffer.hasToolCall = true;
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
        throttle.markDirty();
        continue;
      }

      if (part.type === "tool-result") {
        onPartType?.("tool-result");
        const toolCallId = part.toolCallId ?? "";
        completeToolCall(toolCalls, parts, toolCallId, part.output);
        throttle.markDirty();
        continue;
      }

      if (part.type === "tool-error") {
        onPartType?.("tool-result");
        const toolCallId = part.toolCallId ?? "";
        const message = parseErrorLike(part.error) ?? "Unknown tool error";
        completeToolCall(toolCalls, parts, toolCallId, `执行失败：${message}`);
        throttle.markDirty();
        continue;
      }

      if (part.type === "tool-output-denied") {
        onPartType?.("tool-result");
        const toolCallId = part.toolCallId ?? "";
        completeToolCall(toolCalls, parts, toolCallId, "该工具执行被拒绝。");
        throttle.markDirty();
        continue;
      }

      if (part.type === "error") {
        streamError = parseErrorLike(part.error) ?? "Unknown stream error";
      }
    }
  } catch (err) {
    // Catch stream-level errors thrown by the SDK (e.g. AI_MissingToolResultsError)
    if (!streamError) streamError = parseErrorLike(err) ?? "Unknown stream error";
  } finally {
    throttle.flushSync();
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
