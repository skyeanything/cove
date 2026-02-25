import { extractUrls, buildFetchBlockFromResults, type FetchUrlResult } from "@/lib/url-utils";
import { invoke } from "@tauri-apps/api/core";
import type { ModelMessage } from "ai";

/** 根据用户文本中的 URL 抓取并返回要注入的「抓取内容」块 */
export async function getFetchBlockForText(text: string): Promise<string> {
  const urls = extractUrls(text);
  if (urls.length === 0) return "";
  const results: FetchUrlResult[] = [];
  for (const url of urls) {
    try {
      const res = await invoke<FetchUrlResult>("fetch_url", {
        args: { url, timeoutMs: 15000, maxChars: 120000 },
      });
      results.push(res);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      results.push({ ok: false, error: msg, source: url });
    }
  }
  if (import.meta.env.DEV) {
    console.debug("[chatStore] URL 抓取", { urlCount: urls.length, partCount: results.length });
  }
  return buildFetchBlockFromResults(results);
}

/** 将抓取块追加到 modelMessages 中最后一条 user 消息的文本后 */
export function injectFetchBlockIntoLastUserMessage(modelMessages: ModelMessage[], fetchBlock: string): void {
  if (!fetchBlock) return;
  const latestUserIndex = [...modelMessages]
    .reverse()
    .findIndex((message) => message.role === "user");
  if (latestUserIndex < 0) return;
  const index = modelMessages.length - 1 - latestUserIndex;
  const msg = modelMessages[index] as { role: string; content: Array<{ type: string; text?: string }> };
  if (Array.isArray(msg.content) && msg.content[0]?.type === "text" && typeof msg.content[0].text === "string") {
    msg.content[0].text = msg.content[0].text + fetchBlock;
  }
}
