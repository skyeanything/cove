/** 将内容按 <think>...</think> 拆分为片段，供 MessageList 与 MarkdownContent 使用 */
export type ThinkBlock =
  | { type: "think"; content: string }
  | { type: "markdown"; content: string };

export function splitThinkBlocks(text: string): ThinkBlock[] {
  const safe = typeof text === "string" ? text : "";
  const result: ThinkBlock[] = [];
  const open = "<think>";
  const close = "</think>";
  let remaining = safe;
  while (remaining.length > 0) {
    const openIdx = remaining.indexOf(open);
    if (openIdx === -1) {
      if (remaining.trim()) result.push({ type: "markdown", content: remaining });
      break;
    }
    if (openIdx > 0 && remaining.slice(0, openIdx).trim()) {
      result.push({ type: "markdown", content: remaining.slice(0, openIdx) });
    }
    const afterOpen = remaining.slice(openIdx + open.length);
    const closeIdx = afterOpen.indexOf(close);
    if (closeIdx === -1) {
      result.push({ type: "markdown", content: remaining });
      break;
    }
    const thinkContent = afterOpen.slice(0, closeIdx).trim();
    if (thinkContent) result.push({ type: "think", content: thinkContent });
    remaining = afterOpen.slice(closeIdx + close.length);
  }
  return result;
}
