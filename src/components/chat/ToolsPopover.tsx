import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Wrench } from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Checkbox } from "@/components/ui/checkbox";
import { ALL_TOOL_INFOS, type ToolInfo } from "@/lib/ai/tools/tool-meta";
import { isOfficellmAvailable } from "@/lib/ai/officellm-detect";
import { useToolsStore } from "@/stores/toolsStore";
import { cn } from "@/lib/utils";

export function ToolsPopover() {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [unavailableIds, setUnavailableIds] = useState<Set<string>>(new Set());
  const disabledToolIds = useToolsStore((s) => s.disabledToolIds);
  const loadDisabledToolIds = useToolsStore((s) => s.loadDisabledToolIds);
  const toggleTool = useToolsStore((s) => s.toggleTool);

  useEffect(() => {
    loadDisabledToolIds();
  }, [loadDisabledToolIds]);

  // Detect unavailable tools when popover opens
  useEffect(() => {
    if (!open) return;
    loadDisabledToolIds();
    isOfficellmAvailable().then((available) => {
      if (!available) {
        setUnavailableIds(new Set(["officellm", "render_mermaid"]));
      } else {
        setUnavailableIds(new Set());
      }
    });
  }, [open, loadDisabledToolIds]);

  const enabledCount = ALL_TOOL_INFOS.filter(
    (info) => !disabledToolIds.includes(info.id) && !unavailableIds.has(info.id),
  ).length;

  const core = ALL_TOOL_INFOS.filter((i) => i.category === "core");
  const extension = ALL_TOOL_INFOS.filter((i) => i.category === "extension");

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            "relative flex size-7 shrink-0 items-center justify-center rounded-md transition-colors hover:bg-background-tertiary",
            enabledCount > 0 ? "text-brand hover:text-brand-hover" : "text-muted-foreground hover:text-foreground",
          )}
          title={t("tools.tooltipEnabled", { count: enabledCount })}
        >
          <Wrench className="size-4" strokeWidth={1.5} />
          {enabledCount > 0 && (
            <span className="absolute -right-0.5 -top-0.5 flex min-w-[11px] items-center justify-center rounded-full bg-brand px-0.5 py-0.5 text-[8px] font-medium leading-none text-brand-foreground">
              {enabledCount > 99 ? "99+" : enabledCount}
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        side="top"
        className="w-[320px] rounded-xl border border-border bg-popover p-0 shadow-lg"
      >
        <div className="flex items-center gap-2 px-4 py-3 pb-0">
          <Wrench className="size-4 shrink-0 text-muted-foreground" strokeWidth={1.5} />
          <h3 className="text-sm font-semibold">{t("tools.title")}</h3>
        </div>

        <p className="px-4 py-2 text-[12px] text-muted-foreground">
          {t("tools.hint")}
        </p>

        <div className="h-[320px] shrink-0 overflow-hidden border-t border-border/50">
          <ScrollArea className="h-full w-full">
            <div className="px-3 py-2">
              <ToolGroup
                label="Core"
                tools={core}
                disabledIds={disabledToolIds}
                unavailableIds={unavailableIds}
                onToggle={toggleTool}
              />
              <ToolGroup
                label="Extension"
                tools={extension}
                disabledIds={disabledToolIds}
                unavailableIds={unavailableIds}
                onToggle={toggleTool}
              />
            </div>
          </ScrollArea>
        </div>
      </PopoverContent>
    </Popover>
  );
}

function ToolGroup({
  label,
  tools,
  disabledIds,
  unavailableIds,
  onToggle,
}: {
  label: string;
  tools: ToolInfo[];
  disabledIds: string[];
  unavailableIds: Set<string>;
  onToggle: (id: string) => void;
}) {
  if (tools.length === 0) return null;

  return (
    <div className="mb-2">
      <p className="mb-1 px-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
        {label}
      </p>
      <ul className="space-y-0.5">
        {tools.map((info) => (
          <ToolItem
            key={info.id}
            info={info}
            enabled={!disabledIds.includes(info.id)}
            unavailable={unavailableIds.has(info.id)}
            onToggle={() => onToggle(info.id)}
          />
        ))}
      </ul>
    </div>
  );
}

function ToolItem({
  info,
  enabled,
  unavailable,
  onToggle,
}: {
  info: ToolInfo;
  enabled: boolean;
  unavailable: boolean;
  onToggle: () => void;
}) {
  const { t } = useTranslation();
  const isActive = enabled && !unavailable;

  return (
    <li className="flex items-center gap-2 rounded-lg px-2 py-1.5 transition-colors hover:bg-background-tertiary/80">
      <Checkbox
        checked={isActive}
        onCheckedChange={() => onToggle()}
        disabled={unavailable}
        className="shrink-0"
        aria-label={info.name}
      />
      <span className={cn(
        "text-[13px] font-medium",
        unavailable ? "text-muted-foreground" : "text-foreground",
      )}>
        {info.name}
      </span>
      {unavailable && (
        <span className="shrink-0 rounded bg-destructive/15 px-1 py-0.5 text-[10px] font-medium text-destructive">
          {t("tools.unavailable")}
        </span>
      )}
    </li>
  );
}
