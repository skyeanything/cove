import { useState, useEffect, useRef } from "react";
import { useDataStore } from "@/stores/dataStore";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { PROVIDER_METAS } from "@/lib/ai/provider-meta";
import { verifyAndFetchModels } from "@/lib/ai/model-service";
import type { ProviderType, ProviderConfig, Provider } from "@/db/types";
import { Eye, EyeOff, Loader2, RefreshCw } from "lucide-react";
import { ProviderIcon } from "@/components/common/ProviderIcon";

interface ProviderFormProps {
  providerType: ProviderType;
}

export function ProviderForm({ providerType }: ProviderFormProps) {
  const providers = useDataStore((s) => s.providers);
  const createProvider = useDataStore((s) => s.createProvider);
  const updateProvider = useDataStore((s) => s.updateProvider);
  const toggleProvider = useDataStore((s) => s.toggleProvider);

  const meta = PROVIDER_METAS[providerType];
  const existing = providers.find((p) => p.type === providerType);

  const [apiKey, setApiKey] = useState("");
  const [baseUrl, setBaseUrl] = useState("");
  const [showKey, setShowKey] = useState(false);

  const [deployment, setDeployment] = useState("");
  const [apiVersion, setApiVersion] = useState("");
  const [awsRegion, setAwsRegion] = useState("");
  const [awsAccessKeyId, setAwsAccessKeyId] = useState("");
  const [awsSecretAccessKey, setAwsSecretAccessKey] = useState("");

  const [models, setModels] = useState<string[]>([]);
  const [modelsLoading, setModelsLoading] = useState(false);
  const [fetchError, setFetchError] = useState("");
  const [disabledModels, setDisabledModels] = useState<Set<string>>(new Set());

  const fetchTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  // Tracks whether the reset effect has run for the current providerType.
  // Prevents auto-fetch from firing with stale apiKey during the transient
  // render where providerType changed but form state hasn't reset yet.
  const resetDone = useRef(false);


  /* ---- reset form when provider switches ---- */

  useEffect(() => {
    resetDone.current = false;
    const p = useDataStore
      .getState()
      .providers.find((r) => r.type === providerType);

    setApiKey(p?.api_key ?? "");
    setBaseUrl(p?.base_url ?? "");
    setShowKey(false);
    setFetchError("");

    if (p?.config) {
      try {
        const cfg = JSON.parse(p.config) as ProviderConfig;
        setDeployment(cfg.deployment ?? "");
        setApiVersion(cfg.api_version ?? "");
        setAwsRegion(cfg.aws_region ?? "");
        setAwsAccessKeyId(cfg.aws_access_key_id ?? "");
        setAwsSecretAccessKey(cfg.aws_secret_access_key ?? "");
        setDisabledModels(new Set(cfg.disabled_models ?? []));
        setModels(cfg.cached_models ?? []);
      } catch {
        setDeployment("");
        setApiVersion("");
        setAwsRegion("");
        setAwsAccessKeyId("");
        setAwsSecretAccessKey("");
        setDisabledModels(new Set());
        setModels([]);
      }
    } else {
      setDeployment("");
      setApiVersion("");
      setAwsRegion("");
      setAwsAccessKeyId("");
      setAwsSecretAccessKey("");
      setDisabledModels(new Set());
      setModels([]);
    }
    resetDone.current = true;
  }, [providerType]);

  /* ---- save: optimistic store update + async DB write ---- */

  async function save(overrides: { disabledModels?: Set<string> } = {}) {
    const { providers: latest } = useDataStore.getState();
    const current = latest.find((p) => p.type === providerType);

    // Build config — merge with existing to keep cached_models etc.
    const existingCfg: ProviderConfig = current?.config
      ? (JSON.parse(current.config) as ProviderConfig)
      : {};
    const cfg: ProviderConfig = { ...existingCfg };

    if (providerType === "azure") {
      cfg.deployment = deployment;
      cfg.api_version = apiVersion;
    }
    if (providerType === "bedrock") {
      cfg.aws_region = awsRegion;
      cfg.aws_access_key_id = awsAccessKeyId;
      cfg.aws_secret_access_key = awsSecretAccessKey;
    }

    const dm = overrides.disabledModels ?? disabledModels;
    cfg.disabled_models = dm.size > 0 ? Array.from(dm) : undefined;

    const hasConfig = Object.values(cfg).some((v) =>
      Array.isArray(v) ? v.length > 0 : !!v,
    );
    const configStr = hasConfig ? JSON.stringify(cfg) : null;

    if (current) {
      // --- Update existing row ---
      const updated: Provider = {
        ...current,
        api_key: apiKey,
        base_url: baseUrl || meta.defaultBaseUrl || "",
        ...(hasConfig ? { config: configStr ?? undefined } : {}),
      };
      // 1) Optimistic: store 立即更新，切换 Provider 时读到最新值
      useDataStore.setState({
        providers: latest.map((p) => (p.id === current.id ? updated : p)),
      });
      // 2) Write DB — await to catch errors
      try {
        const dbData: Partial<Provider> = {
          api_key: apiKey,
          base_url: baseUrl || meta.defaultBaseUrl || "",
        };
        if (hasConfig) dbData.config = configStr ?? undefined;
        await updateProvider(current.id, dbData);
      } catch (err) {
        console.error("[ProviderForm] Failed to update provider:", err);
      }
    } else {
      // --- Create new row ---
      if (!apiKey && meta.requiresApiKey) return;

      const now = new Date().toISOString();
      const newRow: Provider = {
        id: crypto.randomUUID(),
        name: meta.displayName,
        type: providerType,
        api_key: apiKey,
        base_url: baseUrl || meta.defaultBaseUrl || "",
        config: configStr ?? undefined,
        enabled: 1,
        created_at: now,
        updated_at: now,
      };
      // 1) Optimistic: store 立即可见
      useDataStore.setState({ providers: [...latest, newRow] });
      // 2) Write DB — await to catch errors
      try {
        await createProvider({
          id: newRow.id,
          name: newRow.name,
          type: newRow.type,
          api_key: newRow.api_key,
          base_url: newRow.base_url,
          config: newRow.config,
          enabled: newRow.enabled,
        });
      } catch (err) {
        console.error("[ProviderForm] Failed to create provider:", err);
      }
    }
  }

  /* ---- auto-save + auto-fetch models ---- */

  useEffect(() => {
    let cancelled = false;
    const canFetch = meta.requiresApiKey ? !!apiKey : true;

    // Skip the transient render where providerType changed but
    // apiKey/baseUrl haven't been reset yet — avoids sending the
    // old provider's key to the new provider's endpoint.
    if (!resetDone.current) return;

    if (!canFetch) {
      setModels([]);
      setFetchError("");
      return;
    }

    if (fetchTimer.current) clearTimeout(fetchTimer.current);
    fetchTimer.current = setTimeout(async () => {
      // 1) Auto-save: persist provider to DB FIRST, so data survives
      //    even if the window is closed before blur fires.
      await save();
      if (cancelled) return;

      // 2) Then fetch/verify models
      setModelsLoading(true);
      setFetchError("");
      try {
        const tmp: Provider = {
          id: "",
          name: meta.displayName,
          type: providerType,
          api_key: apiKey || undefined,
          base_url: baseUrl || meta.defaultBaseUrl || undefined,
          enabled: 1,
          config: undefined,
          created_at: "",
          updated_at: "",
        };
        const fetched = await verifyAndFetchModels(tmp);
        if (cancelled) return;
        setModels(fetched);
        setFetchError("");

        // Persist cached models — row is guaranteed to exist after save()
        const row = useDataStore
          .getState()
          .providers.find((p) => p.type === providerType);
        if (row) {
          const c: ProviderConfig = row.config
            ? (JSON.parse(row.config) as ProviderConfig)
            : {};
          c.cached_models = fetched;
          c.cached_models_at = new Date().toISOString();
          await updateProvider(row.id, { config: JSON.stringify(c) });
        }
      } catch (e) {
        if (cancelled) return;
        setFetchError(
          e instanceof Error ? e.message : "Failed to fetch models",
        );
      } finally {
        if (!cancelled) setModelsLoading(false);
      }
    }, 1000);

    return () => {
      cancelled = true;
      if (fetchTimer.current) clearTimeout(fetchTimer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apiKey, baseUrl, providerType]);

  /* ---- manual refresh ---- */

  async function handleRefresh() {
    setModelsLoading(true);
    setFetchError("");
    try {
      const tmp: Provider = {
        id: "",
        name: meta.displayName,
        type: providerType,
        api_key: apiKey || undefined,
        base_url: baseUrl || meta.defaultBaseUrl || undefined,
        enabled: 1,
        config: undefined,
        created_at: "",
        updated_at: "",
      };
      const fetched = await verifyAndFetchModels(tmp);
      setModels(fetched);
      setFetchError("");

      const row = useDataStore
        .getState()
        .providers.find((p) => p.type === providerType);
      if (row) {
        const c: ProviderConfig = row.config
          ? (JSON.parse(row.config) as ProviderConfig)
          : {};
        c.cached_models = fetched;
        c.cached_models_at = new Date().toISOString();
        await updateProvider(row.id, { config: JSON.stringify(c) });
      }
    } catch (e) {
      setFetchError(e instanceof Error ? e.message : "Failed to fetch models");
    } finally {
      setModelsLoading(false);
    }
  }

  /* ---- model toggle ---- */

  function handleToggleModel(modelId: string, checked: boolean) {
    setDisabledModels((prev) => {
      const next = new Set(prev);
      if (checked) next.delete(modelId);
      else next.add(modelId);
      save({ disabledModels: next });
      return next;
    });
  }

  /* ---- derived ---- */

  const noKeyNeeded = !meta.requiresApiKey;
  const isConfigured = noKeyNeeded ? !!existing : !!apiKey;
  const statusLabel = isConfigured ? "Configured" : "Not configured";
  const statusVariant = isConfigured ? "secondary" : "outline";
  const enabledModelCount = models.filter((m) => !disabledModels.has(m)).length;

  /* ---- render ---- */

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between border-b px-5 py-3">
        <div className="flex items-center gap-2">
          <ProviderIcon type={providerType} className="size-5" />
          <h3 className="text-[15px] font-semibold">{meta.displayName}</h3>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant={statusVariant} className="text-[12px] font-normal">
            {statusLabel}
          </Badge>
          {existing && (
            <Switch
              size="sm"
              checked={!!existing.enabled}
              onCheckedChange={() => toggleProvider(existing.id)}
            />
          )}
        </div>
      </div>

      {/* Form */}
      <ScrollArea className="flex-1">
        <div className="flex flex-col gap-5 p-5">
          {/* API Key */}
          {meta.type !== "bedrock" && meta.type !== "ollama" && (
            <div className="flex flex-col gap-1.5">
              <Label className="text-[13px]">API Key</Label>
              <div className="relative">
                <Input
                  type={showKey ? "text" : "password"}
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  onBlur={() => save()}
                  placeholder="sk-..."
                  className="h-8 pr-8 text-sm"
                />
                <button
                  type="button"
                  onClick={() => setShowKey(!showKey)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 cursor-pointer text-muted-foreground hover:text-foreground"
                >
                  {showKey ? (
                    <EyeOff className="size-3.5" strokeWidth={1.5} />
                  ) : (
                    <Eye className="size-3.5" strokeWidth={1.5} />
                  )}
                </button>
              </div>
            </div>
          )}

          {/* Base URL */}
          <div className="flex flex-col gap-1.5">
            <Label className="text-[13px]">API Base URL</Label>
            <Input
              value={baseUrl}
              onChange={(e) => setBaseUrl(e.target.value)}
              onBlur={() => save()}
              placeholder={meta.defaultBaseUrl ?? "https://api.example.com"}
              className="h-8 text-sm"
            />
          </div>

          {/* Extra fields */}
          {meta.fields.map((field) => {
            let value = "";
            let handleChange: (v: string) => void = () => {};

            switch (field.key) {
              case "deployment":
                value = deployment;
                handleChange = setDeployment;
                break;
              case "api_version":
                value = apiVersion;
                handleChange = setApiVersion;
                break;
              case "aws_region":
                value = awsRegion;
                handleChange = setAwsRegion;
                break;
              case "aws_access_key_id":
                value = awsAccessKeyId;
                handleChange = setAwsAccessKeyId;
                break;
              case "aws_secret_access_key":
                value = awsSecretAccessKey;
                handleChange = setAwsSecretAccessKey;
                break;
            }

            return (
              <div key={field.key} className="flex flex-col gap-1.5">
                <Label className="text-[13px]">{field.label}</Label>
                <Input
                  type={field.type === "password" ? "password" : "text"}
                  value={value}
                  onChange={(e) => handleChange(e.target.value)}
                  onBlur={() => save()}
                  placeholder={field.placeholder}
                  className="h-8 text-sm"
                />
              </div>
            );
          })}

          {/* Models section */}
          {isConfigured && (
            <div className="flex flex-col gap-2">
              {modelsLoading && models.length === 0 && (
                <div className="flex items-center gap-2 py-2 text-[13px] text-muted-foreground">
                  <Loader2 className="size-3.5 animate-spin" strokeWidth={1.5} />
                  Fetching models...
                </div>
              )}

              {fetchError && !modelsLoading && models.length === 0 && (
                <p className="text-[13px] text-destructive">{fetchError}</p>
              )}

              {models.length > 0 && (
                <>
                  <div className="flex items-center justify-between">
                    <Label className="text-[13px]">
                      Models ({enabledModelCount}/{models.length})
                    </Label>
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={modelsLoading}
                      onClick={handleRefresh}
                      className="h-6 w-6 p-0 cursor-pointer"
                    >
                      <RefreshCw
                        className={`size-3.5 ${modelsLoading ? "animate-spin" : ""}`}
                        strokeWidth={1.5}
                      />
                    </Button>
                  </div>
                  <div className="flex flex-col gap-0.5">
                    {models.map((modelId) => (
                      <label
                        key={modelId}
                        className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-accent/5 cursor-pointer"
                      >
                        <Checkbox
                          checked={!disabledModels.has(modelId)}
                          onCheckedChange={(checked) =>
                            handleToggleModel(modelId, !!checked)
                          }
                        />
                        <span className="truncate">{modelId}</span>
                      </label>
                    ))}
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
