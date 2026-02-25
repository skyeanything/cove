import { useEffect } from "react";
import { useDataStore } from "@/stores/dataStore";
import { verifyAndFetchModels, testConnection, type VerifyAndFetchResult } from "@/lib/ai/model-service";
import type { ProviderType, ProviderConfig, Provider } from "@/db/types";
import { PROVIDER_METAS } from "@/lib/ai/provider-meta";

interface SaveParams {
  providerType: ProviderType;
  apiKey: string;
  baseUrl: string;
  deployment: string;
  apiVersion: string;
  awsRegion: string;
  awsAccessKeyId: string;
  awsSecretAccessKey: string;
  disabledModels: Set<string>;
}

export function useProviderSave(params: SaveParams) {
  const { providerType, apiKey, baseUrl, deployment, apiVersion,
    awsRegion, awsAccessKeyId, awsSecretAccessKey } = params;
  const meta = PROVIDER_METAS[providerType];
  const updateProvider = useDataStore((s) => s.updateProvider);
  const createProvider = useDataStore((s) => s.createProvider);

  async function save(overrides: { disabledModels?: Set<string> } = {}) {
    const { providers: latest } = useDataStore.getState();
    const current = latest.find((p) => p.type === providerType);

    const existingCfg: ProviderConfig = current?.config
      ? (JSON.parse(current.config) as ProviderConfig) : {};
    const cfg: ProviderConfig = { ...existingCfg };

    if (providerType === "azure") { cfg.deployment = deployment; cfg.api_version = apiVersion; }
    if (providerType === "bedrock") {
      cfg.aws_region = awsRegion;
      cfg.aws_access_key_id = awsAccessKeyId;
      cfg.aws_secret_access_key = awsSecretAccessKey;
    }

    const dm = overrides.disabledModels ?? params.disabledModels;
    cfg.disabled_models = dm.size > 0 ? Array.from(dm) : undefined;

    const hasConfig = Object.values(cfg).some((v) => Array.isArray(v) ? v.length > 0 : !!v);
    const configStr = hasConfig ? JSON.stringify(cfg) : null;

    if (current) {
      const updated: Provider = {
        ...current, api_key: apiKey,
        base_url: baseUrl || meta.defaultBaseUrl || "",
        ...(hasConfig ? { config: configStr ?? undefined } : {}),
      };
      useDataStore.setState({ providers: latest.map((p) => (p.id === current.id ? updated : p)) });
      try {
        const dbData: Partial<Provider> = { api_key: apiKey, base_url: baseUrl || meta.defaultBaseUrl || "" };
        if (hasConfig) dbData.config = configStr ?? undefined;
        await updateProvider(current.id, dbData);
      } catch (err) { console.error("[ProviderForm] Failed to update provider:", err); }
    } else {
      if (!apiKey && meta.requiresApiKey) return;
      const now = new Date().toISOString();
      const newRow: Provider = {
        id: crypto.randomUUID(), name: meta.displayName, type: providerType,
        api_key: apiKey, base_url: baseUrl || meta.defaultBaseUrl || "",
        config: configStr ?? undefined, enabled: 1, created_at: now, updated_at: now,
      };
      useDataStore.setState({ providers: [...latest, newRow] });
      try {
        await createProvider({
          id: newRow.id, name: newRow.name, type: newRow.type, api_key: newRow.api_key,
          base_url: newRow.base_url, config: newRow.config, enabled: newRow.enabled,
        });
      } catch (err) { console.error("[ProviderForm] Failed to create provider:", err); }
    }
  }

  return { save };
}

export function useProviderDebounce(
  save: () => void,
  resetDone: React.RefObject<boolean>,
  deps: unknown[],
) {
  useEffect(() => {
    if (!resetDone.current) return;
    const timer = setTimeout(() => save(), 800);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}

export async function fetchProviderModels(
  providerType: ProviderType,
  apiKey: string,
  baseUrl: string,
  updateProvider: (id: string, data: Partial<Provider>) => Promise<void>,
  setModels: (m: string[]) => void,
  setFetchError: (e: string) => void,
  setModelsLoading: (v: boolean) => void,
) {
  const meta = PROVIDER_METAS[providerType];
  setModelsLoading(true);
  setFetchError("");
  try {
    const tmp: Provider = {
      id: "", name: meta.displayName, type: providerType,
      api_key: apiKey || undefined, base_url: baseUrl || meta.defaultBaseUrl || undefined,
      enabled: 1, config: undefined, created_at: "", updated_at: "",
    };
    const raw: VerifyAndFetchResult = await verifyAndFetchModels(tmp);
    const fetched = Array.isArray(raw) ? raw : raw.modelIds;
    const modelOptions = Array.isArray(raw) ? undefined : raw.modelOptions;
    setModels(fetched);
    setFetchError("");
    const row = useDataStore.getState().providers.find((p) => p.type === providerType);
    if (row) {
      const c: ProviderConfig = row.config ? (JSON.parse(row.config) as ProviderConfig) : {};
      c.cached_models = fetched;
      c.cached_models_at = new Date().toISOString();
      if (modelOptions && Object.keys(modelOptions).length > 0) {
        c.model_options = { ...c.model_options, ...modelOptions };
      }
      await updateProvider(row.id, { config: JSON.stringify(c) });
    }
  } catch (e) {
    setFetchError(e instanceof Error ? e.message : "Failed to fetch models");
  } finally {
    setModelsLoading(false);
  }
}

export async function testProviderModel(
  modelId: string,
  existing: Provider | undefined,
  setTestingModelId: (id: string | null) => void,
  setTestResult: (r: { modelId: string; ok: boolean; error?: string } | null) => void,
) {
  if (!existing) return;
  setTestingModelId(modelId);
  setTestResult(null);
  try {
    const result = await testConnection(existing);
    setTestResult({ modelId, ok: result.ok, error: result.error });
  } catch (e) {
    setTestResult({ modelId, ok: false, error: e instanceof Error ? e.message : "Connection failed" });
  } finally {
    setTestingModelId(null);
  }
}
