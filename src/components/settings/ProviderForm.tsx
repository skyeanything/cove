import { useState, useEffect, useRef } from "react";
import { useDataStore } from "@/stores/dataStore";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { PROVIDER_METAS } from "@/lib/ai/provider-meta";
import type { ProviderType, ProviderConfig } from "@/db/types";
import { useTranslation } from "react-i18next";
import { Eye, EyeOff } from "lucide-react";
import { ProviderIcon } from "@/components/common/ProviderIcon";
import { ModelOptionsForm } from "./ModelOptionsForm";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { emit } from "@tauri-apps/api/event";
import { ProviderModelList } from "./ProviderModelList";
import {
  useProviderSave, useProviderDebounce, fetchProviderModels, testProviderModel,
} from "@/hooks/useProviderForm";

interface ProviderFormProps {
  providerType: ProviderType;
}

export function ProviderForm({ providerType }: ProviderFormProps) {
  const { t } = useTranslation();
  const providers = useDataStore((s) => s.providers);
  const toggleProvider = useDataStore((s) => s.toggleProvider);
  const updateProvider = useDataStore((s) => s.updateProvider);

  const meta = PROVIDER_METAS[providerType];
  const descriptionText = meta.descriptionKey ? t(meta.descriptionKey) : meta.description ?? "";
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

  const { save } = useProviderSave({
    providerType, apiKey, baseUrl, deployment, apiVersion,
    awsRegion, awsAccessKeyId, awsSecretAccessKey, disabledModels,
  });

  /* ---- reset form when provider switches ---- */
  useEffect(() => {
    resetDone.current = false;
    const p = useDataStore.getState().providers.find((r) => r.type === providerType);
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
        setDeployment(""); setApiVersion(""); setAwsRegion("");
        setAwsAccessKeyId(""); setAwsSecretAccessKey("");
        setDisabledModels(new Set()); setModels([]);
      }
    } else {
      setDeployment(""); setApiVersion(""); setAwsRegion("");
      setAwsAccessKeyId(""); setAwsSecretAccessKey("");
      setDisabledModels(new Set()); setModels([]);
    }
    resetDone.current = true;
    setModelSearch("");
    setTestingModelId(null);
    setTestResult(null);
  }, [providerType]);

  useProviderDebounce(() => void save(), resetDone, [apiKey, baseUrl, providerType]);

  async function handleFetchModels() {
    await fetchProviderModels(providerType, apiKey, baseUrl, updateProvider,
      setModels, setFetchError, setModelsLoading);
  }

  function handleToggleModel(modelId: string, checked: boolean) {
    setDisabledModels((prev) => {
      const next = new Set(prev);
      if (checked) next.delete(modelId); else next.add(modelId);
      save({ disabledModels: next });
      return next;
    });
  }

  async function handleTestModel(modelId: string) {
    await testProviderModel(modelId, existing, setTestingModelId, setTestResult);
  }

  const noKeyNeeded = !meta.requiresApiKey;
  const isConfigured = noKeyNeeded ? !!existing : !!apiKey;

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      {/* Header */}
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
                <p className="mt-0.5 truncate text-[12px] text-muted-foreground">{descriptionText}</p>
              )}
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {existing && (
              <Switch size="sm" checked={!!existing.enabled} onCheckedChange={async () => {
                const wasEnabled = !!existing.enabled;
                await toggleProvider(existing.id);
                if (wasEnabled) await emit("provider-disabled", { providerId: existing.id });
              }} />
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
                <Input type={showKey ? "text" : "password"} value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)} onBlur={() => void save()}
                  placeholder={t("provider.form.apiKeyPlaceholder")}
                  className="h-[2.4rem] rounded-[4px] pr-8 text-sm" />
                <button type="button" onClick={() => setShowKey(!showKey)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 cursor-pointer text-muted-foreground hover:text-foreground">
                  {showKey ? <EyeOff className="size-3.5" strokeWidth={1.5} /> : <Eye className="size-3.5" strokeWidth={1.5} />}
                </button>
              </div>
            </div>
          )}

          {/* Base URL */}
          {meta.requiresBaseUrl && (
            <div className="flex flex-col gap-1.5">
              <Label className="text-[13px]">
                {meta.baseUrlOptions?.length ? t("provider.form.region") : t("provider.form.apiBaseUrl")}
              </Label>
              {meta.baseUrlOptions?.length ? (
                <Select value={(baseUrl || meta.defaultBaseUrl) ?? ""} onValueChange={(v) => setBaseUrl(v)}>
                  <SelectTrigger className="h-[2.4rem] w-full rounded-[4px] text-sm">
                    <SelectValue placeholder={t("provider.form.selectRegion")} />
                  </SelectTrigger>
                  <SelectContent>
                    {meta.baseUrlOptions.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <Input value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)}
                  onBlur={() => void save()} placeholder={meta.defaultBaseUrl ?? "https://api.example.com"}
                  className="h-[2.4rem] rounded-[4px] text-sm" />
              )}
            </div>
          )}

          {/* Extra fields */}
          {meta.fields.map((field) => {
            const fieldMap: Record<string, [string, (v: string) => void]> = {
              deployment: [deployment, setDeployment],
              api_version: [apiVersion, setApiVersion],
              aws_region: [awsRegion, setAwsRegion],
              aws_access_key_id: [awsAccessKeyId, setAwsAccessKeyId],
              aws_secret_access_key: [awsSecretAccessKey, setAwsSecretAccessKey],
            };
            const [value, handleChange] = fieldMap[field.key] ?? ["", () => {}];
            return (
              <div key={field.key} className="flex flex-col gap-1.5">
                <Label className="text-[13px]">{field.label}</Label>
                <Input type={field.type === "password" ? "password" : "text"} value={value}
                  onChange={(e) => handleChange(e.target.value)} onBlur={() => void save()}
                  placeholder={field.placeholder} className="h-[2.4rem] rounded-[4px] text-sm" />
              </div>
            );
          })}

          {/* Models section */}
          {isConfigured && (
            <ProviderModelList models={models} modelsLoading={modelsLoading} fetchError={fetchError}
              modelSearch={modelSearch} disabledModels={disabledModels} existing={existing}
              testingModelId={testingModelId} testResult={testResult} providerType={providerType}
              onFetchModels={handleFetchModels} onModelSearchChange={setModelSearch}
              onTestModel={handleTestModel} onToggleModel={handleToggleModel}
              onModelOptionsOpen={(modelId) => { setModelOptionsModelId(modelId); setModelOptionsOpen(true); }}
            />
          )}
        </div>
      </ScrollArea>
      {existing && (
        <ModelOptionsForm open={modelOptionsOpen} onOpenChange={setModelOptionsOpen}
          providerId={existing.id} providerType={providerType} modelId={modelOptionsModelId} />
      )}
    </div>
  );
}
