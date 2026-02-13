import {
  Paperclip,
  Globe,
  Mic,
  ArrowUp,
  Square,
  CornerDownRight,
  Box,
  Copy,
} from "lucide-react";
import { useState, useRef, useEffect, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useChatStore } from "@/stores/chatStore";
import { useWorkspaceStore } from "@/stores/workspaceStore";
import { useSettingsStore } from "@/stores/settingsStore";
import { useSkillsStore } from "@/stores/skillsStore";
import { revealItemInDir } from "@tauri-apps/plugin-opener";
import { listSkills } from "@/lib/ai/skills/loader";
import { WorkspacePopover } from "./WorkspacePopover";
import { SkillsPopover } from "./SkillsPopover";
import { ProviderIcon } from "@/components/common/ProviderIcon";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

/** IME 刚结束组合后的一小段时间内不把 Enter 当作发送（避免确认拼音/英文时误发） */
const IME_COMMIT_GRACE_MS = 150;

/** 上下文用量环形指示器，0–100% */
function ContextRing({ percent }: { percent: number }) {
  const size = 16;
  const r = 7;
  const stroke = 1.5;
  const circumference = 2 * Math.PI * (r - stroke / 2);
  const dashOffset = circumference - (percent / 100) * circumference;
  const c = size / 2;
  return (
    <svg width={size} height={size} className="shrink-0" aria-hidden>
      <circle
        cx={c}
        cy={c}
        r={r - stroke / 2}
        fill="none"
        stroke="currentColor"
        strokeWidth={stroke}
        className="opacity-20"
      />
      <circle
        cx={c}
        cy={c}
        r={r - stroke / 2}
        fill="none"
        stroke="currentColor"
        strokeWidth={stroke}
        strokeDasharray={circumference}
        strokeDashoffset={dashOffset}
        strokeLinecap="round"
        className="transition-[stroke-dashoffset] duration-300"
        style={{ transform: "rotate(-90deg)", transformOrigin: "center" }}
      />
    </svg>
  );
}

export function ChatInput({
  onOpenModelSelector,
}: {
  onOpenModelSelector?: () => void;
} = {}) {
  const { t } = useTranslation();
  const [message, setMessage] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const lastCompositionEndRef = useRef<number>(0);
  const sendMessage = useChatStore((s) => s.sendMessage);
  const stopGeneration = useChatStore((s) => s.stopGeneration);
  const isStreaming = useChatStore((s) => s.isStreaming);
  const modelId = useChatStore((s) => s.modelId);
  const providerType = useChatStore((s) => s.providerType);
  const messages = useChatStore((s) => s.messages);
  const error = useChatStore((s) => s.error);
  const sendMessageShortcut = useSettingsStore((s) => s.sendMessageShortcut);

  const sessionTokens = messages.reduce(
    (sum, m) => sum + (m.tokens_input ?? 0) + (m.tokens_output ?? 0),
    0,
  );
  const CONTEXT_LIMIT = 128_000;
  const contextPercent = Math.min(100, Math.round((sessionTokens / CONTEXT_LIMIT) * 100));
  const formatContextNum = (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k` : String(n));
  const contextTooltip = t("chat.contextUsedFormula", {
    used: formatContextNum(sessionTokens),
    limit: formatContextNum(CONTEXT_LIMIT),
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

  const canSend = message.trim() && modelId && !isStreaming;

  // Auto-resize textarea
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 200) + "px";
  }, [message]);

  const handleSend = () => {
    if (!canSend) return;
    const content = message.trim();
    setMessage("");
    sendMessage(content);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    // 输入法组合中：不把 Enter 当发送，让 IME 用来确认当前候选
    if (e.nativeEvent.isComposing) return;
    // 部分 IME 在 Enter 确认时先触发 compositionend 再 keydown，此时 isComposing 已为 false，短时内仍不发送
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
        {/* Error message */}
        {error && (
          <div className="mb-2 rounded-lg bg-destructive/10 px-3 py-2 text-[13px] text-destructive">
            {error}
          </div>
        )}

        {/* Input container */}
        <div className="rounded-lg border border-border transition-colors focus-within:border-ring">
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
            className="block max-h-[200px] w-full resize-none bg-transparent px-4 pt-3 pb-1 text-[14px] placeholder:text-muted-foreground focus:outline-none disabled:cursor-not-allowed disabled:opacity-50"
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
            <ToolbarIcon icon={<Paperclip />} title={t("chat.attachFiles")} />
            <ToolbarIcon icon={<Globe />} title={t("chat.webSearch")} />
            <SkillsPopover />
            {/* 模型选择 */}
            {onOpenModelSelector && (
              <button
                type="button"
                onClick={onOpenModelSelector}
                className={cn(
                  "ml-2 mr-1 flex h-7 shrink-0 items-center gap-1.5 rounded-md pl-2.5 pr-2 text-muted-foreground transition-colors hover:bg-background-tertiary hover:text-foreground",
                  !modelId &&
                    "border border-dashed border-muted-foreground/40 bg-muted/30 hover:border-muted-foreground/60 hover:bg-muted/50",
                )}
                title={modelId ?? t("chat.selectModel")}
              >
                {providerType && (
                  <ProviderIcon type={providerType} className="size-4 shrink-0" />
                )}
                <span className="max-w-[300px] truncate text-[11px] font-medium leading-none -translate-y-px">
                  {modelId ?? t("chat.selectModel")}
                </span>
              </button>
            )}

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
            <ToolbarIcon icon={<Mic />} title={t("chat.voiceInput")} />

            {/* Send / Stop button */}
            {isStreaming ? (
              <button
                onClick={stopGeneration}
                className="ml-1 flex size-7 items-center justify-center rounded-lg bg-destructive text-destructive-foreground transition-opacity"
                title={t("chat.stopGeneration")}
              >
                <Square className="size-3" strokeWidth={2} fill="currentColor" />
              </button>
            ) : (
              <button
                onClick={handleSend}
                disabled={!canSend}
                className="ml-1 flex size-7 items-center justify-center rounded-lg bg-foreground text-background transition-opacity disabled:opacity-30"
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

function ToolbarIcon({
  icon,
  title,
  onClick,
}: {
  icon: React.ReactElement;
  title: string;
  onClick?: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
      title={title}
    >
      <span className="size-4 [&>svg]:size-4 [&>svg]:stroke-[1.5]">
        {icon}
      </span>
    </button>
  );
}
