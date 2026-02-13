import type { Provider, ProviderConfig, ModelInfo } from "@/db/types";
import { PROVIDER_METAS } from "./provider-meta";

const CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutes

function parseConfig(provider: Provider): ProviderConfig {
  if (!provider.config) return {};
  try {
    return JSON.parse(provider.config) as ProviderConfig;
  } catch {
    return {};
  }
}

function isCacheValid(config: ProviderConfig): boolean {
  if (!config.cached_models || !config.cached_models_at) return false;
  const cachedAt = new Date(config.cached_models_at).getTime();
  return Date.now() - cachedAt < CACHE_TTL_MS;
}

/** Try to extract a human-readable error message from an HTTP response. */
async function extractErrorMessage(res: Response): Promise<string> {
  try {
    const body = await res.json() as Record<string, unknown>;
    // OpenAI / DeepSeek / xAI style: { error: { message: "..." } }
    const err = body.error as Record<string, unknown> | undefined;
    if (err?.message) return String(err.message);
    // Google style: { error: { status: "...", message: "..." } }
    if (body.message) return String(body.message);
    return res.statusText;
  } catch {
    return res.statusText || `HTTP ${res.status}`;
  }
}

async function fetchOpenAICompatibleModels(
  baseUrl: string,
  apiKey?: string,
): Promise<string[]> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (apiKey) {
    headers["Authorization"] = `Bearer ${apiKey}`;
  }

  const res = await fetch(`${baseUrl}/v1/models`, { headers });
  if (!res.ok) {
    const detail = await extractErrorMessage(res);
    throw new Error(`Failed to fetch models (${res.status}): ${detail}`);
  }

  const data = (await res.json()) as { data: Array<{ id: string }> };
  return data.data.map((m) => m.id).sort();
}

async function fetchOllamaModels(baseUrl: string): Promise<string[]> {
  const res = await fetch(`${baseUrl}/api/tags`);
  if (!res.ok) {
    const detail = await extractErrorMessage(res);
    throw new Error(`Failed to fetch Ollama models (${res.status}): ${detail}`);
  }

  const data = (await res.json()) as {
    models: Array<{ name: string }>;
  };
  return data.models.map((m) => m.name).sort();
}

/**
 * Verify API key validity for providers that don't support model listing.
 * Sends a lightweight request and interprets the response status.
 */
async function verifyApiKey(provider: Provider): Promise<void> {
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
        body: JSON.stringify({
          model: "claude-haiku-4-5-20251001",
          max_tokens: 1,
          messages: [],
        }),
      });
      if (res.status === 401 || res.status === 403) {
        const detail = await extractErrorMessage(res);
        throw new Error(`Invalid API key: ${detail}`);
      }
      return;
    }

    case "google": {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models?key=${provider.api_key || ""}`,
      );
      if (res.status === 400 || res.status === 401 || res.status === 403) {
        const detail = await extractErrorMessage(res);
        throw new Error(`Invalid API key: ${detail}`);
      }
      if (!res.ok) {
        const detail = await extractErrorMessage(res);
        throw new Error(`Connection failed (${res.status}): ${detail}`);
      }
      return;
    }

    case "azure": {
      const config = parseConfig(provider);
      const url = `${baseUrl}/openai/deployments?api-version=${config.api_version || "2024-06-01"}`;
      const res = await fetch(url, {
        headers: { "api-key": provider.api_key || "" },
      });
      if (res.status === 401 || res.status === 403) {
        const detail = await extractErrorMessage(res);
        throw new Error(`Invalid API key: ${detail}`);
      }
      if (!res.ok) {
        const detail = await extractErrorMessage(res);
        throw new Error(`Connection failed (${res.status}): ${detail}`);
      }
      return;
    }

    case "bedrock": {
      return;
    }

    default: {
      const res = await fetch(`${baseUrl}/v1/models`, {
        headers: {
          Authorization: `Bearer ${provider.api_key || ""}`,
        },
      });
      if (res.status === 401 || res.status === 403) {
        const detail = await extractErrorMessage(res);
        throw new Error(`Invalid API key: ${detail}`);
      }
      if (!res.ok) {
        const detail = await extractErrorMessage(res);
        throw new Error(`Connection failed (${res.status}): ${detail}`);
      }
      return;
    }
  }
}

export async function fetchModels(provider: Provider): Promise<string[]> {
  const config = parseConfig(provider);
  const meta = PROVIDER_METAS[provider.type];

  // Return cached if valid
  if (isCacheValid(config) && config.cached_models) {
    return config.cached_models;
  }

  // If provider supports dynamic fetching, try it
  if (meta.supportsModelFetch) {
    try {
      if (provider.type === "ollama") {
        return await fetchOllamaModels(
          provider.base_url || "http://localhost:11434",
        );
      }
      return await fetchOpenAICompatibleModels(
        provider.base_url || meta.defaultBaseUrl || "",
        provider.api_key,
      );
    } catch {
      // Fall through to known models
    }
  }

  return meta.knownModels;
}

export function getModelsForProviders(providers: Provider[]): ModelInfo[] {
  const models: ModelInfo[] = [];

  for (const provider of providers) {
    if (!provider.enabled) continue;

    const meta = PROVIDER_METAS[provider.type];
    const config = parseConfig(provider);
    const modelIds =
      config.cached_models && config.cached_models.length > 0
        ? config.cached_models
        : meta.knownModels;

    const disabled = new Set(config.disabled_models ?? []);

    for (const id of modelIds) {
      if (disabled.has(id)) continue;
      models.push({
        id,
        name: id,
        provider_id: provider.id,
        provider_name: provider.name,
        provider_type: provider.type,
      });
    }
  }

  return models;
}

/**
 * Verify credentials and fetch models. Errors propagate to the caller.
 * For providers with model listing — fetches real models (validates key implicitly).
 * For others — verifies the API key, then returns known models.
 */
export async function verifyAndFetchModels(provider: Provider): Promise<string[]> {
  const meta = PROVIDER_METAS[provider.type];
  const baseUrl = provider.base_url || meta.defaultBaseUrl || "";

  if (meta.supportsModelFetch) {
    if (provider.type === "ollama") {
      return await fetchOllamaModels(baseUrl || "http://localhost:11434");
    }
    return await fetchOpenAICompatibleModels(baseUrl, provider.api_key);
  }

  await verifyApiKey(provider);
  return meta.knownModels;
}

export async function testConnection(
  provider: Provider,
): Promise<{ ok: boolean; error?: string; models?: string[] }> {
  const meta = PROVIDER_METAS[provider.type];

  try {
    if (meta.supportsModelFetch) {
      // Providers that support model listing — fetch validates the key implicitly
      const models = await fetchModels(provider);
      return { ok: true, models };
    }

    // For providers without model listing, verify credentials directly
    await verifyApiKey(provider);
    return { ok: true, models: meta.knownModels };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Connection failed",
    };
  }
}
