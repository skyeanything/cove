import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Check } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useChatStore } from "@/stores/chatStore";
import { providerRepo } from "@/db/repos/providerRepo";
import { getModelsForProviders } from "@/lib/ai/model-service";
import type { ModelInfo, Provider } from "@/db/types";
import { ProviderIcon } from "@/components/common/ProviderIcon";
import { useState, useMemo, useEffect, useCallback } from "react";
import { cn } from "@/lib/utils";

interface ModelSelectorProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ModelSelector({ open, onOpenChange }: ModelSelectorProps) {
  const { t } = useTranslation();
  const selectModel = useChatStore((s) => s.selectModel);
  const currentModelId = useChatStore((s) => s.modelId);
  const currentProviderId = useChatStore((s) => s.providerId);

  const [providers, setProviders] = useState<Provider[]>([]);

  const loadFromDb = useCallback(async () => {
    try {
      const rows = await providerRepo.getAll();
      setProviders(rows);
    } catch (err) {
      console.error("[ModelSelector] Failed to load providers:", err);
    }
  }, []);

  // Refresh from DB each time the selector opens
  useEffect(() => {
    if (open) loadFromDb();
  }, [open, loadFromDb]);

  const enabledProviders = providers.filter((p) => p.enabled);

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

  function handleSelect(model: ModelInfo) {
    selectModel(model.provider_id, model.id, model.provider_type);
    onOpenChange(false);
  }

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange}>
      <CommandInput placeholder={t("modelSelector.searchPlaceholder")} />
      <CommandList>
        <CommandEmpty>
          {models.length === 0
            ? t("modelSelector.noProviders")
            : t("modelSelector.noModelsFound")}
        </CommandEmpty>
        {Object.entries(grouped).map(([provider, providerModels]) => (
          <CommandGroup key={provider} heading={provider}>
            {providerModels.map((model) => {
              const isSelected = model.id === currentModelId && model.provider_id === currentProviderId;
              return (
                <CommandItem
                  key={`${model.provider_id}-${model.id}`}
                  onSelect={() => handleSelect(model)}
                  className="gap-2"
                >
                  <ProviderIcon type={model.provider_type} className="size-4" />
                  <span className="text-[13px]">{model.name}</span>
                  <span className="ml-auto text-[11px] text-muted-foreground">
                    {model.id}
                  </span>
                  <Check className={cn("size-3.5", isSelected ? "opacity-100" : "opacity-0")} />
                </CommandItem>
              );
            })}
          </CommandGroup>
        ))}
      </CommandList>
    </CommandDialog>
  );
}
