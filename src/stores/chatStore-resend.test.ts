import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createStoreReset, setStoreState, makeMessage, makeProvider } from "@/test-utils";

// --- vi.mock declarations (hoisted) ---

vi.mock("@/db/repos/messageRepo", () => ({
  messageRepo: {
    getByConversation: vi.fn().mockResolvedValue([]),
    create: vi.fn().mockResolvedValue(undefined),
    deleteAfter: vi.fn().mockResolvedValue(undefined),
  },
}));
vi.mock("@/db/repos/attachmentRepo", () => ({
  attachmentRepo: { getByMessage: vi.fn().mockResolvedValue([]), create: vi.fn() },
}));
vi.mock("@/db/repos/conversationRepo", () => ({
  conversationRepo: { create: vi.fn(), update: vi.fn(), getById: vi.fn().mockResolvedValue(undefined) },
}));
vi.mock("./chat-compression-bridge", () => ({
  maybeCompressContext: vi.fn().mockResolvedValue({ compressed: false, messages: [] }),
}));
vi.mock("@/lib/ai/provider-factory", () => ({
  getModel: vi.fn().mockReturnValue({ id: "mock-model" }),
}));
vi.mock("@/db/repos/providerRepo", () => ({
  providerRepo: { getAll: vi.fn().mockResolvedValue([]) },
}));
vi.mock("@/db/repos/settingsRepo", () => ({
  settingsRepo: { get: vi.fn(), set: vi.fn(), delete: vi.fn() },
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
import { toModelMessages } from "@/lib/ai/agent";
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
  const userMsg = makeMessage({
    id: "u1", conversation_id: "conv-1", role: "user", content: "Hi",
    created_at: "2025-01-01T00:00:00Z",
  });
  const assistantMsg = makeMessage({
    id: "a1", conversation_id: "conv-1", role: "assistant", content: "Hello",
    created_at: "2025-01-01T00:01:00Z",
  });
  setStoreState(useChatStore, {
    messages: [userMsg, assistantMsg],
    modelId: "gpt-4o", providerId: "p1", providerType: "openai",
    attachmentsByMessage: {},
  });
  vi.mocked(providerRepo.getAll).mockResolvedValue([testProvider]);
  vi.mocked(runStreamLoop).mockResolvedValue(mockStreamSuccess());
  vi.mocked(toModelMessages).mockReturnValue([{ role: "user", content: [{ type: "text", text: "Hi" }] }] as ReturnType<typeof toModelMessages>);
  return { userMsg, assistantMsg };
}

// --- setup ---

beforeEach(() => vi.clearAllMocks());
afterEach(() => resetStore());

// --- tests ---

describe("chatStore — regenerateMessage", () => {
  describe("validation", () => {
    it("returns early for unknown messageId", async () => {
      setStoreState(useChatStore, { messages: [] });
      await useChatStore.getState().regenerateMessage("nonexistent");
      expect(messageRepo.deleteAfter).not.toHaveBeenCalled();
    });

    it("returns early when no prior user message found", async () => {
      const msg = makeMessage({ id: "a1", role: "assistant", created_at: "2025-01-01T00:00:00Z" });
      setStoreState(useChatStore, { messages: [msg] });
      await useChatStore.getState().regenerateMessage("a1");
      expect(messageRepo.deleteAfter).not.toHaveBeenCalled();
    });

    it("returns early when no model selected", async () => {
      const { assistantMsg } = setupWithMessages();
      setStoreState(useChatStore, { modelId: null });
      await useChatStore.getState().regenerateMessage(assistantMsg.id);
      // deleteAfter is called before the model check
      expect(messageRepo.deleteAfter).toHaveBeenCalled();
      expect(runStreamLoop).not.toHaveBeenCalled();
    });

    it("returns early when no provider found", async () => {
      const { assistantMsg } = setupWithMessages();
      vi.mocked(providerRepo.getAll).mockResolvedValue([]);
      await useChatStore.getState().regenerateMessage(assistantMsg.id);
      expect(runStreamLoop).not.toHaveBeenCalled();
    });
  });

  describe("message pruning", () => {
    it("deletes messages after target and prunes attachments", async () => {
      const { assistantMsg } = setupWithMessages();
      setStoreState(useChatStore, {
        ...useChatStore.getState(),
        attachmentsByMessage: { u1: [{ id: "att1", message_id: "u1", type: "image", created_at: "" }], a1: [{ id: "att2", message_id: "a1", type: "file", created_at: "" }] },
      });
      await useChatStore.getState().regenerateMessage(assistantMsg.id);
      expect(messageRepo.deleteAfter).toHaveBeenCalledWith("conv-1", assistantMsg.created_at);
      // After pruning, only user message (u1) remains + new assistant
      const msgs = useChatStore.getState().messages;
      expect(msgs[0]!.id).toBe("u1");
      // a1 attachments should be pruned since a1 was deleted
      const abm = useChatStore.getState().attachmentsByMessage;
      expect(abm["a1"]).toBeUndefined();
    });
  });

  describe("streaming", () => {
    it("calls runStreamLoop with remaining messages", async () => {
      const { assistantMsg } = setupWithMessages();
      await useChatStore.getState().regenerateMessage(assistantMsg.id);
      expect(runStreamLoop).toHaveBeenCalledWith(
        expect.objectContaining({ provider: testProvider, modelId: "gpt-4o" }),
        expect.objectContaining({ onUpdate: expect.any(Function) }),
      );
    });

    it("saves assistant message on success", async () => {
      const { assistantMsg } = setupWithMessages();
      await useChatStore.getState().regenerateMessage(assistantMsg.id);
      expect(messageRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ role: "assistant", content: "AI response" }),
      );
      const finalMessages = useChatStore.getState().messages;
      expect(finalMessages).toHaveLength(2);
      expect(finalMessages[1]!.role).toBe("assistant");
      expect(finalMessages[1]!.content).toBe("AI response");
      expect(useChatStore.getState().isStreaming).toBe(false);
    });
  });

  describe("error handling", () => {
    it("resets stream on AbortError (no partial save)", async () => {
      const { assistantMsg } = setupWithMessages();
      vi.mocked(runStreamLoop).mockRejectedValue(new DOMException("aborted", "AbortError"));
      await useChatStore.getState().regenerateMessage(assistantMsg.id);
      expect(reportAgentRunMetrics).toHaveBeenCalledWith(expect.anything(), { aborted: true });
      expect(useChatStore.getState().isStreaming).toBe(false);
      // Unlike sendMessage, regenerate does NOT save partial content
      expect(messageRepo.create).not.toHaveBeenCalled();
    });

    it("sets error on stream failure", async () => {
      const { assistantMsg } = setupWithMessages();
      vi.mocked(runStreamLoop).mockRejectedValue(new Error("Network error"));
      await useChatStore.getState().regenerateMessage(assistantMsg.id);
      expect(useChatStore.getState().error).toBe("Network error");
      expect(useChatStore.getState().isStreaming).toBe(false);
      expect(reportAgentRunMetrics).toHaveBeenCalledWith(expect.anything(), { error: "Network error" });
    });
  });
});

describe("chatStore — editAndResend", () => {
  describe("validation", () => {
    it("returns early for unknown messageId", async () => {
      setStoreState(useChatStore, { messages: [] });
      await useChatStore.getState().editAndResend("nonexistent", "new text");
      expect(messageRepo.deleteAfter).not.toHaveBeenCalled();
    });

    it("returns early when no model/provider", async () => {
      const { userMsg } = setupWithMessages();
      setStoreState(useChatStore, { modelId: null });
      await useChatStore.getState().editAndResend(userMsg.id, "edited");
      expect(messageRepo.deleteAfter).toHaveBeenCalled();
      expect(runStreamLoop).not.toHaveBeenCalled();
    });
  });

  describe("message replacement", () => {
    it("deletes after target, creates new user msg, appends to state", async () => {
      const { userMsg } = setupWithMessages();
      await useChatStore.getState().editAndResend(userMsg.id, "edited content");
      expect(messageRepo.deleteAfter).toHaveBeenCalledWith("conv-1", userMsg.created_at);
      // First create call is the new user message
      const firstCreate = vi.mocked(messageRepo.create).mock.calls[0]![0];
      expect(firstCreate).toEqual(expect.objectContaining({ role: "user", content: "edited content" }));
      // State should have the new user message
      const msgs = useChatStore.getState().messages;
      expect(msgs[0]!.role).toBe("user");
      expect(msgs[0]!.content).toBe("edited content");
    });
  });

  describe("streaming", () => {
    it("calls runStreamLoop with updated messages", async () => {
      const { userMsg } = setupWithMessages();
      await useChatStore.getState().editAndResend(userMsg.id, "edited");
      expect(runStreamLoop).toHaveBeenCalledWith(
        expect.objectContaining({ provider: testProvider, modelId: "gpt-4o" }),
        expect.objectContaining({ onUpdate: expect.any(Function) }),
      );
    });

    it("saves assistant message on success", async () => {
      const { userMsg } = setupWithMessages();
      await useChatStore.getState().editAndResend(userMsg.id, "edited");
      // create: new user msg + assistant msg
      expect(messageRepo.create).toHaveBeenCalledTimes(2);
      const lastCreate = vi.mocked(messageRepo.create).mock.calls[1]![0];
      expect(lastCreate).toEqual(expect.objectContaining({ role: "assistant", content: "AI response" }));
      const finalMessages = useChatStore.getState().messages;
      expect(finalMessages).toHaveLength(2);
      expect(finalMessages[1]!.role).toBe("assistant");
      expect(useChatStore.getState().isStreaming).toBe(false);
    });
  });

  describe("error handling", () => {
    it("resets stream on AbortError", async () => {
      const { userMsg } = setupWithMessages();
      vi.mocked(runStreamLoop).mockRejectedValue(new DOMException("aborted", "AbortError"));
      await useChatStore.getState().editAndResend(userMsg.id, "edited");
      expect(reportAgentRunMetrics).toHaveBeenCalledWith(expect.anything(), { aborted: true });
      expect(useChatStore.getState().isStreaming).toBe(false);
      expect(useChatStore.getState().error).toBeNull();
    });

    it("sets error on stream failure", async () => {
      const { userMsg } = setupWithMessages();
      vi.mocked(runStreamLoop).mockRejectedValue(new Error("Server error"));
      await useChatStore.getState().editAndResend(userMsg.id, "edited");
      expect(useChatStore.getState().error).toBe("Server error");
      expect(useChatStore.getState().isStreaming).toBe(false);
      expect(reportAgentRunMetrics).toHaveBeenCalledWith(expect.anything(), { error: "Server error" });
    });
  });
});
