import { generateText } from "ai";
import type { LanguageModel } from "ai";
import type { Message } from "@/db/types";
import compressionPromptTemplate from "@/prompts/context-compression.md?raw";

/** Default threshold: compress when estimated tokens reach 75% of context window */
const DEFAULT_THRESHOLD = 0.75;
/** Ratio of context window to keep as recent messages */
const DEFAULT_KEEP_RATIO = 0.4;
/** Minimum number of messages before compression is considered (2 complete turns) */
const MIN_MESSAGES_FOR_COMPRESSION = 4;
/** Max output tokens for the summary generation */
const SUMMARY_MAX_TOKENS = 2048;

/**
 * Estimate the input tokens for the next turn.
 * Prefers the last assistant message's `tokens_input + tokens_output` (precise),
 * falls back to `sum(content.length) / 4` (rough char-based estimate).
 */
export function estimateNextTurnTokens(
  messages: Message[],
  newUserChars: number,
): number {
  // After compression, messages contain a summary — tokens_input on kept
  // assistant messages is stale (pre-compression value), so skip the
  // precise path and use chars-based fallback instead.
  const hasSummary = messages.some(
    (m) => m.parent_id === "__context_summary__",
  );

  if (!hasSummary) {
    const lastAssistant = [...messages]
      .reverse()
      .find((m) => m.role === "assistant");

    if (
      lastAssistant?.tokens_input != null &&
      lastAssistant.tokens_input > 0
    ) {
      return (
        lastAssistant.tokens_input +
        (lastAssistant.tokens_output ?? 0) +
        Math.ceil(newUserChars / 4)
      );
    }
  }

  // Fallback: rough estimate from all message content
  const totalChars = messages.reduce(
    (sum, m) => sum + (m.content?.length ?? 0),
    0,
  );
  return Math.ceil((totalChars + newUserChars) / 4);
}

/**
 * Determine whether context compression should be triggered.
 */
export function shouldCompress(
  messages: Message[],
  contextWindow: number,
  threshold: number = DEFAULT_THRESHOLD,
): boolean {
  if (messages.length < MIN_MESSAGES_FOR_COMPRESSION) {
    console.debug(
      `[context-compression] Skipped: only ${messages.length} messages (min ${MIN_MESSAGES_FOR_COMPRESSION})`,
    );
    return false;
  }
  const estimated = estimateNextTurnTokens(messages, 0);
  const limit = contextWindow * threshold;
  console.debug(
    `[context-compression] estimated=${estimated}, limit=${Math.round(limit)}, trigger=${estimated >= limit}`,
  );
  return estimated >= limit;
}

/**
 * Find the boundary between messages to compress and messages to keep.
 * Accumulates from the end, keeping messages within `keepRatio * contextWindow` tokens.
 * Ensures assistant + tool message groups are not split.
 */
export function selectCompressionBoundary(
  messages: Message[],
  contextWindow: number,
  keepRatio: number = DEFAULT_KEEP_RATIO,
): { toCompress: Message[]; toKeep: Message[] } {
  const keepBudget = contextWindow * keepRatio;
  let tokenAcc = 0;
  let splitIndex = messages.length; // default: keep nothing

  // Walk backwards to accumulate keep-zone tokens
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i]!;
    const msgTokens = estimateMessageTokens(msg);
    if (tokenAcc + msgTokens > keepBudget) break;
    tokenAcc += msgTokens;
    splitIndex = i;
  }

  // Ensure we don't split tool-call groups: if splitIndex lands on a tool
  // message or a message whose next message is a tool result for an
  // assistant tool-call, move splitIndex backwards to include the full group.
  splitIndex = adjustBoundaryForToolGroups(messages, splitIndex);

  // Never compress everything — keep at least the last 2 messages
  if (splitIndex >= messages.length - 1) {
    splitIndex = Math.max(0, messages.length - 2);
  }

  // Must have at least 1 message to compress
  if (splitIndex <= 0) {
    return { toCompress: [], toKeep: messages };
  }

  return {
    toCompress: messages.slice(0, splitIndex),
    toKeep: messages.slice(splitIndex),
  };
}

/**
 * Generate a summary of compressed messages using the LLM.
 */
export async function generateSummary(
  model: LanguageModel,
  toCompress: Message[],
  existingSummary: string | null,
): Promise<{ summaryContent: string; compressedUpTo: string }> {
  const serialized = serializeMessages(toCompress);
  const lastMsg = toCompress[toCompress.length - 1]!;

  let prompt = compressionPromptTemplate.replace("{{messages}}", serialized);
  if (existingSummary) {
    prompt = prompt.replace(
      "{{existing_summary}}",
      `Previous summary (incorporate and update):\n${existingSummary}\n`,
    );
  } else {
    prompt = prompt.replace("{{existing_summary}}", "");
  }

  const { text } = await generateText({
    model,
    system: prompt,
    messages: [{ role: "user", content: "Generate the summary." }],
    maxOutputTokens: SUMMARY_MAX_TOKENS,
  });

  return {
    summaryContent: text.trim(),
    compressedUpTo: lastMsg.created_at,
  };
}

/** Estimate tokens for a single message (rough: chars / 4) */
function estimateMessageTokens(msg: Message): number {
  const contentLen = msg.content?.length ?? 0;
  const partsLen = msg.parts?.length ?? 0;
  return Math.ceil((contentLen + partsLen) / 4);
}

/** Serialize messages into a human-readable format for the summary prompt */
function serializeMessages(messages: Message[]): string {
  return messages
    .map((msg) => {
      const role = msg.role.charAt(0).toUpperCase() + msg.role.slice(1);
      if (msg.role === "assistant" && msg.parts) {
        return serializeAssistantWithParts(msg);
      }
      return `${role}: ${msg.content ?? "(empty)"}`;
    })
    .join("\n");
}

function serializeAssistantWithParts(msg: Message): string {
  try {
    const parts = JSON.parse(msg.parts!) as unknown[];
    const lines: string[] = [];
    for (const part of parts) {
      const p = part as Record<string, unknown>;
      if (p.type === "text" && p.text) {
        lines.push(`Assistant: ${p.text}`);
      } else if (p.type === "tool") {
        const result = p.result != null
          ? String(p.result).slice(0, 200)
          : "(no result)";
        lines.push(`[Tool: ${p.toolName}(${JSON.stringify(p.args)}) → ${result}]`);
      }
    }
    return lines.join("\n") || `Assistant: ${msg.content ?? "(empty)"}`;
  } catch {
    return `Assistant: ${msg.content ?? "(empty)"}`;
  }
}

/**
 * Adjust the split boundary so that assistant+tool message groups
 * are never separated across compress/keep zones.
 */
function adjustBoundaryForToolGroups(
  messages: Message[],
  splitIndex: number,
): number {
  if (splitIndex <= 0 || splitIndex >= messages.length) return splitIndex;

  // If the message at splitIndex is a tool role, move split backwards
  // to include the preceding assistant message that made the tool call.
  while (
    splitIndex > 0 &&
    splitIndex < messages.length &&
    messages[splitIndex]!.role === "tool"
  ) {
    splitIndex--;
  }

  // If the message just before splitIndex is an assistant with parts
  // containing tool calls, and the next messages are tool results,
  // move splitIndex forward to keep them together in the keep zone.
  if (splitIndex > 0) {
    const prevMsg = messages[splitIndex - 1]!;
    if (prevMsg.role === "assistant" && prevMsg.parts) {
      try {
        const parts = JSON.parse(prevMsg.parts) as unknown[];
        const hasToolCalls = parts.some(
          (p) => (p as Record<string, unknown>).type === "tool",
        );
        if (hasToolCalls) {
          // Move boundary before the assistant to keep the group together
          splitIndex = splitIndex - 1;
        }
      } catch {
        // ignore parse errors
      }
    }
  }

  return splitIndex;
}
