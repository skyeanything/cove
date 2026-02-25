import type { Provider, ProviderConfig, ModelInfo, ModelOption } from "@/db/types";
import { PROVIDER_METAS } from "./provider-meta";
import { verifyApiKey } from "./model-verify";
import { extractErrorMessage } from "./model-verify";

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

function normalizeOpenAIBaseUrl(baseUrl: string): string {
  const clean = baseUrl.replace(/\/+$/, "");
  return clean.endsWith("/v1") ? clean.slice(0, -3) : clean;
}

async function fetchOpenAICompatibleModels(
  baseUrl: string,
  apiKey?: string,
): Promise<string[]> {
  const normalizedBase = normalizeOpenAIBaseUrl(baseUrl);
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (apiKey) headers["Authorization"] = `Bearer ${apiKey}`;

  const res = await fetch(`${normalizedBase}/v1/models`, { headers });
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
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (apiKey) headers["Authorization"] = `Bearer ${apiKey}`;

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
    if (m.id.includes("thinking")) opt.reasoning = true;
    if (m.id.includes("k2.5")) { opt.image_in = true; opt.reasoning = true; }
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

  const data = (await res.json()) as { models: Array<{ name: string }> };
  return data.models.map((m) => m.name).sort();
}

export async function fetchModels(provider: Provider): Promise<string[]> {
  const config = parseConfig(provider);
  const meta = PROVIDER_METAS[provider.type];

  if (isCacheValid(config) && config.cached_models) return config.cached_models;

  if (meta.supportsModelFetch) {
    try {
      if (provider.type === "ollama") return await fetchOllamaModels(provider.base_url || "http://localhost:11434");
      if (provider.type === "moonshot") {
        const { modelIds } = await fetchMoonshotModels(provider.base_url || meta.defaultBaseUrl || "", provider.api_key);
        return modelIds;
      }
      return await fetchOpenAICompatibleModels(provider.base_url || meta.defaultBaseUrl || "", provider.api_key);
    } catch {
      // Fall through to known models
    }
  }

  return meta.knownModels;
}

/** 读取某 provider 下某模型的可选配置。优先使用 config（如 Moonshot API 拉取的 model_options），再回退到 meta 的 knownModelDetails。 */
export function getModelOption(provider: Provider, modelId: string): ModelOption | undefined {
  const config = parseConfig(provider);
  const meta = PROVIDER_METAS[provider.type];
  const fromMeta = meta?.knownModelDetails?.[modelId];
  const fromConfig = config.model_options?.[modelId];
  const merged: Partial<ModelOption> = { ...fromMeta, ...fromConfig };
  return Object.keys(merged).length > 0 ? (merged as ModelOption) : undefined;
}

export function getModelsForProviders(providers: Provider[]): ModelInfo[] {
  const models: ModelInfo[] = [];
  for (const provider of providers) {
    if (!provider.enabled) continue;
    const meta = PROVIDER_METAS[provider.type];
    const config = parseConfig(provider);
    const modelIds = config.cached_models && config.cached_models.length > 0 ? config.cached_models : meta.knownModels;
    const disabled = new Set(config.disabled_models ?? []);
    for (const id of modelIds) {
      if (disabled.has(id)) continue;
      models.push({ id, name: id, provider_id: provider.id, provider_name: provider.name, provider_type: provider.type });
    }
  }
  return models;
}

/**
 * Verify credentials and fetch models. Errors propagate to the caller.
 * Moonshot 会额外返回 modelOptions（context_window、image_in），供表单合并到 config。
 */
export type VerifyAndFetchResult =
  | string[]
  | { modelIds: string[]; modelOptions: Record<string, Partial<ModelOption>> };

export async function verifyAndFetchModels(provider: Provider): Promise<VerifyAndFetchResult> {
  const meta = PROVIDER_METAS[provider.type];
  const baseUrl = provider.base_url || meta.defaultBaseUrl || "";

  if (meta.supportsModelFetch) {
    if (provider.type === "ollama") return await fetchOllamaModels(baseUrl || "http://localhost:11434");
    if (provider.type === "moonshot") return await fetchMoonshotModels(baseUrl, provider.api_key);
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
      const models = await fetchModels(provider);
      return { ok: true, models };
    }
    await verifyApiKey(provider);
    return { ok: true, models: meta.knownModels };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Connection failed" };
  }
}
