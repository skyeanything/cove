import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createStoreReset, setStoreState, makeProvider } from "@/test-utils";
import type { DraftAttachment } from "./chat-types";

// --- vi.mock declarations (hoisted) ---

vi.mock("@/db/repos/messageRepo", () => ({
  messageRepo: {
    getByConversation: vi.fn().mockResolvedValue([]),
    create: vi.fn().mockResolvedValue(undefined),
    deleteAfter: vi.fn(),
  },
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
  settingsRepo: { get: vi.fn(), set: vi.fn(), delete: vi.fn() },
}));

const mockDataStore = {
  activeConversationId: "conv-1" as string | null,
  setActiveConversation: vi.fn(),
  loadConversations: vi.fn().mockResolvedValue(undefined),
};
vi.mock("./dataStore", () => ({ useDataStore: { getState: () => mockDataStore } }));

const mockWorkspaceStore = { activeWorkspace: null, loadFromConversation: vi.fn().mockResolvedValue(undefined) };
vi.mock("./workspaceStore", () => ({ useWorkspaceStore: { getState: () => mockWorkspaceStore } }));

vi.mock("./chat-stream-runner", () => ({ runStreamLoop: vi.fn() }));
vi.mock("./chat-url-utils", () => ({
  getFetchBlockForText: vi.fn().mockResolvedValue(""),
  injectFetchBlockIntoLastUserMessage: vi.fn(),
}));
vi.mock("@/lib/ai/model-service", () => ({ getModelOption: vi.fn().mockReturnValue(null) }));
vi.mock("@/lib/ai/agent", () => ({
  toModelMessages: vi.fn().mockReturnValue([{ role: "user", content: [{ type: "text", text: "hello" }] }]),
}));
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
import { runStreamLoop } from "./chat-stream-runner";
import { getFetchBlockForText, injectFetchBlockIntoLastUserMessage } from "./chat-url-utils";
import { getModelOption } from "@/lib/ai/model-service";
import { toModelMessages } from "@/lib/ai/agent";
import { reportAgentRunMetrics } from "@/lib/ai/agent-metrics";
import { isImageAttachment, isPdfAttachment } from "@/lib/attachment-utils";
import { invoke } from "@tauri-apps/api/core";
import type { StreamRunResult } from "./chat-stream-runner";

// --- helpers ---

const resetStore = createStoreReset(useChatStore);
const testProvider = makeProvider({ id: "p1", type: "openai", enabled: 1 });

function mockStreamSuccess(content = "AI response"): StreamRunResult {
  return {
    streamResult: { content, reasoning: "", parts: [], toolCalls: [], inputTokens: 10, outputTokens: 20 },
  };
}

function setupDefaultMocks() {
  setStoreState(useChatStore, { modelId: "gpt-4o", providerId: "p1", providerType: "openai" });
  mockDataStore.activeConversationId = "conv-1";
  vi.mocked(providerRepo.getAll).mockResolvedValue([testProvider]);
  vi.mocked(runStreamLoop).mockResolvedValue(mockStreamSuccess());
}

// --- setup ---

beforeEach(() => vi.clearAllMocks());
afterEach(() => resetStore());

// --- tests ---

describe("chatStore — sendMessage", () => {
  describe("validation", () => {
    it("returns early on empty content with no attachments", async () => {
      setupDefaultMocks();
      await useChatStore.getState().sendMessage("   ");
      expect(messageRepo.create).not.toHaveBeenCalled();
    });

    it("sets error when no model selected", async () => {
      setStoreState(useChatStore, { modelId: null });
      await useChatStore.getState().sendMessage("hello");
      expect(useChatStore.getState().error).toMatch(/select a model/i);
    });

    it("sets error when provider not found", async () => {
      setupDefaultMocks();
      vi.mocked(providerRepo.getAll).mockResolvedValue([]);
      await useChatStore.getState().sendMessage("hello");
      expect(useChatStore.getState().error).toMatch(/not configured/i);
    });

    it("falls back to provider by type when id not found", async () => {
      setupDefaultMocks();
      setStoreState(useChatStore, { providerId: "nonexistent" });
      await useChatStore.getState().sendMessage("hello");
      expect(runStreamLoop).toHaveBeenCalledTimes(1);
    });
  });

  describe("new conversation", () => {
    it("creates new conversation when activeConversationId is null", async () => {
      setupDefaultMocks();
      mockDataStore.activeConversationId = null;
      await useChatStore.getState().sendMessage("hello");
      expect(conversationRepo.create).toHaveBeenCalledTimes(1);
      expect(mockDataStore.setActiveConversation).toHaveBeenCalled();
      expect(mockDataStore.loadConversations).toHaveBeenCalled();
    });

    it("uses attachment names for title when content is empty", async () => {
      setupDefaultMocks();
      mockDataStore.activeConversationId = null;
      const draft: DraftAttachment = { id: "a1", type: "file", name: "report.pdf" };
      setStoreState(useChatStore, { ...useChatStore.getState(), draftAttachments: [draft] });
      await useChatStore.getState().sendMessage("  ");
      expect(conversationRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ title: expect.stringContaining("report.pdf") }),
      );
    });
  });

  describe("user message creation", () => {
    it("creates user message in DB and appends to state", async () => {
      setupDefaultMocks();
      await useChatStore.getState().sendMessage("hello");
      expect(messageRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ role: "user", content: "hello" }),
      );
      expect(useChatStore.getState().messages[0]!.role).toBe("user");
    });

    it("saves draft attachments to DB and clears from state", async () => {
      setupDefaultMocks();
      const draft: DraftAttachment = {
        id: "a1", type: "image", name: "pic.png", path: "/tmp/pic.png", mime_type: "image/png", size: 1024,
      };
      setStoreState(useChatStore, { ...useChatStore.getState(), draftAttachments: [draft] });
      await useChatStore.getState().sendMessage("hello");
      expect(attachmentRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ id: "a1", type: "image", name: "pic.png" }),
      );
      expect(useChatStore.getState().draftAttachments).toEqual([]);
    });

    it("updates attachmentsByMessage when drafts present", async () => {
      setupDefaultMocks();
      const draft: DraftAttachment = { id: "a1", type: "image", name: "pic.png" };
      setStoreState(useChatStore, { ...useChatStore.getState(), draftAttachments: [draft] });
      await useChatStore.getState().sendMessage("hello");
      const abm = useChatStore.getState().attachmentsByMessage;
      expect(Object.keys(abm).length).toBeGreaterThan(0);
    });
  });

  describe("attachment processing", () => {
    function setupModelMessages() {
      const msgs = [{ role: "user", content: [{ type: "text", text: "hello" }] }];
      vi.mocked(toModelMessages).mockReturnValue(msgs as ReturnType<typeof toModelMessages>);
      return msgs;
    }

    it("injects image attachments as inline content", async () => {
      setupDefaultMocks();
      setupModelMessages();
      const draft: DraftAttachment = { id: "a1", type: "image", name: "pic.png", content: "data:image/png;base64,abc" };
      setStoreState(useChatStore, { ...useChatStore.getState(), draftAttachments: [draft] });
      vi.mocked(isImageAttachment).mockReturnValue(true);

      await useChatStore.getState().sendMessage("hello");

      const passedOpts = vi.mocked(runStreamLoop).mock.calls[0]![0];
      const userContent = (passedOpts.modelMessages[0] as Record<string, unknown>).content as unknown[];
      expect(userContent).toEqual(
        expect.arrayContaining([expect.objectContaining({ type: "image", image: "data:image/png;base64,abc" })]),
      );
    });

    it("injects PDF as native file when model supports pdf_native", async () => {
      setupDefaultMocks();
      setupModelMessages();
      vi.mocked(getModelOption).mockReturnValue({ pdf_native: true } as ReturnType<typeof getModelOption>);
      vi.mocked(isPdfAttachment).mockReturnValue(true);
      const draft: DraftAttachment = {
        id: "a1", type: "pdf", name: "doc.pdf", content: "data:application/pdf;base64,xyz",
      };
      setStoreState(useChatStore, { ...useChatStore.getState(), draftAttachments: [draft] });

      await useChatStore.getState().sendMessage("hello");

      const passedOpts = vi.mocked(runStreamLoop).mock.calls[0]![0];
      const userContent = (passedOpts.modelMessages[0] as Record<string, unknown>).content as unknown[];
      expect(userContent).toEqual(
        expect.arrayContaining([expect.objectContaining({ type: "file", mediaType: "application/pdf" })]),
      );
    });

    it("adds non-image attachments to manifest text", async () => {
      setupDefaultMocks();
      setupModelMessages();
      vi.mocked(isImageAttachment).mockReturnValue(false);
      vi.mocked(isPdfAttachment).mockReturnValue(false);
      const draft: DraftAttachment = { id: "a1", type: "file", name: "data.csv" };
      setStoreState(useChatStore, { ...useChatStore.getState(), draftAttachments: [draft] });

      await useChatStore.getState().sendMessage("hello");

      const passedOpts = vi.mocked(runStreamLoop).mock.calls[0]![0];
      const userContent = (passedOpts.modelMessages[0] as Record<string, unknown>).content as unknown[];
      const textPart = userContent.find((c: unknown) => (c as Record<string, unknown>).type === "text") as
        | { text: string }
        | undefined;
      expect(textPart?.text).toContain("attachmentId=a1");
      expect(textPart?.text).toContain("data.csv");
    });

    it("handles invoke failure for PDF gracefully", async () => {
      setupDefaultMocks();
      setupModelMessages();
      vi.mocked(isImageAttachment).mockReturnValue(false);
      vi.mocked(getModelOption).mockReturnValue({ pdf_native: true } as ReturnType<typeof getModelOption>);
      vi.mocked(isPdfAttachment).mockReturnValue(true);
      vi.mocked(invoke).mockRejectedValue(new Error("read failed"));
      const draft: DraftAttachment = { id: "a1", type: "pdf", name: "doc.pdf", path: "/tmp/doc.pdf" };
      setStoreState(useChatStore, { ...useChatStore.getState(), draftAttachments: [draft] });

      await useChatStore.getState().sendMessage("hello");
      expect(runStreamLoop).toHaveBeenCalledTimes(1);
    });
  });

  describe("url fetch", () => {
    it("injects fetchBlock when no attachments", async () => {
      setupDefaultMocks();
      vi.mocked(getFetchBlockForText).mockResolvedValue("<fetched>");
      await useChatStore.getState().sendMessage("hello");
      expect(injectFetchBlockIntoLastUserMessage).toHaveBeenCalledWith(expect.anything(), "<fetched>");
    });

    it("includes fetchBlock in text when attachments present", async () => {
      setupDefaultMocks();
      const msgs = [{ role: "user", content: [{ type: "text", text: "hello" }] }];
      vi.mocked(toModelMessages).mockReturnValue(msgs as ReturnType<typeof toModelMessages>);
      const draft: DraftAttachment = { id: "a1", type: "file", name: "f.txt" };
      setStoreState(useChatStore, { ...useChatStore.getState(), draftAttachments: [draft] });
      vi.mocked(getFetchBlockForText).mockResolvedValue("<fetched>");

      await useChatStore.getState().sendMessage("hello");
      // When attachments present, fetchBlock is appended to userText, not via injectFetchBlock
      expect(injectFetchBlockIntoLastUserMessage).not.toHaveBeenCalled();
    });
  });

  describe("streaming success", () => {
    it("calls runStreamLoop with correct params", async () => {
      setupDefaultMocks();
      await useChatStore.getState().sendMessage("hello");
      expect(runStreamLoop).toHaveBeenCalledWith(
        expect.objectContaining({ provider: testProvider, modelId: "gpt-4o" }),
        expect.objectContaining({ onUpdate: expect.any(Function), onRateLimitRetry: expect.any(Function) }),
      );
    });

    it("saves assistant message to DB on success", async () => {
      setupDefaultMocks();
      await useChatStore.getState().sendMessage("hello");
      const calls = vi.mocked(messageRepo.create).mock.calls;
      expect(calls).toHaveLength(2);
      expect(calls[1]![0]).toEqual(expect.objectContaining({ role: "assistant", content: "AI response" }));
    });

    it("resets streaming state after success", async () => {
      setupDefaultMocks();
      await useChatStore.getState().sendMessage("hello");
      expect(useChatStore.getState().isStreaming).toBe(false);
      expect(useChatStore.getState().abortController).toBeNull();
      expect(useChatStore.getState().streamingContent).toBe("");
    });
  });

  describe("error handling", () => {
    it("sets error from finalError and resets stream", async () => {
      setupDefaultMocks();
      vi.mocked(runStreamLoop).mockResolvedValue({
        streamResult: { content: "", reasoning: "", parts: [], toolCalls: [] },
        finalError: "rate limit",
      });
      await useChatStore.getState().sendMessage("hello");
      expect(useChatStore.getState().error).toBe("rate limit");
      expect(useChatStore.getState().isStreaming).toBe(false);
    });

    it("saves partial content on AbortError", async () => {
      setupDefaultMocks();
      vi.mocked(runStreamLoop).mockImplementation(async (_opts, callbacks) => {
        callbacks.onUpdate({ streamingContent: "partial response" });
        throw Object.assign(new Error("Aborted"), { name: "AbortError" });
      });
      await useChatStore.getState().sendMessage("hello");
      // user msg + partial assistant
      expect(messageRepo.create).toHaveBeenCalledTimes(2);
      const lastCall = vi.mocked(messageRepo.create).mock.calls[1]![0];
      expect(lastCall).toEqual(expect.objectContaining({ role: "assistant", content: "partial response" }));
    });

    it("does NOT save on AbortError when streamingContent empty", async () => {
      setupDefaultMocks();
      vi.mocked(runStreamLoop).mockRejectedValue(
        Object.assign(new Error("Aborted"), { name: "AbortError" }),
      );
      await useChatStore.getState().sendMessage("hello");
      // Only user message created, no assistant
      expect(messageRepo.create).toHaveBeenCalledTimes(1);
    });

    it("reports aborted metrics on AbortError", async () => {
      setupDefaultMocks();
      vi.mocked(runStreamLoop).mockRejectedValue(
        Object.assign(new Error("Aborted"), { name: "AbortError" }),
      );
      await useChatStore.getState().sendMessage("hello");
      expect(reportAgentRunMetrics).toHaveBeenCalledWith(expect.anything(), { aborted: true });
    });

    it("sets error and returns on message creation failure", async () => {
      setupDefaultMocks();
      vi.mocked(messageRepo.create).mockRejectedValueOnce(new Error("DB write failed"));
      await useChatStore.getState().sendMessage("hello");
      expect(useChatStore.getState().error).toBe("DB write failed");
      expect(runStreamLoop).not.toHaveBeenCalled();
    });
  });
});
