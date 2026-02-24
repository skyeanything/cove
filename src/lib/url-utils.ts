/**
 * 从文本中提取 http(s) URL，用于自动抓取并注入消息上下文。
 * 仅匹配 http:// 或 https:// 开头，避免将 /skill 等 slash 命令误识别为 URL。
 */

const URL_REGEX = /https?:\/\/[^\s<>"{}|\\^`[\]]+/gi;

/** 最多处理的 URL 数量，防止滥用 */
export const MAX_URLS = 5;

/** 单条 URL 最大长度，超长视为无效 */
export const MAX_URL_LENGTH = 2048;

/**
 * 从文本中提取所有 http(s) URL，去重并限制数量和长度。
 * @param text 用户输入文本
 * @returns 按首次出现顺序的 URL 列表，最多 MAX_URLS 条
 */
export function extractUrls(text: string): string[] {
  if (!text || typeof text !== "string") return [];
  const seen = new Set<string>();
  const result: string[] = [];
  let match: RegExpExecArray | null;
  const re = new RegExp(URL_REGEX.source, "gi");
  while ((match = re.exec(text)) !== null && result.length < MAX_URLS) {
    const raw = match[0];
    // 去除末尾可能粘连的标点（含中英文及括号）
    const url = raw.replace(/[.,;:!?)\]\s。，、]+$/, "");
    if (url.length > MAX_URL_LENGTH) continue;
    const normalized = url.trim();
    if (normalized && !seen.has(normalized)) {
      seen.add(normalized);
      result.push(normalized);
    }
  }
  return result;
}

/** 单次 fetch_url 的返回结构（与 Tauri 一致） */
export interface FetchUrlResult {
  ok: boolean;
  title?: string;
  content_md?: string;
  error?: string;
  source: string;
}

/**
 * 将多次抓取结果拼成注入消息的「抓取内容」块，便于单元测试与 chatStore 复用。
 */
export function buildFetchBlockFromResults(results: FetchUrlResult[]): string {
  const parts: string[] = [];
  for (const res of results) {
    if (res.ok && res.content_md) {
      const title = res.title ? `[${res.title}](${res.source})` : res.source;
      parts.push(`## ${title}\n\n${res.content_md}`);
    } else if (res.error) {
      parts.push(`- ${res.source}：抓取失败（${res.error}）`);
    }
  }
  if (parts.length === 0) return "";
  return `\n\n[以下为抓取内容]\n\n${parts.join("\n\n")}`;
}
