import { create } from "zustand";
import type { Message } from "@/db/types";
import { messageRepo } from "@/db/repos/messageRepo";
import { attachmentRepo } from "@/db/repos/attachmentRepo";
import type { Attachment } from "@/db/types";
import { providerRepo } from "@/db/repos/providerRepo";
import { settingsRepo } from "@/db/repos/settingsRepo";
import { useDataStore } from "./dataStore";
import { getModel } from "@/lib/ai/provider-factory";
import { getModelOption } from "@/lib/ai/model-service";
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
import { isImageAttachment, isPdfAttachment } from "@/lib/attachment-utils";
import { extractUrls, buildFetchBlockFromResults, type FetchUrlResult } from "@/lib/url-utils";
import { invoke } from "@tauri-apps/api/core";
import type { ModelMessage } from "ai";

/** 根据用户文本中的 URL 抓取并返回要注入的「抓取内容」块 */
async function getFetchBlockForText(text: string): Promise<string> {
  const urls = extractUrls(text);
  if (urls.length === 0) return "";
  const results: FetchUrlResult[] = [];
  for (const url of urls) {
    try {
      const res = await invoke<FetchUrlResult>("fetch_url", {
        args: { url, timeoutMs: 15000, maxChars: 120000 },
      });
      results.push(res);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      results.push({ ok: false, error: msg, source: url });
    }
  }
  if (import.meta.env.DEV) {
    console.debug("[chatStore] URL 抓取", { urlCount: urls.length, partCount: results.length });
  }
  return buildFetchBlockFromResults(results);
}

/** 将抓取块追加到 modelMessages 中最后一条 user 消息的文本后 */
function injectFetchBlockIntoLastUserMessage(modelMessages: ModelMessage[], fetchBlock: string): void {
  if (!fetchBlock) return;
  const latestUserIndex = [...modelMessages]
    .reverse()
    .findIndex((message) => message.role === "user");
  if (latestUserIndex < 0) return;
  const index = modelMessages.length - 1 - latestUserIndex;
  const msg = modelMessages[index] as { role: string; content: Array<{ type: string; text?: string }> };
  if (Array.isArray(msg.content) && msg.content[0]?.type === "text" && typeof msg.content[0].text === "string") {
    msg.content[0].text = msg.content[0].text + fetchBlock;
  }
}

const LAST_MODEL_KEY = "lastModel";
const RETRYABLE_ATTEMPTS = 3;
const RETRY_BASE_DELAY_MS = 1200;
const RETRY_MAX_DELAY_MS = 8000;

function isRateLimitErrorMessage(message: string | undefined): boolean {
  if (!message) return false;
  const m = message.toLowerCase();
  return (
    m.includes("429") ||
    m.includes("rate limit") ||
    m.includes("too many requests") ||
    m.includes("quota exceeded")
  );
}

function parseRetryAfterMs(message: string | undefined): number | null {
  if (!message) return null;
  const secMatch = message.match(/retry[-\s]?after[:=\s]+(\d+)/i);
  if (secMatch?.[1]) {
    const sec = Number(secMatch[1]);
    if (!Number.isNaN(sec) && sec > 0) return sec * 1000;
  }
  const msMatch = message.match(/retry[-\s]?after[:=\s]+(\d+)\s*ms/i);
  if (msMatch?.[1]) {
    const ms = Number(msMatch[1]);
    if (!Number.isNaN(ms) && ms > 0) return ms;
  }
  return null;
}

function backoffDelayMs(attempt: number, errMessage?: string): number {
  const hinted = parseRetryAfterMs(errMessage);
  if (hinted != null) return Math.min(RETRY_MAX_DELAY_MS, Math.max(600, hinted));
  const exp = RETRY_BASE_DELAY_MS * 2 ** Math.max(0, attempt - 1);
  const jitter = Math.floor(Math.random() * 300);
  return Math.min(RETRY_MAX_DELAY_MS, exp + jitter);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

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

export interface DraftAttachment {
  id: string;
  type: Attachment["type"];
  name?: string;
  path?: string;
  mime_type?: string;
  size?: number;
  content?: string;
}

/** 一条消息内的有序片段：文本与工具调用按出现顺序交错 */
export type MessagePart =
  | { type: "text"; text: string }
  | { type: "reasoning"; text: string }
  | ({ type: "tool" } & ToolCallInfo);

interface ChatState {
  messages: Message[];
  attachmentsByMessage: Record<string, Attachment[]>;
  draftAttachments: DraftAttachment[];
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
  /** 清除当前选中的模型（如 provider 被关闭时若当前选中该 provider 则调用） */
  clearModelSelection: () => Promise<void>;
  /** 应用启动时从 settings 恢复上次使用的模型（当前未选模型时调用） */
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
    const attachmentsByMessage: Record<string, Attachment[]> = {};
    await Promise.all(
      messages.map(async (message) => {
        const attachments = await attachmentRepo.getByMessage(message.id);
        if (attachments.length > 0) {
          attachmentsByMessage[message.id] = attachments;
        }
      }),
    );
    set({ messages, attachmentsByMessage, draftAttachments: [], error: null });
    await useWorkspaceStore.getState().loadFromConversation(conversationId);
  },

  selectModel(providerId: string, modelId: string, providerType: string) {
    set({ providerId, modelId, providerType });
    settingsRepo.set(
      LAST_MODEL_KEY,
      JSON.stringify({ providerId, modelId, providerType }),
    );
  },

  async clearModelSelection() {
    set({ modelId: null, providerId: null, providerType: null });
    await settingsRepo.delete(LAST_MODEL_KEY);
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
    const { modelId, providerId, providerType, messages, draftAttachments } = get();
    const trimmedContent = content.trim();
    const titleSource =
      trimmedContent ||
      (draftAttachments.length > 0
        ? `附件：${draftAttachments
            .map((attachment) => attachment.name || "未命名文件")
            .slice(0, 3)
            .join("、")}`
        : "");
    if (!trimmedContent && draftAttachments.length === 0) {
      return;
    }
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
        const title = titleSource.slice(0, 50) || "New Chat";
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
        if (import.meta.env.DEV) {
          console.debug("[chatStore] 新会话已创建", {
            conversationId,
            titleSeed: title,
            hasText: !!trimmedContent,
            attachmentCount: draftAttachments.length,
          });
        }
      }

      // Create user message
      const userMsg: Omit<Message, "created_at"> = {
        id: crypto.randomUUID(),
        conversation_id: conversationId,
        role: "user",
        content: trimmedContent,
      };
      await messageRepo.create(userMsg);
      if (draftAttachments.length > 0) {
        await Promise.all(
          draftAttachments.map(async (attachment) => {
            await attachmentRepo.create({
              id: attachment.id,
              message_id: userMsg.id,
              type: attachment.type,
              name: attachment.name,
              path: attachment.path,
              mime_type: attachment.mime_type,
              size: attachment.size,
              content: attachment.content,
            });
          }),
        );
      }

      updatedMessages = [...messages, { ...userMsg, created_at: new Date().toISOString() }];
      set((state) => ({
        messages: updatedMessages,
        draftAttachments: [],
        attachmentsByMessage:
          draftAttachments.length === 0
            ? state.attachmentsByMessage
            : {
                ...state.attachmentsByMessage,
                [userMsg.id]: draftAttachments.map((attachment) => ({
                  ...attachment,
                  message_id: userMsg.id,
                  created_at: new Date().toISOString(),
                })),
              },
        error: null,
      }));

      // 新会话：用用户首条问题异步生成标题
      if (isNewConversation && provider) {
        void generateConversationTitleFromUserQuestion(conversationId, titleSource, { provider, modelId })
          .then(() => {
            if (import.meta.env.DEV) {
              console.debug("[chatStore] 会话标题生成成功", { conversationId, titleSource });
            }
            return useDataStore.getState().loadConversations();
          })
          .catch((err) => {
            if (import.meta.env.DEV) {
              console.warn("[chatStore] 会话标题生成失败", {
                conversationId,
                titleSource,
                error: err instanceof Error ? err.message : String(err),
              });
            }
          });
      }

      // 更新会话时间戳，并写入当前使用的 provider/model，侧栏图标据此显示
      await conversationRepo.update(conversationId, {
        provider_type: providerType ?? undefined,
        model_override: modelId,
      });
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
      const modelOption = getModelOption(provider, modelId);
      const modelSupportsPdfNative = modelOption?.pdf_native === true;
      const modelMessages = toModelMessages(updatedMessages);

      // 从用户消息中识别 URL 并抓取，将结果拼成块注入最后一条 user 消息
      const fetchBlock = await getFetchBlockForText(trimmedContent);

      if (draftAttachments.length > 0) {
        const latestUserIndex = [...modelMessages]
          .reverse()
          .findIndex((message) => message.role === "user");
        if (latestUserIndex >= 0) {
          const index = modelMessages.length - 1 - latestUserIndex;
          const imageAttachments = draftAttachments.filter((a) => isImageAttachment(a));
          const pdfAttachments = draftAttachments.filter((a) => isPdfAttachment(a));
          const otherTextAttachments = draftAttachments.filter(
            (a) => !isImageAttachment(a) && !isPdfAttachment(a),
          );
          const textAttachmentsForManifest = modelSupportsPdfNative
            ? otherTextAttachments
            : draftAttachments.filter((a) => !isImageAttachment(a));
          const manifest =
            textAttachmentsForManifest.length > 0
              ? `\n\n可用附件（按需读取）：\n${textAttachmentsForManifest
                  .map((a) => `- attachmentId=${a.id} name=${a.name ?? "unknown"}`)
                  .join("\n")}\n如需读取附件内容，请调用 parse_document 工具并传入 attachmentId。可按需设置 mode=summary/chunks/full，以及 pageRange（仅 PDF）。`
              : "";
          const userText = `${trimmedContent}${manifest}${fetchBlock}`.trim();
          const nextContent: Array<Record<string, unknown>> = [];
          if (userText) {
            nextContent.push({ type: "text", text: userText });
          }
          for (const attachment of imageAttachments) {
            if (attachment.content?.startsWith("data:image/")) {
              nextContent.push({ type: "image", image: attachment.content });
            }
          }
          if (modelSupportsPdfNative && pdfAttachments.length > 0) {
            for (const attachment of pdfAttachments) {
              try {
                const dataUrl =
                  attachment.content?.startsWith("data:") && attachment.content.includes("application/pdf")
                    ? attachment.content
                    : await invoke<{ data_url: string }>("read_attachment_as_data_url", {
                        args: { path: attachment.path },
                      }).then((r) => r.data_url);
                nextContent.push({
                  type: "file",
                  data: dataUrl,
                  mediaType: "application/pdf",
                });
              } catch {
                // 单 PDF 读取失败时跳过（如超大小），该 PDF 不会以原生发送
              }
            }
          }
          if (nextContent.length > 0) {
            const original = modelMessages[index] as Record<string, unknown>;
            modelMessages[index] = {
              ...original,
              content: nextContent,
            } as (typeof modelMessages)[number];
          }
        }
      } else {
        injectFetchBlockIntoLastUserMessage(modelMessages, fetchBlock);
      }
      const enabledSkillNames = await getEnabledSkillNames();
      const tools = getAgentTools(enabledSkillNames);

      let streamResult: Awaited<ReturnType<typeof handleAgentStream>> | null = null;
      for (let attempt = 1; attempt <= RETRYABLE_ATTEMPTS; attempt++) {
        const attemptResult = runAgent({
          model,
          messages: modelMessages,
          system: buildSystemPrompt({
            workspacePath: useWorkspaceStore.getState().activeWorkspace?.path,
          }),
          tools,
          abortSignal: abortController.signal,
          maxOutputTokens: modelOption?.max_output_tokens,
        });
        const current = await handleAgentStream(
          attemptResult,
          (streamingState) => set(streamingState),
          (partType) => trackAgentPart(runMetrics, partType),
          {
            label: `send:${provider.type}/${modelId}:try${attempt}`,
          },
        );
        streamResult = current;
        if (!current.error || !isRateLimitErrorMessage(current.error) || attempt >= RETRYABLE_ATTEMPTS) {
          break;
        }
        set({
          error: `请求过于频繁，正在自动重试（${attempt}/${RETRYABLE_ATTEMPTS - 1}）...`,
        });
        await sleep(backoffDelayMs(attempt, current.error));
      }
      if (!streamResult) {
        throw new Error("Stream result unavailable");
      }

      if (streamResult.error) {
        const finalError = isRateLimitErrorMessage(streamResult.error)
          ? "请求过于频繁（429），请稍后重试，或切换到 DeepSeek。"
          : streamResult.error;
        reportAgentRunMetrics(runMetrics, { error: streamResult.error });
        set({
          error: finalError,
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

  addDraftAttachments(attachments: DraftAttachment[]) {
    if (attachments.length === 0) return;
    set((state) => ({
      draftAttachments: [...state.draftAttachments, ...attachments],
    }));
  },

  removeDraftAttachment(attachmentId: string) {
    set((state) => ({
      draftAttachments: state.draftAttachments.filter((attachment) => attachment.id !== attachmentId),
    }));
  },

  clearDraftAttachments() {
    set({ draftAttachments: [] });
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
    const remainingIds = new Set(remaining.map((m) => m.id));
    const prunedAttachments = Object.fromEntries(
      Object.entries(get().attachmentsByMessage).filter(([messageId]) => remainingIds.has(messageId)),
    );
    set({ messages: remaining, attachmentsByMessage: prunedAttachments });

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
      const lastUserContent =
        remaining[remaining.length - 1]?.role === "user"
          ? (remaining[remaining.length - 1]!.content ?? "")
          : "";
      const fetchBlockRegen = await getFetchBlockForText(lastUserContent);
      injectFetchBlockIntoLastUserMessage(modelMessages, fetchBlockRegen);

      const enabledSkillNames = await getEnabledSkillNames();
      const tools = getAgentTools(enabledSkillNames);
      const modelOption = getModelOption(provider, modelId);

      let streamResult: Awaited<ReturnType<typeof handleAgentStream>> | null = null;
      for (let attempt = 1; attempt <= RETRYABLE_ATTEMPTS; attempt++) {
        const attemptResult = runAgent({
          model,
          messages: modelMessages,
          system: buildSystemPrompt({
            workspacePath: useWorkspaceStore.getState().activeWorkspace?.path,
          }),
          tools,
          abortSignal: abortController.signal,
          maxOutputTokens: modelOption?.max_output_tokens,
        });
        const current = await handleAgentStream(
          attemptResult,
          (streamingState) => set(streamingState),
          (partType) => trackAgentPart(runMetrics, partType),
          {
            label: `regenerate:${provider.type}/${modelId}:try${attempt}`,
          },
        );
        streamResult = current;
        if (!current.error || !isRateLimitErrorMessage(current.error) || attempt >= RETRYABLE_ATTEMPTS) {
          break;
        }
        set({
          error: `请求过于频繁，正在自动重试（${attempt}/${RETRYABLE_ATTEMPTS - 1}）...`,
        });
        await sleep(backoffDelayMs(attempt, current.error));
      }
      if (!streamResult) {
        throw new Error("Stream result unavailable");
      }

      if (streamResult.error) {
        const finalError = isRateLimitErrorMessage(streamResult.error)
          ? "请求过于频繁（429），请稍后重试，或切换到 DeepSeek。"
          : streamResult.error;
        reportAgentRunMetrics(runMetrics, { error: streamResult.error });
        set({ error: finalError, isStreaming: false, streamingContent: "", streamingReasoning: "", streamingToolCalls: [], streamingParts: [], abortController: null });
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
    const remainingIds = new Set(remaining.map((m) => m.id));
    const prunedAttachments = Object.fromEntries(
      Object.entries(get().attachmentsByMessage).filter(([messageId]) => remainingIds.has(messageId)),
    );
    set({ messages: remaining, attachmentsByMessage: prunedAttachments });

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
      const fetchBlockEdit = await getFetchBlockForText(newContent);
      injectFetchBlockIntoLastUserMessage(modelMessages, fetchBlockEdit);

      const enabledSkillNames = await getEnabledSkillNames();
      const tools = getAgentTools(enabledSkillNames);
      const modelOption = getModelOption(provider, modelId);

      let streamResult: Awaited<ReturnType<typeof handleAgentStream>> | null = null;
      for (let attempt = 1; attempt <= RETRYABLE_ATTEMPTS; attempt++) {
        const attemptResult = runAgent({
          model,
          messages: modelMessages,
          system: buildSystemPrompt({
            workspacePath: useWorkspaceStore.getState().activeWorkspace?.path,
          }),
          tools,
          abortSignal: abortController.signal,
          maxOutputTokens: modelOption?.max_output_tokens,
        });
        const current = await handleAgentStream(
          attemptResult,
          (streamingState) => set(streamingState),
          (partType) => trackAgentPart(runMetrics, partType),
          {
            label: `edit_resend:${provider.type}/${modelId}:try${attempt}`,
          },
        );
        streamResult = current;
        if (!current.error || !isRateLimitErrorMessage(current.error) || attempt >= RETRYABLE_ATTEMPTS) {
          break;
        }
        set({
          error: `请求过于频繁，正在自动重试（${attempt}/${RETRYABLE_ATTEMPTS - 1}）...`,
        });
        await sleep(backoffDelayMs(attempt, current.error));
      }
      if (!streamResult) {
        throw new Error("Stream result unavailable");
      }

      if (streamResult.error) {
        const finalError = isRateLimitErrorMessage(streamResult.error)
          ? "请求过于频繁（429），请稍后重试，或切换到 DeepSeek。"
          : streamResult.error;
        reportAgentRunMetrics(runMetrics, { error: streamResult.error });
        set({ error: finalError, isStreaming: false, streamingContent: "", streamingReasoning: "", streamingToolCalls: [], streamingParts: [], abortController: null });
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
      attachmentsByMessage: {},
      draftAttachments: [],
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
