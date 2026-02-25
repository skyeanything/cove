import type { Provider } from "@/db/types";
import { PROVIDER_METAS } from "./provider-meta";

/** Try to extract a human-readable error message from an HTTP response. */
export async function extractErrorMessage(res: Response): Promise<string> {
  try {
    const body = await res.json() as Record<string, unknown>;
    const err = body.error as Record<string, unknown> | undefined;
    if (err?.message) return String(err.message);
    if (body.message) return String(body.message);
    return res.statusText;
  } catch {
    return res.statusText || `HTTP ${res.status}`;
  }
}

function normalizeMinimaxBaseUrl(baseUrl: string): string {
  const clean = baseUrl.replace(/\/+$/, "");
  return clean.endsWith("/v1") ? clean.slice(0, -3) : clean;
}

function normalizeOpenAIBaseUrl(baseUrl: string): string {
  const clean = baseUrl.replace(/\/+$/, "");
  return clean.endsWith("/v1") ? clean.slice(0, -3) : clean;
}

function parseConfig(provider: Provider): Record<string, unknown> {
  if (!provider.config) return {};
  try {
    return JSON.parse(provider.config) as Record<string, unknown>;
  } catch {
    return {};
  }
}

/**
 * Verify API key validity for providers that don't support model listing.
 * Sends a lightweight request and interprets the response status.
 */
export async function verifyApiKey(provider: Provider): Promise<void> {
  const meta = PROVIDER_METAS[provider.type];
  const baseUrl = provider.base_url || meta.defaultBaseUrl || "";

  switch (provider.type) {
    case "anthropic": {
      const res = await fetch(`${baseUrl}/v1/messages`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": provider.api_key || "",
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({ model: "claude-haiku-4-5-20251001", max_tokens: 1, messages: [] }),
      });
      if (res.status === 401 || res.status === 403) {
        throw new Error(`Invalid API key: ${await extractErrorMessage(res)}`);
      }
      return;
    }

    case "google": {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models?key=${provider.api_key || ""}`,
      );
      if (res.status === 400 || res.status === 401 || res.status === 403) {
        throw new Error(`Invalid API key: ${await extractErrorMessage(res)}`);
      }
      if (!res.ok) throw new Error(`Connection failed (${res.status}): ${await extractErrorMessage(res)}`);
      return;
    }

    case "azure": {
      const config = parseConfig(provider);
      const apiVersion = (config.api_version as string | undefined) || "2024-06-01";
      const res = await fetch(`${baseUrl}/openai/deployments?api-version=${apiVersion}`, {
        headers: { "api-key": provider.api_key || "" },
      });
      if (res.status === 401 || res.status === 403) {
        throw new Error(`Invalid API key: ${await extractErrorMessage(res)}`);
      }
      if (!res.ok) throw new Error(`Connection failed (${res.status}): ${await extractErrorMessage(res)}`);
      return;
    }

    case "minimax": {
      const normalizedBase = normalizeMinimaxBaseUrl(baseUrl);
      const res = await fetch(`${normalizedBase}/v1/text/chatcompletion_v2`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${provider.api_key || ""}` },
        body: JSON.stringify({ model: "MiniMax-M2.5", max_tokens: 1, messages: [{ role: "user", content: "ping" }] }),
      });
      if (res.status === 401 || res.status === 403) {
        throw new Error(`Invalid API key: ${await extractErrorMessage(res)}`);
      }
      if (!res.ok) throw new Error(`Connection failed (${res.status}): ${await extractErrorMessage(res)}`);
      return;
    }

    case "aliyun": {
      const res = await fetch(`${baseUrl}/chat/completions`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${provider.api_key || ""}` },
        body: JSON.stringify({ model: "qwen-plus", max_tokens: 1, messages: [{ role: "user", content: "ping" }] }),
      });
      if (res.status === 401 || res.status === 403) {
        throw new Error(`Invalid API key: ${await extractErrorMessage(res)}`);
      }
      if (!res.ok) throw new Error(`Connection failed (${res.status}): ${await extractErrorMessage(res)}`);
      return;
    }

    case "tencent-cloud": {
      const res = await fetch(`${baseUrl}/chat/completions`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${provider.api_key || ""}` },
        body: JSON.stringify({ model: "hunyuan-turbos-latest", max_tokens: 1, messages: [{ role: "user", content: "ping" }] }),
      });
      if (res.status === 401 || res.status === 403) {
        throw new Error(`Invalid API key: ${await extractErrorMessage(res)}`);
      }
      if (!res.ok) throw new Error(`Connection failed (${res.status}): ${await extractErrorMessage(res)}`);
      return;
    }

    case "volcengine-ark": {
      const res = await fetch(`${baseUrl}/chat/completions`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${provider.api_key || ""}` },
        body: JSON.stringify({ model: "seed-1-6-250915", max_tokens: 1, messages: [{ role: "user", content: "ping" }] }),
      });
      if (res.status === 401 || res.status === 403) {
        throw new Error(`Invalid API key: ${await extractErrorMessage(res)}`);
      }
      if (!res.ok) throw new Error(`Connection failed (${res.status}): ${await extractErrorMessage(res)}`);
      return;
    }

    case "bedrock": {
      return;
    }

    default: {
      const normalizedBase = normalizeOpenAIBaseUrl(baseUrl);
      const res = await fetch(`${normalizedBase}/v1/models`, {
        headers: { Authorization: `Bearer ${provider.api_key || ""}` },
      });
      if (res.status === 401 || res.status === 403) {
        throw new Error(`Invalid API key: ${await extractErrorMessage(res)}`);
      }
      if (!res.ok) throw new Error(`Connection failed (${res.status}): ${await extractErrorMessage(res)}`);
      return;
    }
  }
}
