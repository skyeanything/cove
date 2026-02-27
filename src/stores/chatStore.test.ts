import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createStoreReset, setStoreState, makeMessage, makeProvider } from "@/test-utils";
import type { DraftAttachment } from "./chat-types";

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
  settingsRepo: { get: vi.fn().mockResolvedValue(null), set: vi.fn().mockResolvedValue(undefined), delete: vi.fn().mockResolvedValue(undefined) },
}));

const mockDataStore = { activeConversationId: "conv-1" as string | null, setActiveConversation: vi.fn(), loadConversations: vi.fn().mockResolvedValue(undefined) };
vi.mock("./dataStore", () => ({ useDataStore: { getState: () => mockDataStore } }));

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
import { attachmentRepo } from "@/db/repos/attachmentRepo";
import { conversationRepo } from "@/db/repos/conversationRepo";
import { providerRepo } from "@/db/repos/providerRepo";
import { settingsRepo } from "@/db/repos/settingsRepo";
import { runStreamLoop } from "./chat-stream-runner";
import type { StreamRunResult } from "./chat-stream-runner";

// --- helpers ---

const resetStore = createStoreReset(useChatStore);
const testProvider = makeProvider({ id: "p1", type: "openai", enabled: 1 });

function mockStreamSuccess(content = "AI response"): StreamRunResult {
  return {
    streamResult: { content, reasoning: "", parts: [], toolCalls: [], inputTokens: 10, outputTokens: 20 },
  };
}

// --- tests ---

beforeEach(() => {
  vi.clearAllMocks();
  mockDataStore.activeConversationId = "conv-1";
});
afterEach(() => resetStore());

describe("chatStore", () => {
  describe("initial state", () => {
    it("has correct defaults", () => {
      const s = useChatStore.getState();
      expect(s.messages).toEqual([]);
      expect(s.isStreaming).toBe(false);
      expect(s.error).toBeNull();
      expect(s.modelId).toBeNull();
      expect(s.draftAttachments).toEqual([]);
    });
  });

  describe("draftAttachments", () => {
    const draft: DraftAttachment = { id: "a1", type: "image", name: "pic.png" };

    it("adds attachments", () => {
      useChatStore.getState().addDraftAttachments([draft]);
      expect(useChatStore.getState().draftAttachments).toEqual([draft]);
    });

    it("removes attachment by id", () => {
      setStoreState(useChatStore, { draftAttachments: [draft, { id: "a2", type: "file", name: "f.txt" }] });
      useChatStore.getState().removeDraftAttachment("a1");
      expect(useChatStore.getState().draftAttachments).toHaveLength(1);
      expect(useChatStore.getState().draftAttachments[0]!.id).toBe("a2");
    });

    it("clears all attachments", () => {
      setStoreState(useChatStore, { draftAttachments: [draft] });
      useChatStore.getState().clearDraftAttachments();
      expect(useChatStore.getState().draftAttachments).toEqual([]);
    });
  });

  describe("stopGeneration", () => {
    it("calls abort on the controller", () => {
      const ac = new AbortController();
      const spy = vi.spyOn(ac, "abort");
      setStoreState(useChatStore, { abortController: ac });
      useChatStore.getState().stopGeneration();
      expect(spy).toHaveBeenCalled();
    });
  });

  describe("reset", () => {
    it("clears messages, attachments, and error", () => {
      setStoreState(useChatStore, {
        messages: [makeMessage()], error: "oops",
        draftAttachments: [{ id: "a1", type: "image" }],
      });
      useChatStore.getState().reset();
      const s = useChatStore.getState();
      expect(s.messages).toEqual([]);
      expect(s.error).toBeNull();
      expect(s.draftAttachments).toEqual([]);
      expect(s.isStreaming).toBe(false);
    });
  });

  describe("loadMessages", () => {
    it("loads messages and attachments", async () => {
      const msgs = [makeMessage({ id: "m1" }), makeMessage({ id: "m2", role: "assistant" })];
      vi.mocked(messageRepo.getByConversation).mockResolvedValue(msgs);
      vi.mocked(attachmentRepo.getByMessage).mockImplementation(async (id: string) =>
        id === "m1" ? [{ id: "att1", message_id: "m1", type: "image" as const, name: "p.png", created_at: "" }] : [],
      );
      await useChatStore.getState().loadMessages("conv-1");
      expect(useChatStore.getState().messages).toEqual(msgs);
      expect(useChatStore.getState().attachmentsByMessage["m1"]).toHaveLength(1);
      expect(useChatStore.getState().attachmentsByMessage["m2"]).toBeUndefined();
    });

    it("calls workspace loadFromConversation", async () => {
      vi.mocked(messageRepo.getByConversation).mockResolvedValue([]);
      await useChatStore.getState().loadMessages("conv-1");
      expect(mockWorkspaceStore.loadFromConversation).toHaveBeenCalledWith("conv-1");
    });
  });

  describe("model selection", () => {
    it("selectModel sets state and persists", () => {
      useChatStore.getState().selectModel("p1", "gpt-4o", "openai");
      const s = useChatStore.getState();
      expect(s.providerId).toBe("p1");
      expect(s.modelId).toBe("gpt-4o");
      expect(settingsRepo.set).toHaveBeenCalled();
    });

    it("clearModelSelection resets and deletes setting", async () => {
      setStoreState(useChatStore, { modelId: "gpt-4o", providerId: "p1", providerType: "openai" });
      await useChatStore.getState().clearModelSelection();
      expect(useChatStore.getState().modelId).toBeNull();
      expect(settingsRepo.delete).toHaveBeenCalled();
    });

    it("restoreLastModel restores from valid JSON", async () => {
      vi.mocked(settingsRepo.get).mockResolvedValue(JSON.stringify({ providerId: "p1", modelId: "gpt-4o", providerType: "openai" }));
      await useChatStore.getState().restoreLastModel();
      expect(useChatStore.getState().modelId).toBe("gpt-4o");
    });

    it("restoreLastModel ignores invalid JSON", async () => {
      vi.mocked(settingsRepo.get).mockResolvedValue("not-json");
      await useChatStore.getState().restoreLastModel();
      expect(useChatStore.getState().modelId).toBeNull();
    });
  });

  describe("sendMessage", () => {
    beforeEach(() => {
      setStoreState(useChatStore, { modelId: "gpt-4o", providerId: "p1", providerType: "openai" });
      vi.mocked(providerRepo.getAll).mockResolvedValue([testProvider]);
      vi.mocked(runStreamLoop).mockResolvedValue(mockStreamSuccess());
    });

    it("returns early on empty content with no attachments", async () => {
      await useChatStore.getState().sendMessage("   ");
      expect(messageRepo.create).not.toHaveBeenCalled();
    });

    it("sets error when no model selected", async () => {
      setStoreState(useChatStore, { modelId: null });
      await useChatStore.getState().sendMessage("hello");
      expect(useChatStore.getState().error).toMatch(/select a model/i);
    });

    it("sets error when provider not found", async () => {
      vi.mocked(providerRepo.getAll).mockResolvedValue([]);
      await useChatStore.getState().sendMessage("hello");
      expect(useChatStore.getState().error).toMatch(/not configured/i);
    });

    it("creates user message and calls runStreamLoop", async () => {
      await useChatStore.getState().sendMessage("hello");
      expect(messageRepo.create).toHaveBeenCalledTimes(2); // user + assistant
      expect(runStreamLoop).toHaveBeenCalledTimes(1);
      const finalMessages = useChatStore.getState().messages;
      expect(finalMessages).toHaveLength(2);
      expect(finalMessages[0]!.role).toBe("user");
      expect(finalMessages[1]!.role).toBe("assistant");
      expect(finalMessages[1]!.content).toBe("AI response");
    });

    it("creates new conversation when none active", async () => {
      mockDataStore.activeConversationId = null;
      await useChatStore.getState().sendMessage("hello");
      expect(conversationRepo.create).toHaveBeenCalledTimes(1);
      expect(mockDataStore.setActiveConversation).toHaveBeenCalled();
    });

    it("sets error when stream returns finalError", async () => {
      vi.mocked(runStreamLoop).mockResolvedValue({
        streamResult: { content: "", reasoning: "", parts: [], toolCalls: [] },
        finalError: "rate limit",
      });
      await useChatStore.getState().sendMessage("hello");
      expect(useChatStore.getState().error).toBe("rate limit");
      expect(useChatStore.getState().isStreaming).toBe(false);
    });
  });
});
