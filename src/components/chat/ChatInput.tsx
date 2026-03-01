import {
  CornerDownRight,
  Box,
  Copy,
} from "lucide-react";
import { useState, useRef, useEffect, useMemo, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { useChatStore } from "@/stores/chatStore";
import { useDataStore } from "@/stores/dataStore";
import { useWorkspaceStore } from "@/stores/workspaceStore";
import { useSettingsStore } from "@/stores/settingsStore";
import { useSkillsStore } from "@/stores/skillsStore";
import { getModelOption } from "@/lib/ai/model-service";
import { estimateNextTurnTokens } from "@/lib/ai/context-compression";
import { revealItemInDir } from "@tauri-apps/plugin-opener";
import { listSkills } from "@/lib/ai/skills/loader";
import { USER_VISIBLE_TOOLS } from "@/lib/ai/tools/tool-meta";
import { useMentionDetect } from "@/hooks/useMentionDetect";
import { useMentionFiles } from "@/hooks/useMentionFiles";
import { WorkspacePopover } from "./WorkspacePopover";
import { AttachmentBar } from "./AttachmentBar";
import { MentionPopover, buildMentionItems } from "./MentionPopover";
import { ChatToolbar } from "./ChatToolbar";
import { isImageAttachment } from "@/lib/attachment-utils";
import { pickAndSaveAttachments } from "@/hooks/useAttachFiles";
import {
  isImageFile,
  imageFilesToDraftAttachments,
  nonImageFilesToDraftAttachments,
} from "@/lib/chat-input-utils";
import type { SkillMeta } from "@/lib/ai/skills/types";

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
  const [mentionActiveIndex, setMentionActiveIndex] = useState(0);
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
  const modelSelectorOpen = onModelSelectorOpenChange != null ? (modelSelectorOpenProp ?? false) : modelSelectorOpenLocal;
  const setModelSelectorOpen = onModelSelectorOpenChange ?? setModelSelectorOpenLocal;
  const messages = useChatStore((s) => s.messages);
  const error = useChatStore((s) => s.error);
  const isCompressing = useChatStore((s) => s.isCompressing);
  const sendMessageShortcut = useSettingsStore((s) => s.sendMessageShortcut);
  const activeWorkspace = useWorkspaceStore((s) => s.activeWorkspace);
  const externalSkills = useSkillsStore((s) => s.externalSkills);

  // --- @mention system ---
  const { mentionState, updateMention, closeMention, insertMention } = useMentionDetect();

  const allSkillMetas = useMemo<SkillMeta[]>(() => {
    const seen = new Set<string>();
    const metas: SkillMeta[] = [];
    for (const m of listSkills()) {
      if (!seen.has(m.name)) { seen.add(m.name); metas.push(m); }
    }
    for (const { skill } of externalSkills) {
      if (!seen.has(skill.meta.name)) { seen.add(skill.meta.name); metas.push(skill.meta); }
    }
    return metas;
  }, [externalSkills]);

  const mentionQuery = mentionState.query.toLowerCase();
  const filteredTools = useMemo(
    () => mentionQuery ? USER_VISIBLE_TOOLS.filter((t) => t.id.includes(mentionQuery) || t.name.toLowerCase().includes(mentionQuery)) : USER_VISIBLE_TOOLS,
    [mentionQuery],
  );
  const filteredSkills = useMemo(
    () => mentionQuery ? allSkillMetas.filter((s) => s.name.includes(mentionQuery)) : allSkillMetas,
    [mentionQuery, allSkillMetas],
  );
  const mentionFiles = useMentionFiles(activeWorkspace?.path ?? null, mentionQuery, mentionState.open);
  const mentionItems = useMemo(() => buildMentionItems(filteredTools, filteredSkills, mentionFiles), [filteredTools, filteredSkills, mentionFiles]);

  // Reset active index when items change
  useEffect(() => { setMentionActiveIndex(0); }, [mentionItems.length]);

  const handleMentionSelect = useCallback((type: "tool" | "skill" | "file", id: string) => {
    const cursorPos = textareaRef.current?.selectionStart ?? message.length;
    const { newMessage, newCursorPos } = insertMention(message, cursorPos, type, id);
    setMessage(newMessage);
    requestAnimationFrame(() => {
      textareaRef.current?.setSelectionRange(newCursorPos, newCursorPos);
      textareaRef.current?.focus();
    });
  }, [message, insertMention]);

  // --- /slash commands ---
  const skillNames = useMemo(() => {
    const seen = new Set<string>();
    const names: string[] = [];
    for (const m of listSkills()) { if (!seen.has(m.name)) { seen.add(m.name); names.push(m.name); } }
    for (const { skill } of externalSkills) { if (!seen.has(skill.meta.name)) { seen.add(skill.meta.name); names.push(skill.meta.name); } }
    return names.sort((a, b) => a.localeCompare(b));
  }, [externalSkills]);
  const showSlashCommands = message.startsWith("/");
  const slashFilter = message.length > 1 ? message.slice(1).toLowerCase() : "";
  const slashFilteredSkills = useMemo(
    () => slashFilter ? skillNames.filter((n) => n.toLowerCase().includes(slashFilter)) : skillNames,
    [skillNames, slashFilter],
  );

  // --- context / model ---
  const sessionTokens = estimateNextTurnTokens(messages, message.length);
  const contextLimit = useMemo(() => {
    if (!modelId || !providerId) return 0;
    const prov = providers.find((p) => p.id === providerId);
    if (!prov) return 0;
    return getModelOption(prov, modelId)?.context_window ?? 128_000;
  }, [modelId, providerId, providers]);
  const contextPercent = contextLimit === 0 ? 0 : Math.min(100, Math.round((sessionTokens / contextLimit) * 100));
  const fmtNum = (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k` : String(n));
  const contextTooltip = t("chat.contextUsedFormula", { used: fmtNum(sessionTokens), limit: fmtNum(contextLimit), percent: contextPercent });

  const provider = useMemo(() => (providerId ? providers.find((p) => p.id === providerId) : undefined), [providerId, providers]);
  const modelSupportsVision = useMemo(() => {
    if (!provider || !modelId) return false;
    const opt = getModelOption(provider, modelId);
    return opt?.vision === true || opt?.image_in === true;
  }, [provider, modelId]);
  const canSend = Boolean((message.trim() || draftAttachments.length > 0) && modelId && !isStreaming);

  useEffect(() => { const el = textareaRef.current; if (!el) return; el.style.height = "auto"; el.style.height = Math.min(el.scrollHeight, 200) + "px"; }, [message]);

  const handleAttachFiles = async () => { await pickAndSaveAttachments(addDraftAttachments, setAttachError); };

  const handleSend = () => {
    if (!canSend) return;
    if (draftAttachments.some((a) => isImageAttachment(a)) && !modelSupportsVision) { setAttachError(t("chat.visionNotSupported")); return; }
    setAttachError(null);
    setMessage("");
    sendMessage(message.trim());
  };

  const handlePaste = async (e: React.ClipboardEvent) => {
    const items = e.clipboardData?.items; if (!items?.length) return;
    const files: File[] = [];
    for (let i = 0; i < items.length; i++) { const item = items[i]; if (item?.kind === "file") { const f = item.getAsFile(); if (f && isImageFile(f)) files.push(f); } }
    if (files.length === 0) return;
    e.preventDefault();
    const attachments = await imageFilesToDraftAttachments(files);
    if (attachments.length > 0) { addDraftAttachments(attachments); setAttachError(null); }
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault(); e.stopPropagation();
    const files = e.dataTransfer?.files; if (!files?.length) return;
    const all = [...(await imageFilesToDraftAttachments(Array.from(files))), ...(await nonImageFilesToDraftAttachments(Array.from(files)))];
    if (all.length > 0) { addDraftAttachments(all); setAttachError(null); }
  };

  const handleDragOver = (e: React.DragEvent) => { e.preventDefault(); e.dataTransfer.dropEffect = "copy"; };

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    setMessage(val);
    updateMention(val, e.target.selectionStart ?? val.length);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.nativeEvent.isComposing) return;
    if (e.key === "Enter" && Date.now() - lastCompositionEndRef.current < IME_COMMIT_GRACE_MS) return;

    // Mention navigation
    if (mentionState.open && mentionItems.length > 0) {
      if (e.key === "ArrowDown") { e.preventDefault(); setMentionActiveIndex((i) => (i + 1) % mentionItems.length); return; }
      if (e.key === "ArrowUp") { e.preventDefault(); setMentionActiveIndex((i) => (i - 1 + mentionItems.length) % mentionItems.length); return; }
      if (e.key === "Enter" || e.key === "Tab") { e.preventDefault(); const item = mentionItems[mentionActiveIndex]; if (item) handleMentionSelect(item.type, item.id); return; }
      if (e.key === "Escape") { e.preventDefault(); closeMention(); return; }
    }

    if (sendMessageShortcut === "enter") {
      if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); }
    } else {
      if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); handleSend(); }
    }
  };

  const handleRevealWorkspace = async () => { if (activeWorkspace) await revealItemInDir(activeWorkspace.path); };
  const handleCopyWorkspacePath = () => { if (activeWorkspace) navigator.clipboard.writeText(activeWorkspace.path); };

  return (
    <div className="shrink-0 px-4 pb-3 pt-1">
      <div className="mx-auto max-w-[896px]">
        {isCompressing && (
          <div className="mb-2 rounded-lg bg-accent/20 border border-accent/30 px-3 py-2 text-[13px] font-medium text-accent">{t("chat.contextCompressing")}</div>
        )}
        {(error || attachError) && !isCompressing && (
          <div className="mb-2 rounded-lg bg-destructive/10 px-3 py-2 text-[13px] text-destructive">{error ?? attachError}</div>
        )}

        <div className="rounded-lg border border-border transition-colors focus-within:border-ring" onDrop={handleDrop} onDragOver={handleDragOver}>
          <AttachmentBar attachments={draftAttachments} onRemove={removeDraftAttachment} />
          {activeWorkspace && (
            <div className="flex items-center gap-1.5 border-b border-border/50 px-3 py-1">
              <WorkspacePopover trigger={
                <button type="button" className="flex shrink-0 cursor-pointer items-center gap-1 rounded px-0.5 py-0.5 text-muted-foreground/70 hover:bg-background-tertiary hover:text-foreground" title={t("chat.workspace")}>
                  <Box className="size-3.5" strokeWidth={2.5} />
                  <span className="text-[10px] font-medium tracking-wide uppercase">{t("chat.workspace")}</span>
                </button>
              } />
              <span className="min-w-0 truncate text-[11px] text-muted-foreground">{activeWorkspace.path}</span>
              <div className="ml-auto flex shrink-0 items-center gap-0.5">
                <button type="button" onClick={handleCopyWorkspacePath} className="cursor-pointer rounded p-0.5 text-muted-foreground hover:bg-background-tertiary hover:text-foreground" title={t("chat.copyPath")}>
                  <Copy className="size-3" strokeWidth={1.5} />
                </button>
                <button type="button" onClick={handleRevealWorkspace} className="cursor-pointer rounded p-0.5 text-muted-foreground hover:bg-background-tertiary hover:text-foreground" title={t("chat.revealInFolder")}>
                  <CornerDownRight className="size-3" strokeWidth={1.5} />
                </button>
              </div>
            </div>
          )}

          <textarea
            ref={textareaRef} value={message} onChange={handleChange}
            onCompositionEnd={() => { lastCompositionEndRef.current = Date.now(); }}
            onKeyDown={handleKeyDown} onPaste={handlePaste}
            placeholder={modelId ? t("chat.placeholder", { shortcut: sendMessageShortcut === "enter" ? t("settings.general.shortcutEnter") : t("settings.general.shortcutModifierEnter") }) : t("chat.placeholderNoModel")}
            rows={1} disabled={!modelId}
            className="block min-h-[44px] max-h-[200px] w-full resize-none bg-transparent px-4 pt-3 pb-1 text-[14px] leading-[1.5] placeholder:text-muted-foreground focus:outline-none disabled:cursor-not-allowed disabled:opacity-50"
          />

          {showSlashCommands && slashFilteredSkills.length > 0 && (
            <div className="max-h-48 overflow-auto border-t border-border bg-background-secondary/80">
              <ul className="py-1">
                {slashFilteredSkills.slice(0, 10).map((name) => (
                  <li key={name}>
                    <button type="button" className="w-full px-4 py-2 text-left text-[13px] hover:bg-background-tertiary"
                      onMouseDown={(e) => { e.preventDefault(); setMessage(`/skill:${name} `); }}>
                      /skill:{name}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {!showSlashCommands && (
            <MentionPopover
              open={mentionState.open} query={mentionState.query}
              tools={filteredTools} skills={filteredSkills} files={mentionFiles}
              activeIndex={mentionActiveIndex} onSelect={handleMentionSelect} onClose={closeMention}
            />
          )}

          <ChatToolbar
            isStreaming={isStreaming} canSend={canSend}
            contextPercent={contextPercent} contextTooltip={contextTooltip}
            modelSelectorOpen={modelSelectorOpen} onModelSelectorOpenChange={setModelSelectorOpen}
            onAttachFiles={handleAttachFiles} onSend={handleSend} onStop={stopGeneration}
          />
        </div>
      </div>
    </div>
  );
}
