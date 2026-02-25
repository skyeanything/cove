import { streamText, stepCountIs } from "ai";
import type { LanguageModel, ModelMessage } from "ai";
import type { Message } from "@/db/types";
import { buildSystemPrompt } from "./context";
import { AGENT_TOOLS } from "./tools";

export interface AgentOptions {
  model: LanguageModel;
  messages: ModelMessage[];
  system?: string;
  /** 不传则使用默认 AGENT_TOOLS；传则使用该工具集（如 getAgentTools(enabledSkillNames)） */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  tools?: Record<string, any>;
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
function normalizeToolOutput(result: unknown): NormalizedToolOutput {
  if (typeof result === "string") {
    return { type: "text", value: result };
  }
  return { type: "text", value: JSON.stringify(result ?? null, null, 2) };
}

function reconstructFromParts(partsJson: string, reasoning?: string | null): ModelMessage[] | null {
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
          ? normalizeToolOutput(part.result)
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
 * Convert DB messages to AI SDK ModelMessage format.
 */
export function toModelMessages(dbMessages: Message[]): ModelMessage[] {
  const result: ModelMessage[] = [];

  for (const msg of dbMessages) {
    if (msg.role === "user") {
      result.push({
        role: "user",
        content: [{ type: "text", text: msg.content ?? "" }],
      });
    } else if (msg.role === "assistant") {
      if (msg.parts) {
        const reconstructed = reconstructFromParts(msg.parts, msg.reasoning);
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

  return result;
}

/**
 * Run the agent — wraps streamText() with tool support and multi-step loop.
 */
/** 默认最大步数：每步 = 模型一轮生成（可含多次工具调用），步数用尽会停止，易被误以为“截断” */
const DEFAULT_MAX_STEPS = 30;

export function runAgent(options: AgentOptions) {
  const maxSteps = options.maxSteps ?? DEFAULT_MAX_STEPS;

  return streamText({
    model: options.model,
    system: options.system ?? buildSystemPrompt({}),
    messages: options.messages,
    tools: options.tools ?? AGENT_TOOLS,
    stopWhen: stepCountIs(maxSteps),
    abortSignal: options.abortSignal,
    ...(options.maxOutputTokens != null && options.maxOutputTokens > 0
      ? { maxOutputTokens: options.maxOutputTokens }
      : {}),
  });
}
