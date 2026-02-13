import { create } from "zustand";
import type { Message } from "@/db/types";
import { messageRepo } from "@/db/repos/messageRepo";
import { providerRepo } from "@/db/repos/providerRepo";
import { settingsRepo } from "@/db/repos/settingsRepo";
import { useDataStore } from "./dataStore";
import { getModel } from "@/lib/ai/provider-factory";
import { runAgent, toModelMessages } from "@/lib/ai/agent";
import {
  createAgentRunMetrics,
  reportAgentRunMetrics,
  trackAgentPart,
} from "@/lib/ai/agent-metrics";
import { handleAgentStream } from "@/lib/ai/stream-handler";
import { buildSystemPrompt } from "@/lib/ai/context";
import { generateConversationTitleFromUserQuestion } from "@/lib/ai/generate-title";
import { getAgentTools } from "@/lib/ai/tools";
import { getEnabledSkillNames } from "./skillsStore";
import { conversationRepo } from "@/db/repos/conversationRepo";
import { useWorkspaceStore } from "./workspaceStore";

const LAST_MODEL_KEY = "lastModel";

export interface ToolCallInfo {
  id: string;
  toolName: string;
  args: Record<string, unknown>;
  result?: unknown;
  isLoading: boolean;
  /** 开始执行时间戳，用于计算耗时 */
  startTime?: number;
  /** 执行耗时（毫秒），仅当耗时较长时展示 */
  durationMs?: number;
  /** 流式参数 JSON 字符串（有值时先展示原始 JSON，流式结束后再展示格式化内容） */
  argsJsonStream?: string;
}

/** 一条消息内的有序片段：文本与工具调用按出现顺序交错 */
export type MessagePart =
  | { type: "text"; text: string }
  | { type: "reasoning"; text: string }
  | ({ type: "tool" } & ToolCallInfo);

interface ChatState {
  messages: Message[];
  isStreaming: boolean;
  streamingContent: string;
  streamingReasoning: string;
  streamingToolCalls: ToolCallInfo[];
  /** 当前流式消息的有序片段（文本 + 工具调用交错），用于 UI 按序展示 */
  streamingParts: MessagePart[];
  abortController: AbortController | null;
  error: string | null;
  modelId: string | null;
  providerId: string | null;
  providerType: string | null;

  loadMessages: (conversationId: string) => Promise<void>;
  selectModel: (providerId: string, modelId: string, providerType: string) => void;
  /** 应用启动时从 settings 恢复上次使用的模型（当前未选模型时调用） */
  restoreLastModel: () => Promise<void>;
  sendMessage: (content: string) => Promise<void>;
  stopGeneration: () => void;
  regenerateMessage: (messageId: string) => Promise<void>;
  editAndResend: (messageId: string, newContent: string) => Promise<void>;
  reset: () => void;
}

export const useChatStore = create<ChatState>()((set, get) => ({
  messages: [],
  isStreaming: false,
  streamingContent: "",
  streamingReasoning: "",
  streamingToolCalls: [],
  streamingParts: [],
  abortController: null,
  error: null,
  modelId: null,
  providerId: null,
  providerType: null,

  async loadMessages(conversationId: string) {
    const messages = await messageRepo.getByConversation(conversationId);
    set({ messages, error: null });
    await useWorkspaceStore.getState().loadFromConversation(conversationId);
  },

  selectModel(providerId: string, modelId: string, providerType: string) {
    set({ providerId, modelId, providerType });
    settingsRepo.set(
      LAST_MODEL_KEY,
      JSON.stringify({ providerId, modelId, providerType }),
    );
  },

  async restoreLastModel() {
    if (get().modelId) return; // 已有选中模型则不覆盖
    const raw = await settingsRepo.get(LAST_MODEL_KEY);
    if (!raw) return;
    try {
      const { providerId, modelId, providerType } = JSON.parse(raw) as {
        providerId: string;
        modelId: string;
        providerType: string;
      };
      if (providerId && modelId && providerType) {
        set({ providerId, modelId, providerType });
      }
    } catch {
      // 忽略无效或旧格式
    }
  },

  async sendMessage(content: string) {
    const { modelId, providerId, providerType, messages } = get();
    if (!modelId) {
      set({ error: "Please select a model first." });
      return;
    }

    // Read providers directly from DB — settings window is a separate
    // Tauri WebviewWindow with its own JS context / Zustand store,
    // so the in-memory store may be stale.
    const allProviders = await providerRepo.getAll();

    let provider = providerId
      ? allProviders.find((p) => p.id === providerId)
      : undefined;
    if (!provider && providerType) {
      provider = allProviders.find((p) => p.type === providerType && p.enabled);
    }
    if (!provider) {
      set({ error: `Provider "${providerType}" not configured. Please open Settings (⌘,) and add an API key.` });
      return;
    }

    const dataStore = useDataStore.getState();

    // Ensure conversation exists
    let conversationId: string;
    let updatedMessages: Message[];
    let isNewConversation = false;
    try {
      conversationId = dataStore.activeConversationId ?? "";
      if (!conversationId) {
        isNewConversation = true;
        conversationId = crypto.randomUUID();
        const title = content.slice(0, 50);
        const activeWs = useWorkspaceStore.getState().activeWorkspace;
        await conversationRepo.create({
          id: conversationId,
          assistant_id: "default",
          title,
          pinned: 0,
          provider_type: providerType ?? undefined,
          workspace_path: activeWs?.path,
        });
        dataStore.setActiveConversation(conversationId);
        await dataStore.loadConversations();
      }

      // Create user message
      const userMsg: Omit<Message, "created_at"> = {
        id: crypto.randomUUID(),
        conversation_id: conversationId,
        role: "user",
        content,
      };
      await messageRepo.create(userMsg);

      updatedMessages = [...messages, { ...userMsg, created_at: new Date().toISOString() }];
      set({ messages: updatedMessages, error: null });

      // 新会话：用用户首条问题异步生成标题
      if (isNewConversation && provider) {
        void generateConversationTitleFromUserQuestion(conversationId, content, { provider, modelId })
          .then(() => useDataStore.getState().loadConversations())
          .catch(() => {});
      }

      // Update conversation timestamp
      await conversationRepo.update(conversationId, {});
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Failed to create message";
      set({ error: errorMessage });
      return;
    }

    // Start streaming
    const abortController = new AbortController();
    set({
      isStreaming: true,
      streamingContent: "",
      streamingReasoning: "",
      streamingToolCalls: [],
      streamingParts: [],
      abortController,
    });
    const runMetrics = createAgentRunMetrics({
      action: "send",
      conversationId,
      modelId,
    });

    try {
      const model = getModel(provider, modelId);
      const modelMessages = toModelMessages(updatedMessages);
      const enabledSkillNames = await getEnabledSkillNames();
      const tools = getAgentTools(enabledSkillNames);

      const result = runAgent({
        model,
        messages: modelMessages,
        system: buildSystemPrompt({
          workspacePath: useWorkspaceStore.getState().activeWorkspace?.path,
        }),
        tools,
        abortSignal: abortController.signal,
      });
      const streamResult = await handleAgentStream(
        result,
        (streamingState) => set(streamingState),
        (partType) => trackAgentPart(runMetrics, partType),
      );

      if (streamResult.error) {
        reportAgentRunMetrics(runMetrics, { error: streamResult.error });
        set({
          error: streamResult.error,
          isStreaming: false,
          streamingContent: "",
          streamingReasoning: "",
          streamingToolCalls: [],
          streamingParts: [],
          abortController: null,
        });
        return;
      }
      reportAgentRunMetrics(runMetrics, {
        inputTokens: streamResult.inputTokens,
        outputTokens: streamResult.outputTokens,
      });

      // 有序片段（文本与工具交错）持久化，供 UI 按序展示
      const partsData = streamResult.parts.length > 0 ? JSON.stringify(streamResult.parts) : undefined;

      const assistantMsg: Omit<Message, "created_at"> = {
        id: crypto.randomUUID(),
        conversation_id: conversationId,
        role: "assistant",
        content: streamResult.content,
        reasoning: streamResult.reasoning || undefined,
        parts: partsData,
        model: modelId,
        tokens_input: streamResult.inputTokens,
        tokens_output: streamResult.outputTokens,
      };
      await messageRepo.create(assistantMsg);

      set((state) => ({
        messages: [...state.messages, { ...assistantMsg, created_at: new Date().toISOString() }],
        isStreaming: false,
        streamingContent: "",
        streamingReasoning: "",
        streamingToolCalls: [],
        streamingParts: [],
        abortController: null,
      }));
    } catch (err) {
      // Don't show error for abort
      if (err instanceof Error && err.name === "AbortError") {
        reportAgentRunMetrics(runMetrics, { aborted: true });
        // Save partial content if any
        const partialContent = get().streamingContent;
        if (partialContent) {
          const assistantMsg: Omit<Message, "created_at"> = {
            id: crypto.randomUUID(),
            conversation_id: conversationId,
            role: "assistant",
            content: partialContent,
            reasoning: get().streamingReasoning || undefined,
            model: modelId,
          };
          await messageRepo.create(assistantMsg);
          set((state) => ({
            messages: [...state.messages, { ...assistantMsg, created_at: new Date().toISOString() }],
          }));
        }
        set({
          isStreaming: false,
          streamingContent: "",
          streamingReasoning: "",
          streamingToolCalls: [],
          streamingParts: [],
          abortController: null,
        });
        return;
      }

      const errorMessage = err instanceof Error ? err.message : "An error occurred";
      reportAgentRunMetrics(runMetrics, { error: errorMessage });
      set({
        error: errorMessage,
        isStreaming: false,
        streamingContent: "",
        streamingReasoning: "",
        streamingToolCalls: [],
        streamingParts: [],
        abortController: null,
      });
    }
  },

  async regenerateMessage(messageId: string) {
    const { messages } = get();
    const msgIndex = messages.findIndex((m) => m.id === messageId);
    if (msgIndex === -1) return;

    const msg = messages[msgIndex]!;
    const conversationId = msg.conversation_id;

    // Find the user message before this assistant message
    let userMsgIndex = msgIndex - 1;
    while (userMsgIndex >= 0 && messages[userMsgIndex]!.role !== "user") {
      userMsgIndex--;
    }
    if (userMsgIndex < 0) return;

    // Delete from the assistant message onward
    await messageRepo.deleteAfter(conversationId, msg.created_at);

    // Keep messages before the deleted one
    const remaining = messages.slice(0, msgIndex);
    set({ messages: remaining });

    // We need to re-run the agent with the remaining messages (which include the user msg)
    const { modelId, providerId, providerType } = get();
    if (!modelId) return;

    const allProviders = await providerRepo.getAll();
    let provider = providerId
      ? allProviders.find((p) => p.id === providerId)
      : undefined;
    if (!provider && providerType) {
      provider = allProviders.find((p) => p.type === providerType && p.enabled);
    }
    if (!provider) return;

    const abortController = new AbortController();
    set({
      isStreaming: true,
      streamingContent: "",
      streamingReasoning: "",
      streamingToolCalls: [],
      streamingParts: [],
      abortController,
    });
    const runMetrics = createAgentRunMetrics({
      action: "regenerate",
      conversationId,
      modelId,
    });

    try {
      const model = getModel(provider, modelId);
      const modelMessages = toModelMessages(remaining);
      const enabledSkillNames = await getEnabledSkillNames();
      const tools = getAgentTools(enabledSkillNames);

      const result = runAgent({
        model,
        messages: modelMessages,
        system: buildSystemPrompt({
          workspacePath: useWorkspaceStore.getState().activeWorkspace?.path,
        }),
        tools,
        abortSignal: abortController.signal,
      });
      const streamResult = await handleAgentStream(
        result,
        (streamingState) => set(streamingState),
        (partType) => trackAgentPart(runMetrics, partType),
      );

      if (streamResult.error) {
        reportAgentRunMetrics(runMetrics, { error: streamResult.error });
        set({ error: streamResult.error, isStreaming: false, streamingContent: "", streamingReasoning: "", streamingToolCalls: [], streamingParts: [], abortController: null });
        return;
      }
      reportAgentRunMetrics(runMetrics, {
        inputTokens: streamResult.inputTokens,
        outputTokens: streamResult.outputTokens,
      });

      const partsData = streamResult.parts.length > 0 ? JSON.stringify(streamResult.parts) : undefined;

      const assistantMsg: Omit<Message, "created_at"> = {
        id: crypto.randomUUID(),
        conversation_id: conversationId,
        role: "assistant",
        content: streamResult.content,
        reasoning: streamResult.reasoning || undefined,
        parts: partsData,
        model: modelId,
        tokens_input: streamResult.inputTokens,
        tokens_output: streamResult.outputTokens,
      };
      await messageRepo.create(assistantMsg);

      set((state) => ({
        messages: [...state.messages, { ...assistantMsg, created_at: new Date().toISOString() }],
        isStreaming: false,
        streamingContent: "",
        streamingReasoning: "",
        streamingToolCalls: [],
        streamingParts: [],
        abortController: null,
      }));
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") {
        reportAgentRunMetrics(runMetrics, { aborted: true });
        set({ isStreaming: false, streamingContent: "", streamingReasoning: "", streamingToolCalls: [], streamingParts: [], abortController: null });
        return;
      }
      reportAgentRunMetrics(runMetrics, {
        error: err instanceof Error ? err.message : "An error occurred",
      });
      set({ error: err instanceof Error ? err.message : "An error occurred", isStreaming: false, streamingContent: "", streamingReasoning: "", streamingToolCalls: [], streamingParts: [], abortController: null });
    }
  },

  async editAndResend(messageId: string, newContent: string) {
    const { messages } = get();
    const msgIndex = messages.findIndex((m) => m.id === messageId);
    if (msgIndex === -1) return;

    const msg = messages[msgIndex]!;
    const conversationId = msg.conversation_id;

    // Delete this message and everything after
    await messageRepo.deleteAfter(conversationId, msg.created_at);

    // Keep messages before the deleted one
    const remaining = messages.slice(0, msgIndex);
    set({ messages: remaining });

    // Send the new content as if it were a new message
    // But we need to manually create the user message and run agent
    const userMsg: Omit<Message, "created_at"> = {
      id: crypto.randomUUID(),
      conversation_id: conversationId,
      role: "user",
      content: newContent,
    };
    await messageRepo.create(userMsg);

    const updatedMessages = [...remaining, { ...userMsg, created_at: new Date().toISOString() }];
    set({ messages: updatedMessages, error: null });

    // Now run the agent
    const { modelId, providerId, providerType } = get();
    if (!modelId) return;

    const allProviders = await providerRepo.getAll();
    let provider = providerId
      ? allProviders.find((p) => p.id === providerId)
      : undefined;
    if (!provider && providerType) {
      provider = allProviders.find((p) => p.type === providerType && p.enabled);
    }
    if (!provider) return;

    const abortController = new AbortController();
    set({
      isStreaming: true,
      streamingContent: "",
      streamingReasoning: "",
      streamingToolCalls: [],
      streamingParts: [],
      abortController,
    });
    const runMetrics = createAgentRunMetrics({
      action: "edit_resend",
      conversationId,
      modelId,
    });

    try {
      const model = getModel(provider, modelId);
      const modelMessages = toModelMessages(updatedMessages);
      const enabledSkillNames = await getEnabledSkillNames();
      const tools = getAgentTools(enabledSkillNames);

      const result = runAgent({
        model,
        messages: modelMessages,
        system: buildSystemPrompt({
          workspacePath: useWorkspaceStore.getState().activeWorkspace?.path,
        }),
        tools,
        abortSignal: abortController.signal,
      });
      const streamResult = await handleAgentStream(
        result,
        (streamingState) => set(streamingState),
        (partType) => trackAgentPart(runMetrics, partType),
      );

      if (streamResult.error) {
        reportAgentRunMetrics(runMetrics, { error: streamResult.error });
        set({ error: streamResult.error, isStreaming: false, streamingContent: "", streamingReasoning: "", streamingToolCalls: [], streamingParts: [], abortController: null });
        return;
      }
      reportAgentRunMetrics(runMetrics, {
        inputTokens: streamResult.inputTokens,
        outputTokens: streamResult.outputTokens,
      });

      const partsData = streamResult.parts.length > 0 ? JSON.stringify(streamResult.parts) : undefined;

      const assistantMsg: Omit<Message, "created_at"> = {
        id: crypto.randomUUID(),
        conversation_id: conversationId,
        role: "assistant",
        content: streamResult.content,
        reasoning: streamResult.reasoning || undefined,
        parts: partsData,
        model: modelId,
        tokens_input: streamResult.inputTokens,
        tokens_output: streamResult.outputTokens,
      };
      await messageRepo.create(assistantMsg);

      set((state) => ({
        messages: [...state.messages, { ...assistantMsg, created_at: new Date().toISOString() }],
        isStreaming: false,
        streamingContent: "",
        streamingReasoning: "",
        streamingToolCalls: [],
        streamingParts: [],
        abortController: null,
      }));
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") {
        reportAgentRunMetrics(runMetrics, { aborted: true });
        set({ isStreaming: false, streamingContent: "", streamingReasoning: "", streamingToolCalls: [], streamingParts: [], abortController: null });
        return;
      }
      reportAgentRunMetrics(runMetrics, {
        error: err instanceof Error ? err.message : "An error occurred",
      });
      set({ error: err instanceof Error ? err.message : "An error occurred", isStreaming: false, streamingContent: "", streamingReasoning: "", streamingToolCalls: [], streamingParts: [], abortController: null });
    }
  },

  stopGeneration() {
    const { abortController } = get();
    if (abortController) {
      abortController.abort();
    }
  },

  reset() {
    set({
      messages: [],
      isStreaming: false,
      streamingContent: "",
      streamingReasoning: "",
      streamingParts: [],
      streamingToolCalls: [],
      abortController: null,
      error: null,
    });
  },
}));
