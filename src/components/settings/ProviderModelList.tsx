import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Eye, Loader2, Download, Settings2, Zap, Check, X, Wrench, Brain, Image, ImagePlus, Database } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import type { ModelOption, ProviderConfig, Provider, ProviderType } from "@/db/types";
import { useTranslation } from "react-i18next";
import { PROVIDER_METAS } from "@/lib/ai/provider-meta";

interface ProviderModelListProps {
  models: string[];
  modelsLoading: boolean;
  fetchError: string;
  modelSearch: string;
  disabledModels: Set<string>;
  existing: Provider | undefined;
  testingModelId: string | null;
  testResult: { modelId: string; ok: boolean; error?: string } | null;
  providerType: ProviderType;
  onFetchModels: () => void;
  onModelSearchChange: (value: string) => void;
  onTestModel: (modelId: string) => void;
  onToggleModel: (modelId: string, checked: boolean) => void;
  onModelOptionsOpen: (modelId: string) => void;
}

export function ProviderModelList({
  models,
  modelsLoading,
  fetchError,
  modelSearch,
  disabledModels,
  existing,
  testingModelId,
  testResult,
  providerType,
  onFetchModels,
  onModelSearchChange,
  onTestModel,
  onToggleModel,
  onModelOptionsOpen,
}: ProviderModelListProps) {
  const { t } = useTranslation();
  const meta = PROVIDER_METAS[providerType];

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

  const config: ProviderConfig = existing?.config
    ? (() => {
        try {
          return JSON.parse(existing.config) as ProviderConfig;
        } catch {
          return {};
        }
      })()
    : {};

  const filtered = modelSearch.trim()
    ? models.filter((m) => m.toLowerCase().includes(modelSearch.trim().toLowerCase()))
    : models;
  const sorted = [...filtered].sort((a, b) => {
    const aEnabled = !disabledModels.has(a);
    const bEnabled = !disabledModels.has(b);
    if (aEnabled !== bEnabled) return aEnabled ? -1 : 1;
    return 0;
  });

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2 pb-3">
        <span className="text-[13px] font-medium">{t("provider.form.models")}</span>
        <Button
          variant="outline"
          size="sm"
          disabled={modelsLoading}
          onClick={onFetchModels}
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
            onChange={(e) => onModelSearchChange(e.target.value)}
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
                {sorted.map((modelId) => {
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
                        onClick={() => onTestModel(modelId)}
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
                        onClick={() => onModelOptionsOpen(modelId)}
                        title={t("provider.form.modelOptionsButton")}
                      >
                        <Settings2 className="size-3.5" strokeWidth={1.5} />
                      </Button>
                      <Switch
                        size="sm"
                        checked={!disabledModels.has(modelId)}
                        onCheckedChange={(checked) => onToggleModel(modelId, !!checked)}
                      />
                    </div>
                  );
                })}
              </div>
            </ScrollArea>
          </div>
        </>
      )}
    </div>
  );
}
