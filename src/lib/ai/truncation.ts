/**
 * 工具输出截断：防止超长输出撑爆上下文。
 * 参考 opencode packages/opencode/src/tool/truncation.ts
 */

const MAX_LINES = 2000;
const MAX_BYTES = 50 * 1024; // 50KB

const TRUNCATE_MESSAGE =
  "\n\n[... 输出已截断。可用 read(offset/limit) 或 bash 命令继续查看完整内容 ...]\n\n";

export interface TruncateResult {
  content: string;
  truncated: boolean;
}

export interface TruncateOptions {
  maxLines?: number;
  maxBytes?: number;
}

/**
 * 对工具输出做行数/字节数截断：超限时保留头尾，中间插入提示。
 */
export function truncateOutput(
  text: string,
  options?: TruncateOptions,
): TruncateResult {
  const maxLines = options?.maxLines ?? MAX_LINES;
  const maxBytes = options?.maxBytes ?? MAX_BYTES;

  const lines = text.split("\n");
  const byteLength = new TextEncoder().encode(text).length;

  if (lines.length <= maxLines && byteLength <= maxBytes) {
    return { content: text, truncated: false };
  }

  // 超限：保留前半与后半，中间插入截断提示
  const halfLines = Math.floor(maxLines / 2);
  const head = lines.slice(0, halfLines).join("\n");
  const tail = lines.slice(-halfLines).join("\n");
  const content = head + TRUNCATE_MESSAGE + tail;

  return { content, truncated: true };
}
