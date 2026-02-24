import { useState, useMemo, useEffect, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { Check, Cpu, Eye, ImagePlus, Image, Wrench, Brain, Database } from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useChatStore } from "@/stores/chatStore";
import { providerRepo } from "@/db/repos/providerRepo";
import { getModelsForProviders, getModelOption } from "@/lib/ai/model-service";
import { BUILTIN_PROVIDER_TYPES, PROVIDER_METAS } from "@/lib/ai/provider-meta";
import type { ModelInfo, Provider, ModelOption } from "@/db/types";
import { ProviderIcon } from "@/components/common/ProviderIcon";
import { cn } from "@/lib/utils";

const CAPABILITY_KEYS: (keyof ModelOption)[] = [
  "vision",
  "image_in",
  "image_output",
  "tool_calling",
  "reasoning",
  "embedding",
];
const CAPABILITY_ICONS: Record<string, React.ComponentType<{ className?: string; strokeWidth?: number }>> = {
  vision: Eye,
  image_in: ImagePlus,
  image_output: Image,
  tool_calling: Wrench,
  reasoning: Brain,
  embedding: Database,
};

interface ModelSelectorProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ModelSelector({ open, onOpenChange }: ModelSelectorProps) {
  const { t } = useTranslation();
  const selectModel = useChatStore((s) => s.selectModel);
  const currentModelId = useChatStore((s) => s.modelId);
  const currentProviderId = useChatStore((s) => s.providerId);
  const providerType = useChatStore((s) => s.providerType);

  const [providers, setProviders] = useState<Provider[]>([]);
  const [search, setSearch] = useState("");

  const loadFromDb = useCallback(async () => {
    try {
      const rows = await providerRepo.getAll();
      setProviders(rows);
    } catch (err) {
      console.error("[ModelSelector] Failed to load providers:", err);
    }
  }, []);

  useEffect(() => {
    if (open) {
      loadFromDb();
      setSearch("");
    }
  }, [open, loadFromDb]);

  const enabledProviders = providers.filter(
    (p) => p.enabled && BUILTIN_PROVIDER_TYPES.includes(p.type),
  );
  const models = useMemo(
    () => getModelsForProviders(enabledProviders),
    [enabledProviders],
  );

  const grouped = useMemo(() => {
    const groups: Record<string, ModelInfo[]> = {};
    for (const model of models) {
      const key = model.provider_name;
      if (!groups[key]) groups[key] = [];
      groups[key].push(model);
    }
    return groups;
  }, [models]);

  const filteredGrouped = useMemo(() => {
    if (!search.trim()) return grouped;
    const q = search.trim().toLowerCase();
    const out: Record<string, ModelInfo[]> = {};
    for (const [provider, list] of Object.entries(grouped)) {
      const filtered = list.filter(
        (m) =>
          m.id.toLowerCase().includes(q) ||
          m.name.toLowerCase().includes(q) ||
          provider.toLowerCase().includes(q),
      );
      if (filtered.length > 0) out[provider] = filtered;
    }
    return out;
  }, [grouped, search]);

  function handleSelect(model: ModelInfo) {
    selectModel(model.provider_id, model.id, model.provider_type);
    onOpenChange(false);
  }

  const triggerButton = (
    <button
      type="button"
      className={cn(
        "ml-2 mr-1 flex h-7 shrink-0 items-center gap-1.5 rounded-md pl-2.5 pr-2 text-muted-foreground transition-colors hover:bg-background-tertiary hover:text-foreground",
        !currentModelId &&
          "border border-dashed border-muted-foreground/40 bg-muted/30 hover:border-muted-foreground/60 hover:bg-muted/50",
      )}
      title={currentModelId ?? t("chat.selectModel")}
    >
      {providerType && (
        <ProviderIcon type={providerType} className="size-4 shrink-0" />
      )}
      <span className="min-w-0 max-w-[380px] truncate text-[11px] font-medium leading-snug -translate-y-px">
        {currentModelId ?? t("chat.selectModel")}
      </span>
    </button>
  );

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>{triggerButton}</PopoverTrigger>
      <PopoverContent
        align="start"
        side="top"
        className="w-[320px] rounded-xl border border-border bg-popover p-0 shadow-lg"
      >
        <div className="flex items-center justify-between px-4 py-3 pb-0">
          <div className="flex items-center gap-2">
            <Cpu className="size-4 shrink-0 text-muted-foreground" strokeWidth={1.5} />
            <h3 className="text-sm font-semibold">{t("chat.selectModel")}</h3>
          </div>
        </div>

        <div className="px-4 py-2">
          <Input
            placeholder={t("modelSelector.searchPlaceholder")}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-8 rounded-lg text-[13px]"
          />
        </div>

        <div className="h-[280px] shrink-0 overflow-hidden border-t border-border/50">
          <ScrollArea className="h-full w-full">
            <div className="px-2 py-2">
              {models.length === 0 ? (
                <p className="py-6 text-center text-[13px] text-muted-foreground">
                  {t("modelSelector.noProviders")}
                </p>
              ) : Object.keys(filteredGrouped).length === 0 ? (
                <p className="py-6 text-center text-[13px] text-muted-foreground">
                  {t("modelSelector.noModelsFound")}
                </p>
              ) : (
                <div className="space-y-3">
                  {Object.entries(filteredGrouped).map(([provider, providerModels]) => (
                    <div key={provider}>
                      <p className="mb-1 px-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                        {provider}
                      </p>
                      <ul className="space-y-0.5">
                        {providerModels.map((model) => {
                          const isSelected =
                            model.id === currentModelId &&
                            model.provider_id === currentProviderId;
                          const provider = enabledProviders.find(
                            (p) => p.id === model.provider_id,
                          );
                          const meta = PROVIDER_METAS[model.provider_type as keyof typeof PROVIDER_METAS];
                          const opt = provider
                            ? getModelOption(provider, model.id)
                            : undefined;
                          const details: Partial<ModelOption> = {
                            ...meta?.knownModelDetails?.[model.id],
                            ...opt,
                          };
                          const ctx = details?.context_window;
                          const contextLabel =
                            ctx != null
                              ? ctx >= 1000
                                ? `${ctx / 1000}K`
                                : String(ctx)
                              : null;
                          return (
                            <li key={`${model.provider_id}-${model.id}`}>
                              <button
                                type="button"
                                onClick={() => handleSelect(model)}
                                className={cn(
                                  "flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left transition-colors hover:bg-background-tertiary/80",
                                  isSelected && "bg-background-tertiary/80",
                                )}
                              >
                                <ProviderIcon
                                  type={model.provider_type}
                                  className="size-4 shrink-0"
                                />
                                <div className="min-w-0 flex-1 overflow-hidden">
                                  <div className="truncate text-[13px] font-medium">
                                    {model.name}
                                  </div>
                                  <div className="mt-0.5 flex items-center gap-1.5 text-[10px] text-muted-foreground">
                                    <TooltipProvider delayDuration={200}>
                                      {CAPABILITY_KEYS.map((key) => {
                                        if (!details[key]) return null;
                                        const Icon = CAPABILITY_ICONS[key];
                                        if (!Icon) return null;
                                        return (
                                          <Tooltip key={key}>
                                            <TooltipTrigger asChild>
                                              <span className="inline-flex cursor-default">
                                                <Icon
                                                  className="size-3 shrink-0"
                                                  strokeWidth={1.5}
                                                />
                                              </span>
                                            </TooltipTrigger>
                                            <TooltipContent side="top" sideOffset={4}>
                                              {t(`provider.capability.${key}`)}
                                            </TooltipContent>
                                          </Tooltip>
                                        );
                                      })}
                                    </TooltipProvider>
                                    {contextLabel != null && (
                                      <span>{contextLabel}</span>
                                    )}
                                  </div>
                                </div>
                                <Check
                                  className={cn(
                                    "size-3.5 shrink-0",
                                    isSelected ? "opacity-100" : "opacity-0",
                                  )}
                                />
                              </button>
                            </li>
                          );
                        })}
                      </ul>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </ScrollArea>
        </div>
      </PopoverContent>
    </Popover>
  );
}
