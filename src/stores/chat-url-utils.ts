import { extractUrls, buildFetchBlockFromResults, type FetchUrlResult } from "@/lib/url-utils";
import { invoke } from "@tauri-apps/api/core";
import type { ModelMessage } from "ai";
import type { UserContent } from "ai";

export interface UrlFetchResult {
  textBlock: string;
  screenshotParts: Array<{ type: "image"; image: string }>;
}

export interface UrlFetchOptions {
  modelSupportsVision?: boolean;
}

interface RenderUrlResult {
  ok: boolean;
  screenshot_base64?: string;
  pdf_base64?: string;
  error?: string;
  source: string;
}

/**
 * Fetch URLs found in user text and return structured result.
 * For vision-capable models, also captures screenshots via Chrome headless.
 */
export async function getFetchBlockForText(
  text: string,
  options?: UrlFetchOptions,
): Promise<UrlFetchResult> {
  const empty: UrlFetchResult = { textBlock: "", screenshotParts: [] };
  const urls = extractUrls(text);
  if (urls.length === 0) return empty;

  // Start render in background (if vision-capable)
  const renderPromise = options?.modelSupportsVision
    ? tryRenderUrls(urls)
    : Promise.resolve([]);

  const results: FetchUrlResult[] = [];
  for (const url of urls) {
    try {
      const res = await invoke<FetchUrlResult>("fetch_url", {
        args: { url, timeoutMs: 30000, maxChars: 120000 },
      });
      results.push(res);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      results.push({ ok: false, error: msg, source: url });
    }
  }

  const screenshotParts = await renderPromise;

  if (import.meta.env.DEV) {
    console.debug("[chatStore] URL fetch", { urlCount: urls.length, resultCount: results.length, screenshots: screenshotParts.length });
  }

  return { textBlock: buildFetchBlockFromResults(results), screenshotParts };
}

async function tryRenderUrls(urls: string[]): Promise<Array<{ type: "image"; image: string }>> {
  const parts: Array<{ type: "image"; image: string }> = [];
  const renderResults = await Promise.allSettled(
    urls.map((url) =>
      invoke<RenderUrlResult>("render_url", {
        args: { url, screenshot: true, pdf: false },
      }),
    ),
  );
  for (const r of renderResults) {
    if (r.status === "fulfilled" && r.value.ok && r.value.screenshot_base64) {
      parts.push({ type: "image", image: `data:image/png;base64,${r.value.screenshot_base64}` });
    }
  }
  return parts;
}

/** Inject URL fetch result (text + screenshots) into the last user message */
export function injectUrlFetchResult(modelMessages: ModelMessage[], result: UrlFetchResult): void {
  if (!result.textBlock && result.screenshotParts.length === 0) return;
  const latestUserIndex = [...modelMessages]
    .reverse()
    .findIndex((message) => message.role === "user");
  if (latestUserIndex < 0) return;
  const index = modelMessages.length - 1 - latestUserIndex;
  const msg = modelMessages[index]!;

  if (result.screenshotParts.length === 0) {
    // Text-only: append to existing text part
    const cast = msg as { role: string; content: Array<{ type: string; text?: string }> };
    if (Array.isArray(cast.content) && cast.content[0]?.type === "text" && typeof cast.content[0].text === "string") {
      cast.content[0].text = cast.content[0].text + result.textBlock;
    }
    return;
  }

  // Multimodal: rebuild content as UserContent array
  const existingText = extractTextFromMessage(msg);
  const nextContent: UserContent = [];
  const combinedText = `${existingText}${result.textBlock}`.trim();
  if (combinedText) nextContent.push({ type: "text", text: combinedText });
  for (const part of result.screenshotParts) nextContent.push(part);
  if (nextContent.length > 0) {
    modelMessages[index] = { role: "user", content: nextContent };
  }
}

function extractTextFromMessage(msg: ModelMessage): string {
  const cast = msg as { content: string | Array<{ type: string; text?: string }> };
  if (typeof cast.content === "string") return cast.content;
  if (Array.isArray(cast.content)) {
    const textPart = cast.content.find((p) => p.type === "text");
    return textPart?.text ?? "";
  }
  return "";
}

/** @deprecated Use injectUrlFetchResult instead */
export function injectFetchBlockIntoLastUserMessage(modelMessages: ModelMessage[], fetchBlock: string): void {
  injectUrlFetchResult(modelMessages, { textBlock: fetchBlock, screenshotParts: [] });
}
