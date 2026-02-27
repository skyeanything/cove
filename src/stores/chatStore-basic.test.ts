import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createStoreReset, setStoreState, makeMessage } from "@/test-utils";
import type { DraftAttachment } from "./chat-types";

// --- vi.mock declarations (hoisted) ---

vi.mock("@/db/repos/messageRepo", () => ({
  messageRepo: { getByConversation: vi.fn().mockResolvedValue([]), create: vi.fn(), deleteAfter: vi.fn() },
}));
vi.mock("@/db/repos/attachmentRepo", () => ({
  attachmentRepo: { getByMessage: vi.fn().mockResolvedValue([]), create: vi.fn() },
}));
vi.mock("@/db/repos/conversationRepo", () => ({
  conversationRepo: { create: vi.fn(), update: vi.fn() },
}));
vi.mock("@/db/repos/providerRepo", () => ({
  providerRepo: { getAll: vi.fn().mockResolvedValue([]) },
}));
vi.mock("@/db/repos/settingsRepo", () => ({
  settingsRepo: { get: vi.fn(), set: vi.fn(), delete: vi.fn() },
}));
vi.mock("./dataStore", () => ({
  useDataStore: { getState: () => ({ activeConversationId: null, setActiveConversation: vi.fn(), loadConversations: vi.fn() }) },
}));
const mockWorkspaceStore = { activeWorkspace: null, loadFromConversation: vi.fn().mockResolvedValue(undefined) };
vi.mock("./workspaceStore", () => ({ useWorkspaceStore: { getState: () => mockWorkspaceStore } }));
vi.mock("./chat-stream-runner", () => ({ runStreamLoop: vi.fn() }));
vi.mock("./chat-url-utils", () => ({ getFetchBlockForText: vi.fn().mockResolvedValue(""), injectFetchBlockIntoLastUserMessage: vi.fn() }));
vi.mock("@/lib/ai/model-service", () => ({ getModelOption: vi.fn() }));
vi.mock("@/lib/ai/agent", () => ({ toModelMessages: vi.fn().mockReturnValue([]) }));
vi.mock("@/lib/ai/agent-metrics", () => ({ createAgentRunMetrics: vi.fn().mockReturnValue({}), reportAgentRunMetrics: vi.fn() }));
vi.mock("@/lib/ai/generate-title", () => ({ generateConversationTitleFromUserQuestion: vi.fn().mockResolvedValue(undefined) }));
vi.mock("@/lib/attachment-utils", () => ({ isImageAttachment: vi.fn().mockReturnValue(false), isPdfAttachment: vi.fn().mockReturnValue(false) }));
vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));

// --- imports after mocks ---

import { useChatStore } from "./chatStore";
import { messageRepo } from "@/db/repos/messageRepo";
import { attachmentRepo } from "@/db/repos/attachmentRepo";
import { settingsRepo } from "@/db/repos/settingsRepo";

// --- setup ---

const resetStore = createStoreReset(useChatStore);
beforeEach(() => vi.clearAllMocks());
afterEach(() => resetStore());

// --- tests ---

describe("chatStore — basic actions", () => {
  describe("initial state", () => {
    it("has correct defaults", () => {
      const s = useChatStore.getState();
      expect(s.messages).toEqual([]);
      expect(s.attachmentsByMessage).toEqual({});
      expect(s.draftAttachments).toEqual([]);
      expect(s.isStreaming).toBe(false);
      expect(s.streamingContent).toBe("");
      expect(s.streamingReasoning).toBe("");
      expect(s.streamingToolCalls).toEqual([]);
      expect(s.streamingParts).toEqual([]);
      expect(s.abortController).toBeNull();
      expect(s.error).toBeNull();
      expect(s.modelId).toBeNull();
      expect(s.providerId).toBeNull();
      expect(s.providerType).toBeNull();
    });
  });

  describe("loadMessages", () => {
    it("loads messages and attachments from DB", async () => {
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

    it("clears draft attachments on load", async () => {
      setStoreState(useChatStore, { draftAttachments: [{ id: "d1", type: "image" }] });
      vi.mocked(messageRepo.getByConversation).mockResolvedValue([]);
      await useChatStore.getState().loadMessages("conv-1");
      expect(useChatStore.getState().draftAttachments).toEqual([]);
    });

    it("calls workspaceStore.loadFromConversation", async () => {
      vi.mocked(messageRepo.getByConversation).mockResolvedValue([]);
      await useChatStore.getState().loadMessages("conv-1");
      expect(mockWorkspaceStore.loadFromConversation).toHaveBeenCalledWith("conv-1");
    });

    it("handles messages with no attachments", async () => {
      vi.mocked(messageRepo.getByConversation).mockResolvedValue([makeMessage({ id: "m1" })]);
      vi.mocked(attachmentRepo.getByMessage).mockResolvedValue([]);
      await useChatStore.getState().loadMessages("conv-1");
      expect(useChatStore.getState().attachmentsByMessage).toEqual({});
    });
  });

  describe("selectModel", () => {
    it("sets providerId, modelId, providerType in state and persists", () => {
      useChatStore.getState().selectModel("p1", "gpt-4o", "openai");
      const s = useChatStore.getState();
      expect(s.providerId).toBe("p1");
      expect(s.modelId).toBe("gpt-4o");
      expect(s.providerType).toBe("openai");
      expect(settingsRepo.set).toHaveBeenCalledWith("lastModel", expect.any(String));
    });
  });

  describe("clearModelSelection", () => {
    it("clears model state and deletes from DB", async () => {
      setStoreState(useChatStore, { modelId: "gpt-4o", providerId: "p1", providerType: "openai" });
      await useChatStore.getState().clearModelSelection();
      const s = useChatStore.getState();
      expect(s.modelId).toBeNull();
      expect(s.providerId).toBeNull();
      expect(s.providerType).toBeNull();
      expect(settingsRepo.delete).toHaveBeenCalledWith("lastModel");
    });
  });

  describe("restoreLastModel", () => {
    it("restores model from settingsRepo JSON", async () => {
      vi.mocked(settingsRepo.get).mockResolvedValue(
        JSON.stringify({ providerId: "p1", modelId: "gpt-4o", providerType: "openai" }),
      );
      await useChatStore.getState().restoreLastModel();
      expect(useChatStore.getState().modelId).toBe("gpt-4o");
      expect(useChatStore.getState().providerId).toBe("p1");
      expect(useChatStore.getState().providerType).toBe("openai");
    });

    it("early returns if model already set", async () => {
      setStoreState(useChatStore, { modelId: "existing" });
      await useChatStore.getState().restoreLastModel();
      expect(settingsRepo.get).not.toHaveBeenCalled();
    });

    it("does nothing when settingsRepo returns undefined", async () => {
      vi.mocked(settingsRepo.get).mockResolvedValue(undefined);
      await useChatStore.getState().restoreLastModel();
      expect(useChatStore.getState().modelId).toBeNull();
    });

    it("ignores invalid JSON gracefully", async () => {
      vi.mocked(settingsRepo.get).mockResolvedValue("{invalid");
      await useChatStore.getState().restoreLastModel();
      expect(useChatStore.getState().modelId).toBeNull();
    });
  });

  describe("draft attachments", () => {
    const draft: DraftAttachment = { id: "a1", type: "image", name: "pic.png" };

    it("addDraftAttachments appends to existing", () => {
      const existing: DraftAttachment = { id: "a0", type: "file", name: "f.txt" };
      setStoreState(useChatStore, { draftAttachments: [existing] });
      useChatStore.getState().addDraftAttachments([draft]);
      expect(useChatStore.getState().draftAttachments).toEqual([existing, draft]);
    });

    it("addDraftAttachments ignores empty array", () => {
      setStoreState(useChatStore, { draftAttachments: [draft] });
      useChatStore.getState().addDraftAttachments([]);
      expect(useChatStore.getState().draftAttachments).toEqual([draft]);
    });

    it("removeDraftAttachment removes by id", () => {
      const other: DraftAttachment = { id: "a2", type: "file", name: "f.txt" };
      setStoreState(useChatStore, { draftAttachments: [draft, other] });
      useChatStore.getState().removeDraftAttachment("a1");
      expect(useChatStore.getState().draftAttachments).toEqual([other]);
    });

    it("clearDraftAttachments resets to empty", () => {
      setStoreState(useChatStore, { draftAttachments: [draft] });
      useChatStore.getState().clearDraftAttachments();
      expect(useChatStore.getState().draftAttachments).toEqual([]);
    });
  });

  describe("stopGeneration", () => {
    it("calls abort on controller", () => {
      const ac = new AbortController();
      const spy = vi.spyOn(ac, "abort");
      setStoreState(useChatStore, { abortController: ac });
      useChatStore.getState().stopGeneration();
      expect(spy).toHaveBeenCalled();
    });

    it("is safe when no controller", () => {
      setStoreState(useChatStore, { abortController: null });
      expect(() => useChatStore.getState().stopGeneration()).not.toThrow();
    });
  });

  describe("reset", () => {
    it("clears all state to defaults", () => {
      setStoreState(useChatStore, {
        messages: [makeMessage()],
        attachmentsByMessage: { m1: [] },
        draftAttachments: [{ id: "a1", type: "image" }],
        error: "some error",
        isStreaming: true,
        streamingContent: "partial",
      });
      useChatStore.getState().reset();
      const s = useChatStore.getState();
      expect(s.messages).toEqual([]);
      expect(s.attachmentsByMessage).toEqual({});
      expect(s.draftAttachments).toEqual([]);
      expect(s.error).toBeNull();
      expect(s.isStreaming).toBe(false);
      expect(s.streamingContent).toBe("");
    });
  });
});
