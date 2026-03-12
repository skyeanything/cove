import { streamText, stepCountIs } from "ai";
import type { LanguageModel, ModelMessage } from "ai";
import type { Message } from "@/db/types";
import { buildSystemPrompt } from "./context";
import type { ToolRecord } from "./tools";

export interface AgentOptions {
  model: LanguageModel;
  messages: ModelMessage[];
  system?: string;
  tools?: ToolRecord;
  abortSignal?: AbortSignal;
  maxSteps?: number;
  /** 最大输出 token 数，来自 Provider 模型选项时可传入 */
  maxOutputTokens?: number;
}

interface StoredTextPart {
  type: "text";
  text: string;
}

interface StoredToolPart {
  type: "tool";
  id: string;
  toolName: string;
  args: Record<string, unknown>;
  result?: unknown;
}

type NormalizedToolOutput =
  | { type: "text"; value: string }
  | { type: "json"; value: unknown };

function isStoredTextPart(part: unknown): part is StoredTextPart {
  return (
    typeof part === "object" &&
    part !== null &&
    (part as { type?: unknown }).type === "text" &&
    typeof (part as { text?: unknown }).text === "string"
  );
}

function isStoredToolPart(part: unknown): part is StoredToolPart {
  return (
    typeof part === "object" &&
    part !== null &&
    (part as { type?: unknown }).type === "tool" &&
    typeof (part as { id?: unknown }).id === "string" &&
    typeof (part as { toolName?: unknown }).toolName === "string" &&
    typeof (part as { args?: unknown }).args === "object" &&
    (part as { args?: unknown }).args !== null
  );
}

/** 工具结果统一转为字符串再交给模型，避免对象被转成 [object Object] */
function normalizeToolOutput(result: unknown, maxChars?: number): NormalizedToolOutput {
  let value: string;
  if (typeof result === "string") {
    value = result;
  } else {
    value = JSON.stringify(result ?? null, null, 2);
  }
  if (maxChars && value.length > maxChars) {
    value = value.slice(0, maxChars) + `... [truncated, ${value.length} total chars]`;
  }
  return { type: "text", value };
}

function reconstructFromParts(partsJson: string, reasoning?: string | null, maxToolResultChars?: number): ModelMessage[] | null {
  try {
    const parsed = JSON.parse(partsJson) as unknown;
    if (!Array.isArray(parsed)) return null;

    const assistantContent: Array<Record<string, unknown>> = [];
    const toolMessages: ModelMessage[] = [];
    let hasToolCalls = false;

    for (const part of parsed) {
      if (isStoredTextPart(part)) {
        if (part.text) {
          assistantContent.push({ type: "text", text: part.text });
        }
        continue;
      }

      if (
        typeof part === "object" &&
        part !== null &&
        (part as { type?: unknown }).type === "reasoning" &&
        typeof (part as { text?: unknown }).text === "string"
      ) {
        continue;
      }

      if (isStoredToolPart(part)) {
        hasToolCalls = true;
        assistantContent.push({
          type: "tool-call",
          toolCallId: part.id,
          toolName: part.toolName,
          input: part.args,
        });

        // 必须始终创建 tool-result，否则 AI SDK 的 convertToLanguageModelPrompt
        // 会因 tool-call 没有匹配的 tool-result 而抛出 MissingToolResultsError。
        // 当 result 缺失时（如流式中断），使用合成的错误结果占位。
        const output = part.result !== undefined
          ? normalizeToolOutput(part.result, maxToolResultChars)
          : { type: "text" as const, value: "[Tool execution was interrupted]" };
        toolMessages.push({
          role: "tool",
          content: [
            {
              type: "tool-result",
              toolCallId: part.id,
              toolName: part.toolName,
              output,
            },
          ],
        } as unknown as ModelMessage);
      }
    }

    if (assistantContent.length === 0) return null;

    // DeepSeek 要求带 tool_calls 的 assistant 消息必须有 reasoning_content；适配器从 content 中 type: "reasoning" 的 part 读取
    if (hasToolCalls) {
      assistantContent.unshift({ type: "reasoning", text: reasoning ?? "" });
    }

    const assistantMessage: Record<string, unknown> = {
      role: "assistant",
      content: assistantContent,
    };

    return [
      assistantMessage as unknown as ModelMessage,
      ...toolMessages,
    ];
  } catch {
    return null;
  }
}

/**
 * Strip tool-call and tool-result messages from a ModelMessage array.
 * Used when the target model does not support tool calling — keeps only
 * text/reasoning content so the conversation history remains coherent.
 */
export function stripToolMessages(messages: ModelMessage[]): ModelMessage[] {
  const result: ModelMessage[] = [];
  for (const msg of messages) {
    const role = (msg as Record<string, unknown>).role as string;

    // Drop tool-result messages entirely
    if (role === "tool") continue;

    // For assistant messages, keep only text/reasoning parts
    if (role === "assistant") {
      const content = (msg as Record<string, unknown>).content;
      if (Array.isArray(content)) {
        const kept = (content as Array<Record<string, unknown>>).filter(
          (p) => p.type === "text" || p.type === "reasoning",
        );
        if (kept.length === 0) continue;
        result.push({ ...msg, content: kept } as unknown as ModelMessage);
        continue;
      }
    }

    result.push(msg);
  }
  return result;
}

export interface ToModelMessagesOptions {
  /** Timestamp: skip non-summary messages with created_at <= this value */
  summaryUpTo?: string;
  /** Number of recent DB messages to keep tool results at full length (default: 6) */
  recentFullFidelity?: number;
}

/** Max chars for truncated tool results in older messages */
const TRUNCATED_TOOL_RESULT_CHARS = 200;

/**
 * Convert DB messages to AI SDK ModelMessage format.
 * When options.summaryUpTo is set, summary messages (parent_id = "__context_summary__")
 * are injected as the first system message, and older messages are skipped.
 * Tool results in older messages (beyond recentFullFidelity) are truncated to save tokens.
 */
export function toModelMessages(
  dbMessages: Message[],
  options?: ToModelMessagesOptions,
): ModelMessage[] {
  const result: ModelMessage[] = [];
  const summaryUpTo = options?.summaryUpTo;
  const recentFull = options?.recentFullFidelity ?? 6;
  let summaryMessage: ModelMessage | null = null;

  // Count effective (non-skipped) messages to determine truncation boundary
  const effective = dbMessages.filter(
    (m) => m.parent_id !== "__context_summary__" && !(summaryUpTo && m.created_at <= summaryUpTo),
  );
  const truncateBeforeIdx = Math.max(0, effective.length - recentFull);
  let effectiveIdx = 0;

  for (const msg of dbMessages) {
    // Summary message → collect for injection at position 0
    if (msg.parent_id === "__context_summary__") {
      summaryMessage = { role: "system", content: msg.content ?? "" };
      continue;
    }

    // Skip messages covered by the summary
    if (summaryUpTo && msg.created_at <= summaryUpTo) {
      continue;
    }

    const maxResultChars = effectiveIdx < truncateBeforeIdx ? TRUNCATED_TOOL_RESULT_CHARS : undefined;
    effectiveIdx++;

    if (msg.role === "user") {
      result.push({
        role: "user",
        content: [{ type: "text", text: msg.content ?? "" }],
      });
    } else if (msg.role === "assistant") {
      if (msg.parts) {
        const reconstructed = reconstructFromParts(msg.parts, msg.reasoning, maxResultChars);
        if (reconstructed && reconstructed.length > 0) {
          result.push(...reconstructed);
          continue;
        }
      }
      result.push({
        role: "assistant",
        content: [{ type: "text", text: msg.content ?? "" }],
      });
    } else if (msg.role === "system") {
      result.push({
        role: "system",
        content: msg.content ?? "",
      });
    }
  }

  // Always inject summary as the first message
  if (summaryMessage) {
    result.unshift(summaryMessage);
  }

  return result;
}

/**
 * Run the agent — wraps streamText() with tool support and multi-step loop.
 */
/** 默认最大步数：每步 = 模型一轮生成（可含多次工具调用），步数用尽会停止，易被误以为"截断" */
const DEFAULT_MAX_STEPS = 30;

export function runAgent(options: AgentOptions) {
  const maxSteps = options.maxSteps ?? DEFAULT_MAX_STEPS;
  const hasTools = options.tools && Object.keys(options.tools).length > 0;

  return streamText({
    model: options.model,
    system: options.system ?? buildSystemPrompt({}),
    messages: options.messages,
    ...(hasTools ? { tools: options.tools, stopWhen: stepCountIs(maxSteps) } : {}),
    abortSignal: options.abortSignal,
    ...(options.maxOutputTokens != null && options.maxOutputTokens > 0
      ? { maxOutputTokens: options.maxOutputTokens }
      : {}),
  });
}
