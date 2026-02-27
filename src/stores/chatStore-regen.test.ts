import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createStoreReset, setStoreState, makeMessage, makeProvider } from "@/test-utils";

// --- vi.mock declarations (hoisted) ---

vi.mock("@/db/repos/messageRepo", () => ({
  messageRepo: { getByConversation: vi.fn().mockResolvedValue([]), create: vi.fn().mockResolvedValue(undefined), deleteAfter: vi.fn().mockResolvedValue(undefined) },
}));
vi.mock("@/db/repos/attachmentRepo", () => ({
  attachmentRepo: { getByMessage: vi.fn().mockResolvedValue([]), create: vi.fn().mockResolvedValue(undefined) },
}));
vi.mock("@/db/repos/conversationRepo", () => ({
  conversationRepo: { create: vi.fn().mockResolvedValue(undefined), update: vi.fn().mockResolvedValue(undefined) },
}));
vi.mock("@/db/repos/providerRepo", () => ({
  providerRepo: { getAll: vi.fn().mockResolvedValue([]) },
}));
vi.mock("@/db/repos/settingsRepo", () => ({
  settingsRepo: { get: vi.fn().mockResolvedValue(null), set: vi.fn(), delete: vi.fn() },
}));

vi.mock("./dataStore", () => ({
  useDataStore: { getState: () => ({ activeConversationId: "conv-1", setActiveConversation: vi.fn(), loadConversations: vi.fn() }) },
}));

const mockWorkspaceStore = { activeWorkspace: null, loadFromConversation: vi.fn().mockResolvedValue(undefined) };
vi.mock("./workspaceStore", () => ({ useWorkspaceStore: { getState: () => mockWorkspaceStore } }));

vi.mock("./chat-stream-runner", () => ({ runStreamLoop: vi.fn() }));
vi.mock("./chat-url-utils", () => ({
  getFetchBlockForText: vi.fn().mockResolvedValue(""),
  injectFetchBlockIntoLastUserMessage: vi.fn(),
}));
vi.mock("@/lib/ai/model-service", () => ({ getModelOption: vi.fn().mockReturnValue(null) }));
vi.mock("@/lib/ai/agent", () => ({ toModelMessages: vi.fn().mockReturnValue([]) }));
vi.mock("@/lib/ai/agent-metrics", () => ({
  createAgentRunMetrics: vi.fn().mockReturnValue({}),
  reportAgentRunMetrics: vi.fn(),
}));
vi.mock("@/lib/ai/generate-title", () => ({
  generateConversationTitleFromUserQuestion: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/lib/attachment-utils", () => ({
  isImageAttachment: vi.fn().mockReturnValue(false),
  isPdfAttachment: vi.fn().mockReturnValue(false),
}));
vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));

// --- imports after mocks ---

import { useChatStore } from "./chatStore";
import { messageRepo } from "@/db/repos/messageRepo";
import { providerRepo } from "@/db/repos/providerRepo";
import { runStreamLoop } from "./chat-stream-runner";
import { reportAgentRunMetrics } from "@/lib/ai/agent-metrics";
import type { StreamRunResult } from "./chat-stream-runner";

// --- helpers ---

const resetStore = createStoreReset(useChatStore);
const testProvider = makeProvider({ id: "p1", type: "openai", enabled: 1 });

function mockStreamSuccess(content = "AI response"): StreamRunResult {
  return {
    streamResult: { content, reasoning: "", parts: [], toolCalls: [], inputTokens: 10, outputTokens: 20 },
  };
}

function setupWithMessages() {
  const userMsg = makeMessage({ id: "u1", conversation_id: "conv-1", role: "user", content: "Hi", created_at: "2025-01-01T00:00:00Z" });
  const assistantMsg = makeMessage({ id: "a1", conversation_id: "conv-1", role: "assistant", content: "Hello", created_at: "2025-01-01T00:01:00Z" });
  setStoreState(useChatStore, {
    messages: [userMsg, assistantMsg],
    modelId: "gpt-4o", providerId: "p1", providerType: "openai",
    attachmentsByMessage: {},
  });
  vi.mocked(providerRepo.getAll).mockResolvedValue([testProvider]);
  vi.mocked(runStreamLoop).mockResolvedValue(mockStreamSuccess());
  return { userMsg, assistantMsg };
}

// --- tests ---

beforeEach(() => vi.clearAllMocks());
afterEach(() => resetStore());

describe("regenerateMessage", () => {
  it("returns early when messageId not found", async () => {
    setStoreState(useChatStore, { messages: [] });
    await useChatStore.getState().regenerateMessage("nonexistent");
    expect(messageRepo.deleteAfter).not.toHaveBeenCalled();
  });

  it("returns early when no preceding user message", async () => {
    const msg = makeMessage({ id: "a1", role: "assistant", created_at: "2025-01-01T00:00:00Z" });
    setStoreState(useChatStore, { messages: [msg] });
    await useChatStore.getState().regenerateMessage("a1");
    expect(messageRepo.deleteAfter).not.toHaveBeenCalled();
  });

  it("returns early when no modelId", async () => {
    const { assistantMsg } = setupWithMessages();
    setStoreState(useChatStore, { modelId: null });
    await useChatStore.getState().regenerateMessage(assistantMsg.id);
    expect(messageRepo.deleteAfter).toHaveBeenCalled();
    expect(runStreamLoop).not.toHaveBeenCalled();
  });

  it("returns early when provider not found", async () => {
    const { assistantMsg } = setupWithMessages();
    vi.mocked(providerRepo.getAll).mockResolvedValue([]);
    await useChatStore.getState().regenerateMessage(assistantMsg.id);
    expect(runStreamLoop).not.toHaveBeenCalled();
  });

  it("deletes after, runs stream, and creates assistant message", async () => {
    const { assistantMsg } = setupWithMessages();
    await useChatStore.getState().regenerateMessage(assistantMsg.id);
    expect(messageRepo.deleteAfter).toHaveBeenCalledWith("conv-1", assistantMsg.created_at);
    expect(runStreamLoop).toHaveBeenCalledTimes(1);
    expect(messageRepo.create).toHaveBeenCalledTimes(1);
    const finalMessages = useChatStore.getState().messages;
    // remaining (user) + new assistant
    expect(finalMessages).toHaveLength(2);
    expect(finalMessages[1]!.role).toBe("assistant");
    expect(finalMessages[1]!.content).toBe("AI response");
    expect(useChatStore.getState().isStreaming).toBe(false);
  });

  it("handles AbortError by reporting aborted and resetting stream", async () => {
    const { assistantMsg } = setupWithMessages();
    const abortErr = new DOMException("aborted", "AbortError");
    vi.mocked(runStreamLoop).mockRejectedValue(abortErr);
    await useChatStore.getState().regenerateMessage(assistantMsg.id);
    expect(reportAgentRunMetrics).toHaveBeenCalledWith(expect.anything(), { aborted: true });
    expect(useChatStore.getState().isStreaming).toBe(false);
  });
});

describe("editAndResend", () => {
  it("returns early when messageId not found", async () => {
    setStoreState(useChatStore, { messages: [] });
    await useChatStore.getState().editAndResend("nonexistent", "new text");
    expect(messageRepo.deleteAfter).not.toHaveBeenCalled();
  });

  it("returns early when no modelId", async () => {
    const { userMsg } = setupWithMessages();
    setStoreState(useChatStore, { modelId: null });
    await useChatStore.getState().editAndResend(userMsg.id, "edited");
    // deleteAfter is called (before modelId check), but stream is not
    expect(messageRepo.deleteAfter).toHaveBeenCalled();
    expect(runStreamLoop).not.toHaveBeenCalled();
  });

  it("returns early when provider not found", async () => {
    const { userMsg } = setupWithMessages();
    vi.mocked(providerRepo.getAll).mockResolvedValue([]);
    await useChatStore.getState().editAndResend(userMsg.id, "edited");
    expect(runStreamLoop).not.toHaveBeenCalled();
  });

  it("creates new user message, runs stream, and creates assistant message", async () => {
    const { userMsg } = setupWithMessages();
    await useChatStore.getState().editAndResend(userMsg.id, "edited content");
    expect(messageRepo.deleteAfter).toHaveBeenCalledWith("conv-1", userMsg.created_at);
    // create called twice: new user message + assistant message
    expect(messageRepo.create).toHaveBeenCalledTimes(2);
    expect(runStreamLoop).toHaveBeenCalledTimes(1);
    const finalMessages = useChatStore.getState().messages;
    // remaining (nothing before userMsg at idx 0) + new user + new assistant
    expect(finalMessages).toHaveLength(2);
    expect(finalMessages[0]!.role).toBe("user");
    expect(finalMessages[0]!.content).toBe("edited content");
    expect(finalMessages[1]!.role).toBe("assistant");
    expect(useChatStore.getState().isStreaming).toBe(false);
  });

  it("sets error when stream returns finalError", async () => {
    const { userMsg } = setupWithMessages();
    vi.mocked(runStreamLoop).mockResolvedValue({
      streamResult: { content: "", reasoning: "", parts: [], toolCalls: [] },
      finalError: "rate limit exceeded",
    });
    await useChatStore.getState().editAndResend(userMsg.id, "edited");
    expect(useChatStore.getState().error).toBe("rate limit exceeded");
    expect(useChatStore.getState().isStreaming).toBe(false);
  });

  it("handles AbortError by reporting aborted", async () => {
    const { userMsg } = setupWithMessages();
    const abortErr = new DOMException("aborted", "AbortError");
    vi.mocked(runStreamLoop).mockRejectedValue(abortErr);
    await useChatStore.getState().editAndResend(userMsg.id, "edited");
    expect(reportAgentRunMetrics).toHaveBeenCalledWith(expect.anything(), { aborted: true });
    expect(useChatStore.getState().isStreaming).toBe(false);
    expect(useChatStore.getState().error).toBeNull();
  });
});
