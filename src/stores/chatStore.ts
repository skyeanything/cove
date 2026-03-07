// FILE_SIZE_EXCEPTION: Core chat store requires inline compression integration across 3 methods
import { create } from "zustand";
import type { Message, Provider } from "@/db/types";
import { messageRepo } from "@/db/repos/messageRepo";
import { attachmentRepo } from "@/db/repos/attachmentRepo";
import type { Attachment } from "@/db/types";
import { providerRepo } from "@/db/repos/providerRepo";
import { settingsRepo } from "@/db/repos/settingsRepo";
import { useDataStore } from "./dataStore";
import { getModelOption } from "@/lib/ai/model-service";
import { getModel } from "@/lib/ai/provider-factory";
import { toModelMessages } from "@/lib/ai/agent";
import { maybeCompressContext } from "./chat-compression-bridge";
import { createAgentRunMetrics, reportAgentRunMetrics } from "@/lib/ai/agent-metrics";
import { generateConversationTitleFromUserQuestion } from "@/lib/ai/generate-title";
import { conversationRepo } from "@/db/repos/conversationRepo";
import { useWorkspaceStore } from "./workspaceStore";
import { getFetchBlockForText, injectFetchBlockIntoLastUserMessage } from "./chat-url-utils";
import { LAST_MODEL_KEY } from "./chat-retry-utils";
import { runStreamLoop } from "./chat-stream-runner";
import type { ToolCallInfo, DraftAttachment, MessagePart } from "./chat-types";
import { cancelAllActiveCommands } from "@/lib/ai/tools/bash";
import { runPostConversationTasks } from "@/lib/ai/post-conversation";
import { i18n } from "@/i18n";
import { buildAttachmentInjection } from "@/lib/attachment-injection";
import { buildFileContextBlock } from "@/lib/file-context-injection";
import { useFilePreviewStore } from "@/stores/filePreviewStore";
import type { UserContent } from "ai";

export type { ToolCallInfo, DraftAttachment, MessagePart };

const STREAM_RESET = {
  isStreaming: false,
  streamingConversationId: null as string | null,
  streamingContent: "",
  streamingReasoning: "",
  streamingToolCalls: [] as ToolCallInfo[],
  streamingParts: [] as MessagePart[],
  abortController: null,
} as const;

/** Try to compress context if needed; returns { messages, summaryUpTo } */
async function tryCompress(
  msgs: Message[], convId: string, provider: Provider, modelId: string,
  setFn: (s: Partial<ChatState>) => void, getFn: () => ChatState,
): Promise<{ messages: Message[]; summaryUpTo?: string }> {
  if (getFn().isCompressing) return { messages: msgs };
  setFn({ isCompressing: true, compressionNotice: null });
  try {
    const opt = getModelOption(provider, modelId);
    const ctxWin = opt?.context_window ?? 128_000;
    const result = await maybeCompressContext(msgs, convId, ctxWin, getModel(provider, modelId));
    if (result.compressed) {
      setFn({ messages: result.messages, compressionNotice: "compressed", summaryUpTo: result.summaryUpTo ?? null });
      return { messages: result.messages, summaryUpTo: result.summaryUpTo };
    }
  } finally {
    setFn({ isCompressing: false });
  }
  return { messages: msgs };
}

interface ChatState {
  messages: Message[];
  attachmentsByMessage: Record<string, Attachment[]>;
  draftAttachments: DraftAttachment[];
  isStreaming: boolean;
  /** ID of the conversation currently being streamed; null when idle */
  streamingConversationId: string | null;
  streamingContent: string;
  streamingReasoning: string;
  streamingToolCalls: ToolCallInfo[];
  streamingParts: MessagePart[];
  abortController: AbortController | null;
  error: string | null;
  isCompressing: boolean;
  compressionNotice: string | null;
  /** Persisted summary_up_to from the conversation — messages before this are covered by summary */
  summaryUpTo: string | null;
  modelId: string | null;
  providerId: string | null;
  providerType: string | null;

  loadMessages: (conversationId: string) => Promise<void>;
  selectModel: (providerId: string, modelId: string, providerType: string) => void;
  clearModelSelection: () => Promise<void>;
  restoreLastModel: () => Promise<void>;
  sendMessage: (content: string) => Promise<void>;
  addDraftAttachments: (attachments: DraftAttachment[]) => void;
  removeDraftAttachment: (attachmentId: string) => void;
  clearDraftAttachments: () => void;
  stopGeneration: () => void;
  regenerateMessage: (messageId: string) => Promise<void>;
  editAndResend: (messageId: string, newContent: string) => Promise<void>;
  reset: () => void;
}

export const useChatStore = create<ChatState>()((set, get) => ({
  messages: [],
  attachmentsByMessage: {},
  draftAttachments: [],
  isStreaming: false,
  streamingConversationId: null,
  streamingContent: "",
  streamingReasoning: "",
  streamingToolCalls: [],
  streamingParts: [],
  abortController: null,
  error: null,
  isCompressing: false,
  compressionNotice: null,
  summaryUpTo: null,
  modelId: null,
  providerId: null,
  providerType: null,

  async loadMessages(conversationId: string) {
    const [messages, conversation] = await Promise.all([
      messageRepo.getByConversation(conversationId),
      conversationRepo.getById(conversationId),
    ]);
    const attachmentsByMessage: Record<string, Attachment[]> = {};
    await Promise.all(
      messages.map(async (message) => {
        const attachments = await attachmentRepo.getByMessage(message.id);
        if (attachments.length > 0) attachmentsByMessage[message.id] = attachments;
      }),
    );
    set({ messages, attachmentsByMessage, draftAttachments: [], error: null, summaryUpTo: conversation?.summary_up_to ?? null });
    void useWorkspaceStore.getState().loadFromConversation(conversationId);
  },

  selectModel(providerId: string, modelId: string, providerType: string) {
    set({ providerId, modelId, providerType });
    settingsRepo.set(LAST_MODEL_KEY, JSON.stringify({ providerId, modelId, providerType }));
  },

  async clearModelSelection() {
    set({ modelId: null, providerId: null, providerType: null });
    await settingsRepo.delete(LAST_MODEL_KEY);
  },

  async restoreLastModel() {
    if (get().modelId) return;
    const raw = await settingsRepo.get(LAST_MODEL_KEY);
    if (!raw) return;
    try {
      const { providerId, modelId, providerType } = JSON.parse(raw) as { providerId: string; modelId: string; providerType: string };
      if (providerId && modelId && providerType) set({ providerId, modelId, providerType });
    } catch { /* ignore invalid or legacy format */ }
  },

  async sendMessage(content: string) {
    const { modelId, providerId, providerType, messages, draftAttachments } = get();
    const trimmedContent = content.trim();
    const titleSource = trimmedContent || (draftAttachments.length > 0
      ? i18n.t("chat.attachmentTitle", { names: draftAttachments.map((a) => a.name || i18n.t("chat.unnamedFile")).slice(0, 3).join(", ") })
      : "");
    if (!trimmedContent && draftAttachments.length === 0) return;
    if (!modelId) { set({ error: "Please select a model first." }); return; }

    const allProviders = await providerRepo.getAll();
    let provider = providerId ? allProviders.find((p) => p.id === providerId) : undefined;
    if (!provider && providerType) provider = allProviders.find((p) => p.type === providerType && p.enabled);
    if (!provider) {
      set({ error: `Provider "${providerType}" not configured. Please open Settings (⌘,) and add an API key.` });
      return;
    }

    const dataStore = useDataStore.getState();
    let conversationId: string;
    let updatedMessages: Message[];
    let isNewConversation = false;
    // Filter out failed attachments before persisting and injecting
    const readyAttachments = draftAttachments.filter((a) => a.status !== "error");
    try {
      conversationId = dataStore.activeConversationId ?? "";
      if (!conversationId) {
        isNewConversation = true;
        conversationId = crypto.randomUUID();
        const title = titleSource.slice(0, 50) || "New Chat";
        const activeWs = useWorkspaceStore.getState().activeWorkspace;
        const wsPath = activeWs && !activeWs.is_default ? activeWs.path : undefined;
        await conversationRepo.create({
          id: conversationId, assistant_id: "default", title, pinned: 0,
          provider_type: providerType ?? undefined, workspace_path: wsPath,
        });
        dataStore.setActiveConversation(conversationId);
        await dataStore.loadConversations();
      }

      const userMsg: Omit<Message, "created_at"> = {
        id: crypto.randomUUID(), conversation_id: conversationId, role: "user", content: trimmedContent,
      };
      await messageRepo.create(userMsg);
      if (readyAttachments.length > 0) {
        await Promise.all(readyAttachments.map(async (a) => attachmentRepo.create({
          id: a.id, message_id: userMsg.id, type: a.type, name: a.name,
          path: a.path, mime_type: a.mime_type, size: a.size, content: a.content,
          workspace_path: a.workspace_path, parsed_content: a.parsed_content, parsed_summary: a.parsed_summary,
        })));
      }

      updatedMessages = [...messages, { ...userMsg, created_at: new Date().toISOString() }];
      set((state) => ({
        messages: updatedMessages, draftAttachments: [],
        attachmentsByMessage: readyAttachments.length === 0 ? state.attachmentsByMessage : {
          ...state.attachmentsByMessage,
          [userMsg.id]: readyAttachments.map((a) => ({ ...a, message_id: userMsg.id, created_at: new Date().toISOString() })),
        },
        error: null,
      }));

      if (isNewConversation && provider) {
        void generateConversationTitleFromUserQuestion(conversationId, titleSource, { provider, modelId })
          .then(() => useDataStore.getState().loadConversations()).catch(() => {});
      }
      await conversationRepo.update(conversationId, { provider_type: providerType ?? undefined, model_override: modelId });
    } catch (err) {
      set({ error: err instanceof Error ? err.message : "Failed to create message" });
      return;
    }

    const abortController = new AbortController();
    set({ isStreaming: true, streamingConversationId: conversationId, streamingContent: "", streamingReasoning: "", streamingToolCalls: [], streamingParts: [], abortController });
    const runMetrics = createAgentRunMetrics({ action: "send", conversationId, modelId });

    try {
      const modelOption = getModelOption(provider, modelId);
      const modelSupportsPdfNative = modelOption?.pdf_native === true;
      const compressed = await tryCompress(updatedMessages, conversationId, provider, modelId, set, get);
      updatedMessages = compressed.messages;

      const modelMessages = toModelMessages(updatedMessages, { summaryUpTo: compressed.summaryUpTo ?? get().summaryUpTo ?? undefined });
      const fetchBlock = await getFetchBlockForText(trimmedContent);
      const wsPath = useWorkspaceStore.getState().activeWorkspace?.path;
      const fileContextBlock = wsPath
        ? await buildFileContextBlock(useFilePreviewStore.getState().selectedEntries, wsPath)
        : "";

      if (readyAttachments.length > 0) {
        const latestUserIndex = [...modelMessages].reverse().findIndex((m) => m.role === "user");
        if (latestUserIndex >= 0) {
          const index = modelMessages.length - 1 - latestUserIndex;
          const modelSupportsVision = modelOption?.vision === true || modelOption?.image_in === true;
          const injection = buildAttachmentInjection(readyAttachments, { modelSupportsVision, modelSupportsPdfNative });
          const userText = `${trimmedContent}${injection.textBlock}${fetchBlock}${fileContextBlock}`.trim();
          const nextContent: UserContent = [];
          if (userText) nextContent.push({ type: "text", text: userText });
          for (const part of injection.visionParts) nextContent.push(part);
          for (const part of injection.pdfParts) nextContent.push(part);
          if (nextContent.length > 0) {
            modelMessages[index] = { role: "user", content: nextContent };
          }
        }
      } else if (fileContextBlock || fetchBlock) {
        injectFetchBlockIntoLastUserMessage(modelMessages, fetchBlock + fileContextBlock);
      }

      const { streamResult, finalError } = await runStreamLoop(
        { provider, modelId, modelMessages, workspacePath: wsPath, abortSignal: abortController.signal, runMetrics, labelBase: `send:${provider.type}/${modelId}` },
        { onUpdate: (s) => set(s), onRateLimitRetry: (attempt) => set({ error: i18n.t("chat.rateLimitRetry", { attempt }) }) },
      );
      if (finalError) { set({ error: finalError, ...STREAM_RESET }); return; }

      const partsData = streamResult.parts.length > 0 ? JSON.stringify(streamResult.parts) : undefined;
      const assistantMsg: Omit<Message, "created_at"> = {
        id: crypto.randomUUID(), conversation_id: conversationId, role: "assistant",
        content: streamResult.content, reasoning: streamResult.reasoning || undefined, parts: partsData,
        model: modelId, tokens_input: streamResult.inputTokens, tokens_output: streamResult.outputTokens,
      };
      await messageRepo.create(assistantMsg);
      set((state) => ({ messages: [...state.messages, { ...assistantMsg, created_at: new Date().toISOString() }], ...STREAM_RESET }));
      // SOUL: fire-and-forget post-conversation tasks (summary + observation)
      runPostConversationTasks(conversationId, get().messages, getModel(provider, modelId));
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") {
        reportAgentRunMetrics(runMetrics, { aborted: true });
        const partialContent = get().streamingContent;
        if (partialContent) {
          const assistantMsg: Omit<Message, "created_at"> = {
            id: crypto.randomUUID(), conversation_id: conversationId, role: "assistant",
            content: partialContent, reasoning: get().streamingReasoning || undefined, model: modelId,
          };
          await messageRepo.create(assistantMsg);
          set((state) => ({ messages: [...state.messages, { ...assistantMsg, created_at: new Date().toISOString() }] }));
        }
        set(STREAM_RESET);
        return;
      }
      const errorMessage = err instanceof Error ? err.message : "An error occurred";
      reportAgentRunMetrics(runMetrics, { error: errorMessage });
      set({ error: errorMessage, ...STREAM_RESET });
    }
  },

  addDraftAttachments(attachments: DraftAttachment[]) {
    if (attachments.length === 0) return;
    set((state) => ({ draftAttachments: [...state.draftAttachments, ...attachments] }));
  },

  removeDraftAttachment(attachmentId: string) {
    set((state) => ({ draftAttachments: state.draftAttachments.filter((a) => a.id !== attachmentId) }));
  },

  clearDraftAttachments() { set({ draftAttachments: [] }); },

  async regenerateMessage(messageId: string) {
    const { messages } = get();
    const msgIndex = messages.findIndex((m) => m.id === messageId);
    if (msgIndex === -1) return;
    const msg = messages[msgIndex]!;
    const conversationId = msg.conversation_id;

    let userMsgIndex = msgIndex - 1;
    while (userMsgIndex >= 0 && messages[userMsgIndex]!.role !== "user") userMsgIndex--;
    if (userMsgIndex < 0) return;

    await messageRepo.deleteAfter(conversationId, msg.created_at);
    const remaining = messages.slice(0, msgIndex);
    const remainingIds = new Set(remaining.map((m) => m.id));
    const prunedAttachments = Object.fromEntries(Object.entries(get().attachmentsByMessage).filter(([id]) => remainingIds.has(id)));
    set({ messages: remaining, attachmentsByMessage: prunedAttachments });

    const { modelId, providerId, providerType } = get();
    if (!modelId) return;
    const allProviders = await providerRepo.getAll();
    let provider = providerId ? allProviders.find((p) => p.id === providerId) : undefined;
    if (!provider && providerType) provider = allProviders.find((p) => p.type === providerType && p.enabled);
    if (!provider) return;

    const abortController = new AbortController();
    set({ isStreaming: true, streamingConversationId: conversationId, streamingContent: "", streamingReasoning: "", streamingToolCalls: [], streamingParts: [], abortController });
    const runMetrics = createAgentRunMetrics({ action: "regenerate", conversationId, modelId });

    try {
      const compressed = await tryCompress(remaining, conversationId, provider, modelId, set, get);
      const modelMessages = toModelMessages(compressed.messages, { summaryUpTo: compressed.summaryUpTo ?? get().summaryUpTo ?? undefined });
      const last = compressed.messages[compressed.messages.length - 1];
      const lastUserContent = last?.role === "user" ? (last.content ?? "") : "";
      const regenFetchBlock = await getFetchBlockForText(lastUserContent);
      const regenWsPath = useWorkspaceStore.getState().activeWorkspace?.path;
      const regenFileCtx = regenWsPath
        ? await buildFileContextBlock(useFilePreviewStore.getState().selectedEntries, regenWsPath)
        : "";
      injectFetchBlockIntoLastUserMessage(modelMessages, regenFetchBlock + regenFileCtx);

      const { streamResult, finalError } = await runStreamLoop(
        { provider, modelId, modelMessages, workspacePath: regenWsPath, abortSignal: abortController.signal, runMetrics, labelBase: `regenerate:${provider.type}/${modelId}` },
        { onUpdate: (s) => set(s), onRateLimitRetry: (attempt) => set({ error: i18n.t("chat.rateLimitRetry", { attempt }) }) },
      );
      if (finalError) { set({ error: finalError, ...STREAM_RESET }); return; }

      const partsData = streamResult.parts.length > 0 ? JSON.stringify(streamResult.parts) : undefined;
      const assistantMsg: Omit<Message, "created_at"> = {
        id: crypto.randomUUID(), conversation_id: conversationId, role: "assistant",
        content: streamResult.content, reasoning: streamResult.reasoning || undefined, parts: partsData,
        model: modelId, tokens_input: streamResult.inputTokens, tokens_output: streamResult.outputTokens,
      };
      await messageRepo.create(assistantMsg);
      set((state) => ({ messages: [...state.messages, { ...assistantMsg, created_at: new Date().toISOString() }], ...STREAM_RESET }));
      runPostConversationTasks(conversationId, get().messages, getModel(provider, modelId));
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") {
        reportAgentRunMetrics(runMetrics, { aborted: true });
        set(STREAM_RESET);
        return;
      }
      reportAgentRunMetrics(runMetrics, { error: err instanceof Error ? err.message : "An error occurred" });
      set({ error: err instanceof Error ? err.message : "An error occurred", ...STREAM_RESET });
    }
  },

  async editAndResend(messageId: string, newContent: string) {
    const { messages } = get();
    const msgIndex = messages.findIndex((m) => m.id === messageId);
    if (msgIndex === -1) return;
    const msg = messages[msgIndex]!;
    const conversationId = msg.conversation_id;

    // If editing a message covered by summary, invalidate the summary
    const conversation = await conversationRepo.getById(conversationId);
    if (conversation?.summary_up_to && msg.created_at <= conversation.summary_up_to) {
      await messageRepo.deleteSummaryMessage(conversationId);
      await conversationRepo.update(conversationId, { summary_up_to: null });
      set({ summaryUpTo: null });
    }

    await messageRepo.deleteAfter(conversationId, msg.created_at);
    const remaining = messages.slice(0, msgIndex);
    const remainingIds = new Set(remaining.map((m) => m.id));
    const prunedAttachments = Object.fromEntries(Object.entries(get().attachmentsByMessage).filter(([id]) => remainingIds.has(id)));
    set({ messages: remaining, attachmentsByMessage: prunedAttachments });

    const userMsg: Omit<Message, "created_at"> = {
      id: crypto.randomUUID(), conversation_id: conversationId, role: "user", content: newContent,
    };
    await messageRepo.create(userMsg);
    let updatedMessages = [...remaining, { ...userMsg, created_at: new Date().toISOString() }];
    set({ messages: updatedMessages, error: null });

    const { modelId, providerId, providerType } = get();
    if (!modelId) return;
    const allProviders = await providerRepo.getAll();
    let provider = providerId ? allProviders.find((p) => p.id === providerId) : undefined;
    if (!provider && providerType) provider = allProviders.find((p) => p.type === providerType && p.enabled);
    if (!provider) return;

    const abortController = new AbortController();
    set({ isStreaming: true, streamingConversationId: conversationId, streamingContent: "", streamingReasoning: "", streamingToolCalls: [], streamingParts: [], abortController });
    const runMetrics = createAgentRunMetrics({ action: "edit_resend", conversationId, modelId });

    try {
      const compressed = await tryCompress(updatedMessages, conversationId, provider, modelId, set, get);
      updatedMessages = compressed.messages;
      const modelMessages = toModelMessages(updatedMessages, { summaryUpTo: compressed.summaryUpTo ?? get().summaryUpTo ?? undefined });
      const editFetchBlock = await getFetchBlockForText(newContent);
      const editWsPath = useWorkspaceStore.getState().activeWorkspace?.path;
      const editFileCtx = editWsPath
        ? await buildFileContextBlock(useFilePreviewStore.getState().selectedEntries, editWsPath)
        : "";
      injectFetchBlockIntoLastUserMessage(modelMessages, editFetchBlock + editFileCtx);

      const { streamResult, finalError } = await runStreamLoop(
        { provider, modelId, modelMessages, workspacePath: editWsPath, abortSignal: abortController.signal, runMetrics, labelBase: `edit_resend:${provider.type}/${modelId}` },
        { onUpdate: (s) => set(s), onRateLimitRetry: (attempt) => set({ error: i18n.t("chat.rateLimitRetry", { attempt }) }) },
      );
      if (finalError) { set({ error: finalError, ...STREAM_RESET }); return; }

      const partsData = streamResult.parts.length > 0 ? JSON.stringify(streamResult.parts) : undefined;
      const assistantMsg: Omit<Message, "created_at"> = {
        id: crypto.randomUUID(), conversation_id: conversationId, role: "assistant",
        content: streamResult.content, reasoning: streamResult.reasoning || undefined, parts: partsData,
        model: modelId, tokens_input: streamResult.inputTokens, tokens_output: streamResult.outputTokens,
      };
      await messageRepo.create(assistantMsg);
      set((state) => ({ messages: [...state.messages, { ...assistantMsg, created_at: new Date().toISOString() }], ...STREAM_RESET }));
      runPostConversationTasks(conversationId, get().messages, getModel(provider, modelId));
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") {
        reportAgentRunMetrics(runMetrics, { aborted: true });
        set(STREAM_RESET);
        return;
      }
      reportAgentRunMetrics(runMetrics, { error: err instanceof Error ? err.message : "An error occurred" });
      set({ error: err instanceof Error ? err.message : "An error occurred", ...STREAM_RESET });
    }
  },

  stopGeneration() {
    cancelAllActiveCommands();
    get().abortController?.abort();
  },

  reset() {
    set({ messages: [], attachmentsByMessage: {}, draftAttachments: [], error: null, isCompressing: false, compressionNotice: null, summaryUpTo: null, ...STREAM_RESET });
  },
}));
