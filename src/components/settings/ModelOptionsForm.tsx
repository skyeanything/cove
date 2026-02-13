import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useDataStore } from "@/stores/dataStore";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import type { ProviderConfig, ModelOption } from "@/db/types";
import type { ProviderType } from "@/db/types";
import { PROVIDER_METAS } from "@/lib/ai/provider-meta";
import { Settings2, Eye, Image, ImagePlus, Wrench, Brain, Database } from "lucide-react";
import { cn } from "@/lib/utils";

interface ModelOptionsFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  providerId: string;
  providerType: ProviderType;
  modelId: string | null;
}

const CAPABILITY_KEYS: (keyof ModelOption)[] = [
  "vision",
  "image_in",
  "image_output",
  "tool_calling",
  "reasoning",
  "embedding",
];

const CAPABILITY_ICONS: Record<string, React.ReactNode> = {
  vision: <Eye className="size-3.5" strokeWidth={1.5} />,
  image_in: <ImagePlus className="size-3.5" strokeWidth={1.5} />,
  image_output: <Image className="size-3.5" strokeWidth={1.5} />,
  tool_calling: <Wrench className="size-3.5" strokeWidth={1.5} />,
  reasoning: <Brain className="size-3.5" strokeWidth={1.5} />,
  embedding: <Database className="size-3.5" strokeWidth={1.5} />,
};

export function ModelOptionsForm({
  open,
  onOpenChange,
  providerId,
  providerType,
  modelId,
}: ModelOptionsFormProps) {
  const { t } = useTranslation();
  const providers = useDataStore((s) => s.providers);
  const updateProvider = useDataStore((s) => s.updateProvider);

  const provider = providers.find((p) => p.id === providerId);
  const config: ProviderConfig = provider?.config
    ? (JSON.parse(provider.config) as ProviderConfig)
    : {};

  const [contextWindow, setContextWindow] = useState<string>("");
  const [maxOutputTokens, setMaxOutputTokens] = useState<string>("");
  const [capabilities, setCapabilities] = useState<Record<string, boolean>>({
    vision: false,
    image_in: false,
    image_output: false,
    tool_calling: false,
    reasoning: false,
    embedding: false,
  });

  useEffect(() => {
    if (!open || !modelId) return;
    const defaults = (PROVIDER_METAS[providerType]?.knownModelDetails ?? {})[modelId];
    const existing = config.model_options?.[modelId];
    const merged = { ...defaults, ...existing };
    setContextWindow(String(merged?.context_window ?? ""));
    setMaxOutputTokens(String(merged?.max_output_tokens ?? ""));
    setCapabilities({
      vision: merged?.vision ?? false,
      image_in: merged?.image_in ?? false,
      image_output: merged?.image_output ?? false,
      tool_calling: merged?.tool_calling ?? false,
      reasoning: merged?.reasoning ?? false,
      embedding: merged?.embedding ?? false,
    });
  }, [open, modelId, providerType, provider?.config]);

  async function handleSave() {
    if (!providerId || !modelId || !provider) return;
    const ctx = parseInt(contextWindow, 10);
    const maxTok = parseInt(maxOutputTokens, 10);
    const existingOpt = config.model_options?.[modelId];
    const next: ModelOption = {
      ...existingOpt,
      context_window: Number.isNaN(ctx) ? undefined : ctx,
      max_output_tokens: Number.isNaN(maxTok) ? undefined : maxTok,
      vision: capabilities.vision,
      image_in: capabilities.image_in,
      image_output: capabilities.image_output,
      tool_calling: capabilities.tool_calling,
      reasoning: capabilities.reasoning,
      embedding: capabilities.embedding,
    };
    const merged: ProviderConfig = {
      ...config,
      model_options: {
        ...config.model_options,
        [modelId]: next,
      },
    };
    const configStr = JSON.stringify(merged);
    useDataStore.setState({
      providers: providers.map((p) =>
        p.id === providerId ? { ...p, config: configStr } : p,
      ),
    });
    await updateProvider(providerId, { config: configStr });
    onOpenChange(false);
  }

  if (!modelId) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md" showCloseButton={true}>
        <DialogHeader>
          <div className="flex items-center gap-2">
            <Settings2 className="size-5 text-muted-foreground" strokeWidth={1.5} />
            <DialogTitle>{t("provider.modelOptions.title")}</DialogTitle>
          </div>
          <DialogDescription>
            {t("provider.modelOptions.description", { modelId })}
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4 py-2">
          <div className="flex flex-col gap-2">
            <Label className="text-[13px] font-medium">
              {t("provider.modelOptions.capabilitiesLabel")}
            </Label>
            <p className="text-[12px] text-muted-foreground">
              {t("provider.modelOptions.capabilitiesHint")}
            </p>
            <div className="grid grid-cols-2 gap-2">
              {CAPABILITY_KEYS.map((key) => (
                <div
                  key={key}
                  className={cn(
                    "flex items-center justify-between rounded-lg border px-3 py-2",
                  )}
                >
                  <span className="flex items-center gap-2 text-[13px]">
                    {CAPABILITY_ICONS[key]}
                    {t(`provider.capability.${key}`)}
                  </span>
                  <Switch
                    size="sm"
                    checked={capabilities[key] ?? false}
                    onCheckedChange={(checked) =>
                      setCapabilities((prev) => ({ ...prev, [key]: checked }))
                    }
                  />
                </div>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label className="text-[13px]">
                {t("provider.modelOptions.contextWindow")}
              </Label>
              <Input
                type="number"
                value={contextWindow}
                onChange={(e) => setContextWindow(e.target.value)}
                placeholder="128000"
                className="h-[2.4rem] rounded-[4px] text-sm"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label className="text-[13px]">
                {t("provider.modelOptions.maxOutputTokens")}
              </Label>
              <Input
                type="number"
                value={maxOutputTokens}
                onChange={(e) => setMaxOutputTokens(e.target.value)}
                placeholder="8192"
                className="h-[2.4rem] rounded-[4px] text-sm"
              />
            </div>
          </div>
        </div>

        <DialogFooter showCloseButton={false}>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t("provider.modelOptions.cancel")}
          </Button>
          <Button onClick={handleSave}>{t("provider.modelOptions.save")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
