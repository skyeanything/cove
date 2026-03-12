import { tool } from "ai";
import { z } from "zod/v4";
import { invoke } from "@tauri-apps/api/core";
import { type FetchUrlResult } from "@/lib/url-utils";
import { useWorkspaceStore } from "@/stores/workspaceStore";

interface CookiePair {
  name: string;
  value: string;
}

interface RenderUrlResult {
  ok: boolean;
  screenshot_base64?: string;
  pdf_base64?: string;
  error?: string;
  source: string;
}

interface RenderContentResult {
  ok: boolean;
  title?: string;
  content_md?: string;
  truncated?: boolean;
  error?: string;
  source: string;
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
    "Fetch URL content as Markdown. Set saveAsPdf/saveAsPng/saveAsMarkdown to export as file instead. " +
    "If blocked, result may suggest cookie retry — ask user permission first.",
  inputSchema: z.object({
    url: z.string().describe("Full URL (must start with http:// or https://)"),
    timeoutMs: z.number().optional().describe("Timeout in ms, default 30000"),
    maxChars: z.number().optional().describe("Max content chars, default 120000"),
    useCookies: z
      .boolean()
      .optional()
      .describe("Set to true after user grants cookie permission for retry"),
    saveAsPdf: z
      .boolean()
      .optional()
      .describe("Export page as PDF file"),
    saveAsPng: z
      .boolean()
      .optional()
      .describe("Export page as PNG screenshot"),
    saveAsMarkdown: z
      .boolean()
      .optional()
      .describe("Export page as Markdown file"),
  }),
  execute: async ({ url, timeoutMs = 30000, maxChars = 120000, useCookies, saveAsPdf, saveAsPng, saveAsMarkdown }) => {
    if (saveAsMarkdown) {
      return handleSaveAsMarkdown(url, timeoutMs, maxChars);
    }
    if (saveAsPng) {
      return handleSaveAsPng(url);
    }
    if (saveAsPdf) {
      return handleSaveAsPdf(url);
    }

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

      // Good content from HTTP — return directly
      if (res.ok && res.content_md && !res.low_quality) {
        const title = res.title ? `[${res.title}](${res.source})` : res.source;
        return `## ${title}\n\n${res.content_md}`;
      }

      // HTTP returned no/low-quality content — try Chrome rendering first
      const chromeResult = await chromeFallback(url, timeoutMs, maxChars);
      if (chromeResult) return chromeResult;

      // Chrome also failed — suggest cookie retry if applicable
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

      return res.error
        ? `${res.source} fetch failed: ${res.error}`
        : `${res.source} returned no readable content`;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return `Fetch failed: ${msg}`;
    }
  },
});

async function chromeFallback(url: string, timeoutMs: number, maxChars: number): Promise<string | null> {
  try {
    const rendered = await invoke<RenderContentResult>("render_extract_content", {
      args: { url, timeoutMs, maxChars },
    });
    if (rendered.ok && rendered.content_md) {
      const title = rendered.title ? `[${rendered.title}](${rendered.source})` : rendered.source;
      return `## ${title}\n\n${rendered.content_md}`;
    }
  } catch {
    // Chrome not available
  }
  return null;
}

async function handleSaveAsMarkdown(
  url: string,
  timeoutMs: number,
  maxChars: number,
): Promise<string> {
  const workspace = useWorkspaceStore.getState().activeWorkspace;
  if (!workspace?.path) {
    return "Cannot save Markdown: no active workspace. Please set a workspace first.";
  }

  try {
    const res = await invoke<FetchUrlResult>("fetch_url", {
      args: { url, timeoutMs, maxChars },
    });

    if (!res.ok || !res.content_md) {
      return res.error
        ? `Markdown export failed: ${res.error}`
        : `${res.source} returned no readable content`;
    }

    const title = res.title ? `# ${res.title}\n\nSource: ${res.source}\n\n` : "";
    const content = `${title}${res.content_md}`;
    const filename = `${new URL(url).hostname.replace(/\./g, "_")}_${Date.now()}.md`;
    await invoke("write_file", {
      args: { workspaceRoot: workspace.path, path: filename, content },
    });
    const savedPath = `${workspace.path}/${filename}`;

    return `Markdown saved to: ${savedPath}`;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return `Markdown export failed: ${msg}`;
  }
}

async function handleSaveAsPng(url: string): Promise<string> {
  const workspace = useWorkspaceStore.getState().activeWorkspace;
  if (!workspace?.path) {
    return "Cannot save PNG: no active workspace. Please set a workspace first.";
  }

  try {
    const renderResult = await invoke<RenderUrlResult>("render_url", {
      args: { url, screenshot: true, pdf: false },
    });

    if (!renderResult.ok || !renderResult.screenshot_base64) {
      return `PNG export failed: ${renderResult.error ?? "Chrome did not produce a screenshot. Is Chrome installed?"}`;
    }

    const filename = `${new URL(url).hostname.replace(/\./g, "_")}_${Date.now()}.png`;
    const savedPath = await invoke<string>("write_binary_file", {
      args: {
        workspaceRoot: workspace.path,
        path: filename,
        contentBase64: renderResult.screenshot_base64,
      },
    });

    return `PNG screenshot saved to: ${savedPath}`;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return `PNG export failed: ${msg}`;
  }
}

async function handleSaveAsPdf(url: string): Promise<string> {
  const workspace = useWorkspaceStore.getState().activeWorkspace;
  if (!workspace?.path) {
    return "Cannot save PDF: no active workspace. Please set a workspace first.";
  }

  try {
    const renderResult = await invoke<RenderUrlResult>("render_url", {
      args: { url, pdf: true, screenshot: false },
    });

    if (!renderResult.ok || !renderResult.pdf_base64) {
      return `PDF export failed: ${renderResult.error ?? "Chrome did not produce a PDF. Is Chrome installed?"}`;
    }

    const filename = `${new URL(url).hostname.replace(/\./g, "_")}_${Date.now()}.pdf`;
    const savedPath = await invoke<string>("write_binary_file", {
      args: {
        workspaceRoot: workspace.path,
        path: filename,
        contentBase64: renderResult.pdf_base64,
      },
    });

    return `PDF saved to: ${savedPath}`;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return `PDF export failed: ${msg}`;
  }
}
