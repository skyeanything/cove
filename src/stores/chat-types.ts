import type { Attachment } from "@/db/types";

export interface ToolCallInfo {
  id: string;
  toolName: string;
  args: Record<string, unknown>;
  result?: unknown;
  isLoading: boolean;
  /** 开始执行时间戳，用于计算耗时 */
  startTime?: number;
  /** 执行耗时（毫秒），仅当耗时较长时展示 */
  durationMs?: number;
  /** 流式参数 JSON 字符串（有值时先展示原始 JSON，流式结束后再展示格式化内容） */
  argsJsonStream?: string;
}

export interface DraftAttachment {
  id: string;
  type: Attachment["type"];
  name?: string;
  path?: string;
  mime_type?: string;
  size?: number;
  content?: string;
}

/** 一条消息内的有序片段：文本与工具调用按出现顺序交错 */
export type MessagePart =
  | { type: "text"; text: string }
  | { type: "reasoning"; text: string }
  | ({ type: "tool" } & ToolCallInfo);
