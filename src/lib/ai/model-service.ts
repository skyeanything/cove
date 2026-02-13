import type { Provider, ProviderConfig, ModelInfo, ModelOption } from "@/db/types";
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

/** Moonshot 模型列表返回 context_length、supports_image_in、supports_reasoning 等，需解析并写入 model_options */
interface MoonshotModelItem {
  id: string;
  context_length?: number;
  supports_image_in?: boolean;
  supports_reasoning?: boolean;
}

async function fetchMoonshotModels(
  baseUrl: string,
  apiKey?: string,
): Promise<{ modelIds: string[]; modelOptions: Record<string, Partial<ModelOption>> }> {
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

  const data = (await res.json()) as { data: MoonshotModelItem[] };
  const modelIds = data.data.map((m) => m.id).sort();
  const modelOptions: Record<string, Partial<ModelOption>> = {};
  for (const m of data.data) {
    const opt: Partial<ModelOption> = {};
    if (m.context_length != null) opt.context_window = m.context_length;
    if (m.supports_image_in === true) opt.image_in = true;
    if (m.supports_reasoning === true) opt.reasoning = true;
    // Moonshot 特殊：id 含 thinking 的模型支持推理
    if (m.id.includes("thinking")) opt.reasoning = true;
    // kimi-k2.5 支持图片输入与推理（API 可能已返回，此处兜底）
    if (m.id.includes("k2.5")) {
      opt.image_in = true;
      opt.reasoning = true;
    }
    if (Object.keys(opt).length > 0) modelOptions[m.id] = opt;
  }
  return { modelIds, modelOptions };
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
      if (provider.type === "moonshot") {
        const { modelIds } = await fetchMoonshotModels(
          provider.base_url || meta.defaultBaseUrl || "",
          provider.api_key,
        );
        return modelIds;
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

/** 读取某 provider 下某模型的可选配置（能力、上下文窗口、最大输出 tokens 等） */
export function getModelOption(provider: Provider, modelId: string): ModelOption | undefined {
  const config = parseConfig(provider);
  return config.model_options?.[modelId];
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
 * Moonshot 会额外返回 modelOptions（context_window、image_in），供表单合并到 config。
 */
export type VerifyAndFetchResult =
  | string[]
  | { modelIds: string[]; modelOptions: Record<string, Partial<ModelOption>> };

export async function verifyAndFetchModels(
  provider: Provider,
): Promise<VerifyAndFetchResult> {
  const meta = PROVIDER_METAS[provider.type];
  const baseUrl = provider.base_url || meta.defaultBaseUrl || "";

  if (meta.supportsModelFetch) {
    if (provider.type === "ollama") {
      return await fetchOllamaModels(baseUrl || "http://localhost:11434");
    }
    if (provider.type === "moonshot") {
      return await fetchMoonshotModels(baseUrl, provider.api_key);
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
