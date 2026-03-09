import { useDataStore } from "@/stores/dataStore";
import { verifyApiKey } from "@/lib/ai/model-verify";
import { emit } from "@tauri-apps/api/event";
import {
  getModelOption,
  verifyAndFetchModels,
} from "@/lib/ai/model-service";
import { getModel } from "@/lib/ai/provider-factory";
import { generateText, tool as aiTool } from "ai";
import { z } from "zod/v4";
import type { Provider, ProviderConfig, ModelOption } from "@/db/types";
import { parseBool } from "./settings-handlers";

export interface ProviderInput {
  action: string;
  key?: string;
  value?: string;
  provider_type?: string;
  model_id?: string;
}

function parseConfig(provider: Provider): ProviderConfig {
  if (!provider.config) return {};
  try {
    return JSON.parse(provider.config) as ProviderConfig;
  } catch {
    return {};
  }
}

function maskApiKey(k: string | undefined): string {
  return !k
    ? "(not set)"
    : k.length <= 8
      ? "****"
      : `${k.slice(0, 4)}...${k.slice(-4)}`;
}

function formatCapabilities(opt: ModelOption | undefined): string {
  if (!opt) return "";
  const parts: string[] = [];
  if (opt.tool_calling != null)
    parts.push(`tool_calling=${opt.tool_calling}`);
  if (opt.vision != null) parts.push(`vision=${opt.vision}`);
  if (opt.image_in != null) parts.push(`image_in=${opt.image_in}`);
  if (opt.reasoning != null) parts.push(`reasoning=${opt.reasoning}`);
  if (opt.context_window != null)
    parts.push(`context_window=${opt.context_window}`);
  return parts.join(", ");
}

export async function handleProvider(input: ProviderInput): Promise<string> {
  const providers = useDataStore.getState().providers;

  if (input.action === "list" || (input.action === "get" && !input.key)) {
    if (providers.length === 0) return "No providers configured.";
    const lines = providers.map(
      (p) =>
        `- ${p.name} (type: ${p.type}, enabled: ${!!p.enabled}, api_key: ${maskApiKey(p.api_key)})`,
    );
    return `Providers:\n${lines.join("\n")}`;
  }

  const provider = input.provider_type
    ? providers.find((p) => p.type === input.provider_type)
    : null;

  if (input.action === "validate") {
    if (!provider) {
      return `Provider not found: ${input.provider_type}. Available: ${providers.map((p) => p.type).join(", ")}`;
    }
    return handleValidate(provider);
  }

  if (input.action === "fetch_models") {
    if (!provider) {
      return `Provider not found: ${input.provider_type}. Available: ${providers.map((p) => p.type).join(", ")}`;
    }
    return handleFetchModels(provider);
  }

  if (input.action === "probe") {
    if (!provider) {
      return `Provider not found: ${input.provider_type}. Available: ${providers.map((p) => p.type).join(", ")}`;
    }
    if (!input.model_id) return "model_id is required for probe action.";
    return handleProbe(provider, input.model_id);
  }

  if (input.action === "get") {
    if (!provider) {
      return `Provider not found: ${input.provider_type}. Available: ${providers.map((p) => p.type).join(", ")}`;
    }
    if (!input.key)
      return `${provider.name}: type=${provider.type}, enabled=${!!provider.enabled}, api_key=${maskApiKey(provider.api_key)}`;
    if (input.key === "enabled") return `enabled: ${!!provider.enabled}`;
    if (input.key === "api_key")
      return `api_key: ${maskApiKey(provider.api_key)}`;
    if (input.key === "base_url")
      return `base_url: ${provider.base_url ?? "(default)"}`;
    return `Unknown key: ${input.key}`;
  }

  if (input.action === "set") {
    if (!provider) {
      return `Provider not found: ${input.provider_type}. Available: ${providers.map((p) => p.type).join(", ")}`;
    }
    return handleSet(provider, input);
  }

  return `Unknown action: ${input.action}`;
}

async function handleSet(
  provider: Provider,
  input: ProviderInput,
): Promise<string> {
  if (input.key === "enabled") {
    const enabled = parseBool(input.value ?? "");
    if (enabled === null) return `Invalid boolean: ${input.value}`;
    await useDataStore
      .getState()
      .updateProvider(provider.id, { enabled: enabled ? 1 : 0 });
    if (!enabled)
      await emit("provider-disabled", { providerId: provider.id });
    return `Provider ${provider.name} ${enabled ? "enabled" : "disabled"}.`;
  }
  if (input.key === "api_key") {
    if (!input.value) return "API key value is required.";
    try {
      await verifyApiKey({ ...provider, api_key: input.value });
    } catch (err) {
      return `API key verification failed: ${err instanceof Error ? err.message : String(err)}`;
    }
    await useDataStore
      .getState()
      .updateProvider(provider.id, { api_key: input.value });
    return `API key updated for ${provider.name}.`;
  }
  if (input.key === "base_url") {
    await useDataStore
      .getState()
      .updateProvider(provider.id, { base_url: input.value ?? "" });
    return `Base URL updated for ${provider.name}.`;
  }
  return `Unknown key: ${input.key}`;
}

async function handleValidate(provider: Provider): Promise<string> {
  try {
    const result = await verifyAndFetchModels(provider);
    const models = Array.isArray(result) ? result : result.modelIds;
    const lines = models.map((m) => {
      const opt = getModelOption(provider, m);
      const caps = formatCapabilities(opt);
      return `- ${m}${caps ? `: ${caps}` : ""}`;
    });

    return [
      `Provider ${provider.name}: connection OK`,
      `Available models (${models.length}):`,
      ...lines,
    ].join("\n");
  } catch (e) {
    return `Provider ${provider.name}: connection FAILED — ${e instanceof Error ? e.message : String(e)}`;
  }
}

async function handleFetchModels(provider: Provider): Promise<string> {
  const result = await verifyAndFetchModels(provider);
  const modelIds = Array.isArray(result) ? result : result.modelIds;

  const config = parseConfig(provider);
  config.cached_models = modelIds;
  config.cached_models_at = new Date().toISOString();
  if (!Array.isArray(result) && result.modelOptions) {
    config.model_options = { ...config.model_options, ...result.modelOptions };
  }
  await useDataStore
    .getState()
    .updateProvider(provider.id, { config: JSON.stringify(config) });

  return `Fetched ${modelIds.length} models for ${provider.name}:\n${modelIds.map((m) => `- ${m}`).join("\n")}`;
}

async function handleProbe(
  provider: Provider,
  modelId: string,
): Promise<string> {
  const model = getModel(provider, modelId);
  const detected: Partial<ModelOption> = {};

  try {
    const result = await generateText({
      model,
      messages: [
        {
          role: "user",
          content: "Call the ping tool with msg 'ok'. Do not reply with text.",
        },
      ],
      maxOutputTokens: 64,
      toolChoice: "required",
      tools: {
        ping: aiTool({
          description: "Respond with a message",
          inputSchema: z.object({ msg: z.string() }),
        }),
      },
    });
    detected.tool_calling = result.toolCalls && result.toolCalls.length > 0;
    if (result.reasoning) detected.reasoning = true;
  } catch {
    detected.tool_calling = false;
    try {
      const result = await generateText({
        model,
        messages: [
          { role: "user", content: "Reply with the single word 'ok'." },
        ],
        maxOutputTokens: 16,
      });
      if (result.reasoning) detected.reasoning = true;
    } catch (e) {
      return `Model ${modelId}: unreachable — ${e instanceof Error ? e.message : String(e)}`;
    }
  }

  const config = parseConfig(provider);
  config.model_options = {
    ...config.model_options,
    [modelId]: { ...config.model_options?.[modelId], ...detected },
  };
  await useDataStore
    .getState()
    .updateProvider(provider.id, { config: JSON.stringify(config) });

  const caps = Object.entries(detected)
    .map(([k, v]) => `${k}: ${v ? "supported" : "not supported"}`)
    .join(", ");
  return `Model ${modelId} probe results: ${caps}\nCapabilities saved.`;
}
