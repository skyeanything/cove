import {
  Paperclip,
  Globe,
  ArrowUp,
  Square,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { ContextRing } from "./ContextRing";
import { ToolbarIcon } from "./ToolbarIcon";
import { SkillsPopover } from "./SkillsPopover";
import { ModelSelector } from "./ModelSelector";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface ChatToolbarProps {
  isStreaming: boolean;
  canSend: boolean;
  contextPercent: number;
  contextTooltip: string;
  modelSelectorOpen: boolean;
  onModelSelectorOpenChange: (open: boolean) => void;
  onAttachFiles: () => void;
  onSend: () => void;
  onStop: () => void;
}

export function ChatToolbar({
  isStreaming,
  canSend,
  contextPercent,
  contextTooltip,
  modelSelectorOpen,
  onModelSelectorOpenChange,
  onAttachFiles,
  onSend,
  onStop,
}: ChatToolbarProps) {
  const { t } = useTranslation();

  return (
    <div className="flex items-center px-2 pb-2 pt-1">
      <ToolbarIcon icon={<Paperclip />} title={t("chat.attachFiles")} onClick={onAttachFiles} />
      <ToolbarIcon icon={<Globe />} title={t("chat.webSearch")} />
      <SkillsPopover />
      <ModelSelector open={modelSelectorOpen} onOpenChange={onModelSelectorOpenChange} />

      <TooltipProvider delayDuration={300}>
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="flex size-7 shrink-0 cursor-default items-center justify-center rounded-md text-muted-foreground">
              <ContextRing percent={contextPercent} />
            </span>
          </TooltipTrigger>
          <TooltipContent side="top" sideOffset={4}>
            {contextTooltip}
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>

      <div className="flex-1" />

      {isStreaming ? (
        <button
          onClick={onStop}
          className="ml-1 flex size-6 items-center justify-center rounded-lg bg-destructive text-destructive-foreground transition-opacity"
          title={t("chat.stopGeneration")}
        >
          <Square className="size-3" strokeWidth={2} fill="currentColor" />
        </button>
      ) : (
        <button
          onClick={onSend}
          disabled={!canSend}
          className="ml-1 flex size-6 items-center justify-center rounded-lg bg-foreground text-background transition-opacity disabled:opacity-30"
          title={t("chat.sendMessage")}
        >
          <ArrowUp className="size-4" strokeWidth={2} />
        </button>
      )}
    </div>
  );
}
