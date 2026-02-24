import { tool } from "ai";
import { z } from "zod/v4";
import { invoke } from "@tauri-apps/api/core";
import { buildFetchBlockFromResults, type FetchUrlResult } from "@/lib/url-utils";

/**
 * 供模型主动调用的抓取工具：当用户消息包含 URL 且未自动注入内容时，可用本工具抓取页面。
 */
export const fetchUrlTool = tool({
  description:
    "抓取指定 URL 的网页内容并转为 Markdown（规避 CORS）。当用户消息中有链接但未提供页面内容时，请用本工具获取后再回答。不支持 YouTube 字幕。",
  inputSchema: z.object({
    url: z.string().describe("要抓取的完整 URL（须以 http:// 或 https:// 开头）"),
    timeoutMs: z.number().optional().describe("超时毫秒数，默认 15000"),
    maxChars: z.number().optional().describe("内容最大字符数，默认 120000"),
  }),
  execute: async ({ url, timeoutMs = 15000, maxChars = 120000 }) => {
    try {
      const res = await invoke<FetchUrlResult>("fetch_url", {
        args: { url, timeoutMs, maxChars },
      });
      if (res.ok && res.content_md) {
        const title = res.title ? `[${res.title}](${res.source})` : res.source;
        return `## ${title}\n\n${res.content_md}`;
      }
      return res.error
        ? `${res.source} 抓取失败：${res.error}`
        : `${res.source} 未返回可读内容`;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return `抓取失败：${msg}`;
    }
  },
});
