import { tool } from "ai";
import { z } from "zod/v4";
import { invoke } from "@tauri-apps/api/core";
import { type FetchUrlResult } from "@/lib/url-utils";

interface CookiePair {
  name: string;
  value: string;
}

function formatCookieHeader(pairs: CookiePair[]): string {
  return pairs.map((p) => `${p.name}=${p.value}`).join("; ");
}

function extractDomain(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return "";
  }
}

export const fetchUrlTool = tool({
  description:
    "Fetch a URL's content as Markdown. Use when user provides a link but content is not available. " +
    "If the site blocks access or returns low-quality content, the result may suggest retrying with browser cookies — " +
    "ask the user for permission before doing so. Does not support YouTube transcripts.",
  inputSchema: z.object({
    url: z.string().describe("Full URL (must start with http:// or https://)"),
    timeoutMs: z.number().optional().describe("Timeout in ms, default 30000"),
    maxChars: z.number().optional().describe("Max content chars, default 120000"),
    useCookies: z
      .boolean()
      .optional()
      .describe("Set to true after user grants cookie permission for retry"),
  }),
  execute: async ({ url, timeoutMs = 30000, maxChars = 120000, useCookies }) => {
    try {
      let cookies: string | undefined;
      if (useCookies) {
        const domain = extractDomain(url);
        if (domain) {
          try {
            const pairs = await invoke<CookiePair[]>("get_browser_cookies", { domain });
            if (pairs.length > 0) {
              cookies = formatCookieHeader(pairs);
            }
          } catch {
            // Cookie reading failed, proceed without
          }
        }
      }

      const res = await invoke<FetchUrlResult>("fetch_url", {
        args: { url, timeoutMs, maxChars, cookies },
      });

      // Cookie retry takes priority: suggest retry before returning low-quality content
      if (res.retry_with_cookies && !useCookies) {
        const context = res.ok
          ? `${res.source} returned low-quality content (possibly anti-bot protection).`
          : `${res.source} fetch failed: ${res.error ?? "blocked"}.`;
        return (
          `${context} ` +
          "This site may require browser cookies to access. " +
          "Ask the user: 'This site appears to block automated access. " +
          "Would you like me to retry using your Chrome cookies for this domain?' " +
          "If they agree, call fetch_url again with useCookies=true."
        );
      }

      if (res.ok && res.content_md) {
        const title = res.title ? `[${res.title}](${res.source})` : res.source;
        return `## ${title}\n\n${res.content_md}`;
      }

      return res.error
        ? `${res.source} fetch failed: ${res.error}`
        : `${res.source} returned no readable content`;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return `Fetch failed: ${msg}`;
    }
  },
});
