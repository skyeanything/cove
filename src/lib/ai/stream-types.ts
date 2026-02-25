import type { MessagePart, ToolCallInfo } from "@/stores/chat-types";

export interface StreamLike {
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

export interface StreamDebugOptions {
  enabled?: boolean;
  label?: string;
  previewChars?: number;
}
