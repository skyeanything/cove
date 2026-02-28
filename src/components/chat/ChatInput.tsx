// FILE_SIZE_EXCEPTION: Added context compression state and notice display
import {
  Paperclip,
  Globe,
  ArrowUp,
  Square,
  CornerDownRight,
  Box,
  Copy,
} from "lucide-react";
import { useState, useRef, useEffect, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { ContextRing } from "./ContextRing";
import { ToolbarIcon } from "./ToolbarIcon";
import { useChatStore } from "@/stores/chatStore";
import { useDataStore } from "@/stores/dataStore";
import { useWorkspaceStore } from "@/stores/workspaceStore";
import { useSettingsStore } from "@/stores/settingsStore";
import { useSkillsStore } from "@/stores/skillsStore";
import { getModelOption } from "@/lib/ai/model-service";
import { estimateNextTurnTokens } from "@/lib/ai/context-compression";
import { revealItemInDir } from "@tauri-apps/plugin-opener";
import { listSkills } from "@/lib/ai/skills/loader";
import { WorkspacePopover } from "./WorkspacePopover";
import { SkillsPopover } from "./SkillsPopover";
import { ModelSelector } from "./ModelSelector";
import { AttachmentBar } from "./AttachmentBar";
import {
  isImageAttachment,
} from "@/lib/attachment-utils";
import { pickAndSaveAttachments } from "@/hooks/useAttachFiles";
import {
  isImageFile,
  imageFilesToDraftAttachments,
  nonImageFilesToDraftAttachments,
} from "@/lib/chat-input-utils";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

/** IME 刚结束组合后的一小段时间内不把 Enter 当作发送（避免确认拼音/英文时误发） */
const IME_COMMIT_GRACE_MS = 150;

export function ChatInput({
  modelSelectorOpen: modelSelectorOpenProp,
  onModelSelectorOpenChange,
}: {
  modelSelectorOpen?: boolean;
  onModelSelectorOpenChange?: (open: boolean) => void;
} = {}) {
  const { t } = useTranslation();
  const [message, setMessage] = useState("");
  const [attachError, setAttachError] = useState<string | null>(null);
  const [modelSelectorOpenLocal, setModelSelectorOpenLocal] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const lastCompositionEndRef = useRef<number>(0);
  const sendMessage = useChatStore((s) => s.sendMessage);
  const stopGeneration = useChatStore((s) => s.stopGeneration);
  const addDraftAttachments = useChatStore((s) => s.addDraftAttachments);
  const removeDraftAttachment = useChatStore((s) => s.removeDraftAttachment);
  const draftAttachments = useChatStore((s) => s.draftAttachments);
  const isStreaming = useChatStore((s) => s.isStreaming);
  const modelId = useChatStore((s) => s.modelId);
  const providerId = useChatStore((s) => s.providerId);
  const providers = useDataStore((s) => s.providers);

  const modelSelectorOpen =
    onModelSelectorOpenChange != null ? (modelSelectorOpenProp ?? false) : modelSelectorOpenLocal;
  const setModelSelectorOpen =
    onModelSelectorOpenChange ?? setModelSelectorOpenLocal;
  const messages = useChatStore((s) => s.messages);
  const error = useChatStore((s) => s.error);
  const isCompressing = useChatStore((s) => s.isCompressing);
  const sendMessageShortcut = useSettingsStore((s) => s.sendMessageShortcut);

  const sessionTokens = estimateNextTurnTokens(messages, message.length);
  const contextLimit = useMemo(() => {
    if (!modelId || !providerId) return 0;
    const provider = providers.find((p) => p.id === providerId);
    if (!provider) return 0;
    const opt = getModelOption(provider, modelId);
    return opt?.context_window ?? 128_000;
  }, [modelId, providerId, providers]);
  const contextPercent =
    contextLimit === 0
      ? 0
      : Math.min(100, Math.round((sessionTokens / contextLimit) * 100));
  const formatContextNum = (n: number) =>
    n >= 1000 ? `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k` : String(n);
  const contextTooltip = t("chat.contextUsedFormula", {
    used: formatContextNum(sessionTokens),
    limit: formatContextNum(contextLimit),
    percent: contextPercent,
  });

  const activeWorkspace = useWorkspaceStore((s) => s.activeWorkspace);
  const externalSkills = useSkillsStore((s) => s.externalSkills);

  /** / 命令：可选的 skill 名称列表（内置 + 外部去重） */
  const skillNames = useMemo(() => {
    const seen = new Set<string>();
    const names: string[] = [];
    for (const m of listSkills()) {
      if (!seen.has(m.name)) {
        seen.add(m.name);
        names.push(m.name);
      }
    }
    for (const { skill } of externalSkills) {
      if (!seen.has(skill.meta.name)) {
        seen.add(skill.meta.name);
        names.push(skill.meta.name);
      }
    }
    return names.sort((a, b) => a.localeCompare(b));
  }, [externalSkills]);

  const showSlashCommands = message.startsWith("/");
  const slashFilter = message.length > 1 ? message.slice(1).toLowerCase() : "";
  const slashFilteredSkills = useMemo(
    () =>
      slashFilter
        ? skillNames.filter((n) => n.toLowerCase().includes(slashFilter))
        : skillNames,
    [skillNames, slashFilter],
  );

  const provider = useMemo(
    () => (providerId ? providers.find((p) => p.id === providerId) : undefined),
    [providerId, providers],
  );
  const modelSupportsVision = useMemo(() => {
    if (!provider || !modelId) return false;
    const opt = getModelOption(provider, modelId);
    return opt?.vision === true || opt?.image_in === true;
  }, [provider, modelId]);

  const canSend = Boolean((message.trim() || draftAttachments.length > 0) && modelId && !isStreaming);

  // Auto-resize textarea
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 200) + "px";
  }, [message]);

  const handleAttachFiles = async () => {
    await pickAndSaveAttachments(addDraftAttachments, setAttachError);
  };

  const handleSend = () => {
    if (!canSend) return;
    const hasImage = draftAttachments.some((a) => isImageAttachment(a));
    if (hasImage && !modelSupportsVision) {
      setAttachError(t("chat.visionNotSupported"));
      return;
    }
    setAttachError(null);
    const content = message.trim();
    setMessage("");
    sendMessage(content);
  };

  const handlePaste = async (e: React.ClipboardEvent) => {
    const items = e.clipboardData?.items;
    if (!items?.length) return;
    const files: File[] = [];
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (item?.kind === "file") {
        const file = item.getAsFile();
        if (file && isImageFile(file)) files.push(file);
      }
    }
    if (files.length === 0) return;
    e.preventDefault();
    const attachments = await imageFilesToDraftAttachments(files);
    if (attachments.length > 0) {
      addDraftAttachments(attachments);
      setAttachError(null);
    }
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const files = e.dataTransfer?.files;
    if (!files?.length) return;
    const imageList = await imageFilesToDraftAttachments(Array.from(files));
    const docList = await nonImageFilesToDraftAttachments(Array.from(files));
    const all = [...imageList, ...docList];
    if (all.length > 0) {
      addDraftAttachments(all);
      setAttachError(null);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    // 输入法组合中不把 Enter 当发送；部分 IME 在 compositionend 后短时内也不发送
    if (e.nativeEvent.isComposing) return;
    if (e.key === "Enter" && Date.now() - lastCompositionEndRef.current < IME_COMMIT_GRACE_MS) {
      return;
    }
    if (sendMessageShortcut === "enter") {
      // 回车发送，Shift+Enter 换行
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    } else {
      // modifierEnter: ⌘+Enter(Mac) / Ctrl+Enter(Win,Linux) 发送，单独 Enter 换行
      if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        handleSend();
      }
    }
  };

  const handleRevealWorkspace = async () => {
    if (activeWorkspace) {
      await revealItemInDir(activeWorkspace.path);
    }
  };

  const handleCopyWorkspacePath = () => {
    if (activeWorkspace) {
      navigator.clipboard.writeText(activeWorkspace.path);
    }
  };

  return (
    <div className="shrink-0 px-4 pb-3 pt-1">
      <div className="mx-auto max-w-[896px]">
        {/* Error / compression notice */}
        {isCompressing && (
          <div className="mb-2 rounded-lg bg-accent/20 border border-accent/30 px-3 py-2 text-[13px] font-medium text-accent">
            {t("chat.contextCompressing")}
          </div>
        )}
        {(error || attachError) && !isCompressing && (
          <div className="mb-2 rounded-lg bg-destructive/10 px-3 py-2 text-[13px] text-destructive">
            {error ?? attachError}
          </div>
        )}

        {/* Input container：支持拖放图片到此处 */}
        <div
          className="rounded-lg border border-border transition-colors focus-within:border-ring"
          onDrop={handleDrop}
          onDragOver={handleDragOver}
        >
          <AttachmentBar attachments={draftAttachments} onRemove={removeDraftAttachment} />
          {/* Workspace bar */}
          {activeWorkspace && (
            <div className="flex items-center gap-1.5 border-b border-border/50 px-3 py-1">
              <WorkspacePopover
                trigger={
                  <button
                    type="button"
                    className="flex shrink-0 cursor-pointer items-center gap-1 rounded px-0.5 py-0.5 text-muted-foreground/70 hover:bg-background-tertiary hover:text-foreground"
                    title={t("chat.workspace")}
                  >
                    <Box className="size-3.5" strokeWidth={2.5} />
                    <span className="text-[10px] font-medium tracking-wide uppercase">
                      {t("chat.workspace")}
                    </span>
                  </button>
                }
              />
              <span className="min-w-0 truncate text-[11px] text-muted-foreground">
                {activeWorkspace.path}
              </span>
              <div className="ml-auto flex shrink-0 items-center gap-0.5">
                <button
                  type="button"
                  onClick={handleCopyWorkspacePath}
                  className="cursor-pointer rounded p-0.5 text-muted-foreground hover:bg-background-tertiary hover:text-foreground"
                  title={t("chat.copyPath")}
                >
                  <Copy className="size-3" strokeWidth={1.5} />
                </button>
                <button
                  type="button"
                  onClick={handleRevealWorkspace}
                  className="cursor-pointer rounded p-0.5 text-muted-foreground hover:bg-background-tertiary hover:text-foreground"
                  title={t("chat.revealInFolder")}
                >
                  <CornerDownRight className="size-3" strokeWidth={1.5} />
                </button>
              </div>
            </div>
          )}

          {/* Textarea */}
          <textarea
            ref={textareaRef}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            onCompositionEnd={() => {
              lastCompositionEndRef.current = Date.now();
            }}
            onKeyDown={handleKeyDown}
            onPaste={handlePaste}
            placeholder={
              modelId
                ? t("chat.placeholder", {
                    shortcut:
                      sendMessageShortcut === "enter"
                        ? t("settings.general.shortcutEnter")
                        : t("settings.general.shortcutModifierEnter"),
                  })
                : t("chat.placeholderNoModel")
            }
            rows={1}
            disabled={!modelId}
            className="block min-h-[44px] max-h-[200px] w-full resize-none bg-transparent px-4 pt-3 pb-1 text-[14px] leading-[1.5] placeholder:text-muted-foreground focus:outline-none disabled:cursor-not-allowed disabled:opacity-50"
          />

          {/* / 命令：skill 快捷选择 */}
          {showSlashCommands && slashFilteredSkills.length > 0 && (
            <div className="max-h-48 overflow-auto border-t border-border bg-background-secondary/80">
              <ul className="py-1">
                {slashFilteredSkills.slice(0, 10).map((name) => (
                  <li key={name}>
                    <button
                      type="button"
                      className="w-full px-4 py-2 text-left text-[13px] hover:bg-background-tertiary"
                      onMouseDown={(e) => {
                        e.preventDefault();
                        setMessage(`/skill:${name} `);
                      }}
                    >
                      /skill:{name}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Bottom toolbar */}
          <div className="flex items-center px-2 pb-2 pt-1">
            {/* Left icons */}
            <ToolbarIcon icon={<Paperclip />} title={t("chat.attachFiles")} onClick={handleAttachFiles} />
            <ToolbarIcon icon={<Globe />} title={t("chat.webSearch")} />
            <SkillsPopover />
            {/* 模型选择：卡片 Popover，与 Skills 同风格 */}
            <ModelSelector
              open={modelSelectorOpen}
              onOpenChange={setModelSelectorOpen}
            />

            {/* Context window 圆环：红框位置，hover 显示用量 */}
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

            {/* Microphone */}
            {/* <ToolbarIcon icon={<Mic />} title={t("chat.voiceInput")} /> */}

            {/* Send / Stop button */}
            {isStreaming ? (
              <button
                onClick={stopGeneration}
                className="ml-1 flex size-6 items-center justify-center rounded-lg bg-destructive text-destructive-foreground transition-opacity"
                title={t("chat.stopGeneration")}
              >
                <Square className="size-3" strokeWidth={2} fill="currentColor" />
              </button>
            ) : (
              <button
                onClick={handleSend}
                disabled={!canSend}
                className="ml-1 flex size-6 items-center justify-center rounded-lg bg-foreground text-background transition-opacity disabled:opacity-30"
                title={t("chat.sendMessage")}
              >
                <ArrowUp className="size-4" strokeWidth={2} />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
