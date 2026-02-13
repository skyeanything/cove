import { useState, useEffect, useRef } from "react";
import { useDataStore } from "@/stores/dataStore";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { PROVIDER_METAS } from "@/lib/ai/provider-meta";
import { verifyAndFetchModels, testConnection, type VerifyAndFetchResult } from "@/lib/ai/model-service";
import type { ProviderType, ProviderConfig, Provider, ModelOption } from "@/db/types";
import { useTranslation } from "react-i18next";
import { Eye, EyeOff, Loader2, Download, Settings2, Zap, Check, X, Wrench, Brain, Image, ImagePlus, Database } from "lucide-react";
import { ProviderIcon } from "@/components/common/ProviderIcon";
import { ModelOptionsForm } from "./ModelOptionsForm";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { emit } from "@tauri-apps/api/event";

interface ProviderFormProps {
  providerType: ProviderType;
}

export function ProviderForm({ providerType }: ProviderFormProps) {
  const { t } = useTranslation();
  const providers = useDataStore((s) => s.providers);
  const createProvider = useDataStore((s) => s.createProvider);
  const updateProvider = useDataStore((s) => s.updateProvider);
  const toggleProvider = useDataStore((s) => s.toggleProvider);

  const meta = PROVIDER_METAS[providerType];
  const descriptionText = meta.descriptionKey
    ? t(meta.descriptionKey)
    : meta.description ?? "";
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
  const [modelSearch, setModelSearch] = useState("");
  const [modelOptionsOpen, setModelOptionsOpen] = useState(false);
  const [modelOptionsModelId, setModelOptionsModelId] = useState<string | null>(null);
  const [testingModelId, setTestingModelId] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<{ modelId: string; ok: boolean; error?: string } | null>(null);

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
    setModelSearch("");
    setTestingModelId(null);
    setTestResult(null);
  }, [providerType]);

  /* ---- 单模型行：点击闪电测试该 provider 连通性 ---- */
  async function handleTestModel(modelId: string) {
    if (!existing) return;
    setTestingModelId(modelId);
    setTestResult(null);
    try {
      const result = await testConnection(existing);
      setTestResult({ modelId, ok: result.ok, error: result.error });
    } catch (e) {
      setTestResult({
        modelId,
        ok: false,
        error: e instanceof Error ? e.message : "Connection failed",
      });
    } finally {
      setTestingModelId(null);
    }
  }

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

  /* ---- 防抖保存：API Key / Base URL 变更后写库，不自动拉取模型 ---- */
  useEffect(() => {
    if (!resetDone.current) return;
    const t = setTimeout(() => save(), 800);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apiKey, baseUrl, providerType]);

  /* ---- 显式 Fetch 获取模型 ---- */
  async function handleFetchModels() {
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
      const raw: VerifyAndFetchResult = await verifyAndFetchModels(tmp);
      const fetched = Array.isArray(raw) ? raw : raw.modelIds;
      const modelOptions = Array.isArray(raw) ? undefined : raw.modelOptions;
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

  /* ---- render ---- */

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      {/* Header：名称 + Active 徽章 + 描述，右侧为 Switch */}
      <div className="flex flex-col gap-2 border-b px-5 py-3">
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 flex-1 items-start gap-2">
            <ProviderIcon type={providerType} className="size-5 shrink-0 mt-0.5" />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="text-[15px] font-semibold">{meta.displayName}</h3>
                {existing?.enabled ? (
                  <Badge className="rounded-[4px] border-0 bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 dark:bg-emerald-500/20 text-[10px] font-normal px-1 py-0.5 leading-tight">
                    {t("provider.form.active")}
                  </Badge>
                ) : null}
              </div>
              {descriptionText && (
                <p className="mt-0.5 truncate text-[12px] text-muted-foreground">
                  {descriptionText}
                </p>
              )}
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {existing && (
              <Switch
                size="sm"
                checked={!!existing.enabled}
                onCheckedChange={async () => {
                  const wasEnabled = !!existing.enabled;
                  await toggleProvider(existing.id);
                  if (wasEnabled) {
                    await emit("provider-disabled", { providerId: existing.id });
                  }
                }}
              />
            )}
          </div>
        </div>
      </div>

      {/* Form */}
      <ScrollArea className="flex-1">
        <div className="flex flex-col gap-5 p-5">
          {/* API Key */}
          {meta.type !== "bedrock" && meta.type !== "ollama" && (
            <div className="flex flex-col gap-1.5">
              <Label className="text-[13px]">{t("provider.form.apiKey")}</Label>
              <div className="relative">
                <Input
                  type={showKey ? "text" : "password"}
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  onBlur={() => save()}
                  placeholder={t("provider.form.apiKeyPlaceholder")}
                  className="h-[2.4rem] rounded-[4px] pr-8 text-sm"
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

          {/* Base URL：下拉（如 Moonshot 区域）或手动输入 */}
          {meta.requiresBaseUrl && (
            <div className="flex flex-col gap-1.5">
              <Label className="text-[13px]">
                {meta.baseUrlOptions?.length
                  ? t("provider.form.region")
                  : t("provider.form.apiBaseUrl")}
              </Label>
              {meta.baseUrlOptions?.length ? (
                <Select
                  value={(baseUrl || meta.defaultBaseUrl) ?? ""}
                  onValueChange={(v) => setBaseUrl(v)}
                >
                  <SelectTrigger className="h-[2.4rem] w-full rounded-[4px] text-sm">
                    <SelectValue placeholder={t("provider.form.selectRegion")} />
                  </SelectTrigger>
                  <SelectContent>
                    {meta.baseUrlOptions.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <Input
                  value={baseUrl}
                  onChange={(e) => setBaseUrl(e.target.value)}
                  onBlur={() => save()}
                  placeholder={meta.defaultBaseUrl ?? "https://api.example.com"}
                  className="h-[2.4rem] rounded-[4px] text-sm"
                />
              )}
            </div>
          )}

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
                  className="h-[2.4rem] rounded-[4px] text-sm"
                />
              </div>
            );
          })}

          {/* Models section */}
          {isConfigured && (
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between gap-2 pb-3">
                <Label className="text-[13px]">{t("provider.form.models")}</Label>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={modelsLoading}
                  onClick={handleFetchModels}
                  className="h-8 cursor-pointer gap-1.5 rounded-[4px]"
                >
                  {modelsLoading ? (
                    <Loader2 className="size-3.5 animate-spin" strokeWidth={1.5} />
                  ) : (
                    <Download className="size-3.5" strokeWidth={1.5} />
                  )}
                  {t("provider.form.fetch")}
                </Button>
              </div>
              {modelsLoading && models.length === 0 && (
                <div className="flex items-center gap-2 py-2 text-[13px] text-muted-foreground">
                  <Loader2 className="size-3.5 animate-spin" strokeWidth={1.5} />
                  {t("provider.form.fetchingModels")}
                </div>
              )}
              {fetchError && !modelsLoading && models.length === 0 && (
                <p className="text-[13px] text-destructive">{fetchError}</p>
              )}
              {models.length > 0 && (
                <>
                  <Input
                    placeholder={t("provider.form.searchModels")}
                    value={modelSearch}
                    onChange={(e) => setModelSearch(e.target.value)}
                    className="h-[2.4rem] rounded-[4px] text-sm"
                  />
                  <p className="text-[12px] text-muted-foreground">
                    {t("provider.form.showingModels", { count: models.length })}
                  </p>
                  <div className="h-[260px] rounded-[4px] overflow-hidden flex">
                    <ScrollArea
                      className="h-full flex-1 min-w-0"
                      viewportClassName="border border-border rounded-l-[4px]"
                    >
                      <div className="flex flex-col">
                    {(() => {
                      const filtered = modelSearch.trim()
                        ? models.filter((m) =>
                            m.toLowerCase().includes(modelSearch.trim().toLowerCase()),
                          )
                        : models;
                      const sorted = [...filtered].sort((a, b) => {
                        const aEnabled = !disabledModels.has(a);
                        const bEnabled = !disabledModels.has(b);
                        if (aEnabled !== bEnabled) return aEnabled ? -1 : 1;
                        return 0;
                      });
                      const config: ProviderConfig = existing?.config
                        ? (() => {
                            try {
                              return JSON.parse(existing.config) as ProviderConfig;
                            } catch {
                              return {};
                            }
                          })()
                        : {};
                      const capabilityIcons: {
                        key: keyof Pick<ModelOption, "vision" | "image_in" | "image_output" | "tool_calling" | "reasoning" | "embedding">;
                        Icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
                      }[] = [
                        { key: "vision", Icon: Eye },
                        { key: "image_in", Icon: ImagePlus },
                        { key: "image_output", Icon: Image },
                        { key: "tool_calling", Icon: Wrench },
                        { key: "reasoning", Icon: Brain },
                        { key: "embedding", Icon: Database },
                      ];
                      return sorted.map((modelId) => {
                        const isTesting = testingModelId === modelId;
                        const result = testResult?.modelId === modelId ? testResult : null;
                        const details: Partial<ModelOption> = { ...meta.knownModelDetails?.[modelId], ...config.model_options?.[modelId] };
                        const ctx = details?.context_window;
                        const contextLabel = ctx != null ? (ctx >= 1000 ? `${ctx / 1000}K` : String(ctx)) : null;
                        return (
                          <div
                            key={modelId}
                            className="flex items-center gap-3 border-b border-border px-3 py-2.5 text-sm last:border-b-0 hover:bg-accent/5"
                          >
                            <div className="min-w-0 flex-1">
                              <div className="font-medium truncate">{modelId}</div>
                              <div className="mt-1 flex items-center gap-1.5 text-[10px] text-muted-foreground">
                                <TooltipProvider delayDuration={200}>
                                  {capabilityIcons.map(
                                    ({ key, Icon }) =>
                                      details[key] && (
                                        <Tooltip key={key}>
                                          <TooltipTrigger asChild>
                                            <span className="inline-flex cursor-default items-center">
                                              <Icon className="size-3 shrink-0" strokeWidth={1.5} />
                                            </span>
                                          </TooltipTrigger>
                                          <TooltipContent side="top" sideOffset={4}>
                                            {t(`provider.capability.${key}`)}
                                          </TooltipContent>
                                        </Tooltip>
                                      ),
                                  )}
                                </TooltipProvider>
                                {contextLabel != null && <span>{contextLabel}</span>}
                              </div>
                            </div>
                            <Button
                              variant="ghost"
                              size="icon-sm"
                              className="size-7 shrink-0 cursor-pointer"
                              onClick={() => handleTestModel(modelId)}
                              disabled={isTesting || !existing}
                              title={t("provider.form.testConnection")}
                            >
                              {isTesting ? (
                                <Loader2 className="size-3.5 animate-spin" strokeWidth={1.5} />
                              ) : result ? (
                                result.ok ? (
                                  <Check className="size-3.5 text-success" strokeWidth={1.5} />
                                ) : (
                                  <X className="size-3.5 text-destructive" strokeWidth={1.5} />
                                )
                              ) : (
                                <Zap className="size-3.5" strokeWidth={1.5} />
                              )}
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon-sm"
                              className="size-7 shrink-0 cursor-pointer"
                              onClick={() => {
                                setModelOptionsModelId(modelId);
                                setModelOptionsOpen(true);
                              }}
                              title={t("provider.form.modelOptionsButton")}
                            >
                              <Settings2 className="size-3.5" strokeWidth={1.5} />
                            </Button>
                            <Switch
                            size="sm"
                            checked={!disabledModels.has(modelId)}
                            onCheckedChange={(checked) =>
                              handleToggleModel(modelId, !!checked)
                            }
                          />
                        </div>
                        );
                      });
                    })()}
                      </div>
                    </ScrollArea>
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      </ScrollArea>
      {existing && (
        <ModelOptionsForm
          open={modelOptionsOpen}
          onOpenChange={setModelOptionsOpen}
          providerId={existing.id}
          providerType={providerType}
          modelId={modelOptionsModelId}
        />
      )}
    </div>
  );
}
