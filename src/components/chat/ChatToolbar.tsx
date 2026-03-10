import {
  Paperclip,
  Globe,
  ArrowUp,
  Square,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { ToolbarIcon } from "./ToolbarIcon";
import { SkillsPopover } from "./SkillsPopover";
import { ModelSelector } from "./ModelSelector";
import { cn } from "@/lib/utils";

interface ChatToolbarProps {
  isStreaming: boolean;
  canSend: boolean;
  webSearchEnabled: boolean;
  onWebSearchToggle: () => void;
  modelSelectorOpen: boolean;
  onModelSelectorOpenChange: (open: boolean) => void;
  onAttachFiles: () => void;
  onSend: () => void;
  onStop: () => void;
}

export function ChatToolbar({
  isStreaming,
  canSend,
  webSearchEnabled,
  onWebSearchToggle,
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
      <button
        type="button"
        onClick={onWebSearchToggle}
        title={t("chat.webSearch")}
        className={cn(
          "flex size-7 shrink-0 items-center justify-center rounded-md transition-colors",
          webSearchEnabled
            ? "bg-accent/15 text-accent hover:bg-accent/20"
            : "text-muted-foreground hover:bg-background-tertiary hover:text-foreground",
        )}
      >
        <Globe className="size-[15px]" strokeWidth={1.5} />
      </button>
      <SkillsPopover />
      <ModelSelector open={modelSelectorOpen} onOpenChange={onModelSelectorOpenChange} />

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
          className="ml-1 flex size-6 items-center justify-center rounded-lg bg-accent text-accent-foreground transition-opacity disabled:opacity-30"
          title={t("chat.sendMessage")}
        >
          <ArrowUp className="size-4" strokeWidth={2} />
        </button>
      )}
    </div>
  );
}
