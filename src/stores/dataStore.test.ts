import { describe, it, expect, afterEach, vi } from "vitest";

vi.mock("@/db/repos/assistantRepo", () => ({
  assistantRepo: { getAll: vi.fn() },
}));
vi.mock("@/db/repos/conversationRepo", () => ({
  conversationRepo: {
    getAll: vi.fn(),
    update: vi.fn(),
    setPinned: vi.fn(),
    delete: vi.fn(),
  },
}));
vi.mock("@/db/repos/messageRepo", () => ({
  messageRepo: { getByConversation: vi.fn(), deleteByConversation: vi.fn() },
}));
vi.mock("@/db/repos/providerRepo", () => ({
  providerRepo: {
    getAll: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
}));
vi.mock("@/db/repos/promptRepo", () => ({
  promptRepo: { getAll: vi.fn() },
}));
vi.mock("@/stores/workspaceStore", () => ({
  useWorkspaceStore: { getState: vi.fn(() => ({ init: vi.fn() })) },
}));

import { useDataStore } from "./dataStore";
import { assistantRepo } from "@/db/repos/assistantRepo";
import { conversationRepo } from "@/db/repos/conversationRepo";
import { messageRepo } from "@/db/repos/messageRepo";
import { providerRepo } from "@/db/repos/providerRepo";
import { promptRepo } from "@/db/repos/promptRepo";
import { useWorkspaceStore } from "@/stores/workspaceStore";
import { createStoreReset } from "@/test-utils/mock-store";
import {
  makeAssistant,
  makeConversation,
  makeMessage,
} from "@/test-utils/fixtures/messages";
import { makeProvider } from "@/test-utils/fixtures/providers";

// Explicit localStorage stub — tests are environment-agnostic.
// happy-dom's localStorage may be a plain {} without Web Storage methods in
// some versions, causing TypeError on .clear()/.setItem()/.removeItem().
const _lsStore = new Map<string, string>();
const localStorageMock = {
  getItem: (key: string): string | null => _lsStore.get(key) ?? null,
  setItem: (key: string, value: string): void => {
    _lsStore.set(key, value);
  },
  removeItem: (key: string): void => {
    _lsStore.delete(key);
  },
  clear: (): void => {
    _lsStore.clear();
  },
};
vi.stubGlobal("localStorage", localStorageMock);

const resetStore = createStoreReset(useDataStore);
afterEach(() => {
  resetStore();
  vi.clearAllMocks();
  localStorageMock.clear();
});

// Helper: build mock Prompt
function makePrompt(overrides: { id?: string; name?: string } = {}) {
  return {
    id: overrides.id ?? "prompt-1",
    name: overrides.name ?? "Test Prompt",
    content: "Prompt content",
    builtin: 0,
    sort_order: 0,
    created_at: "2025-01-01T00:00:00Z",
    updated_at: "2025-01-01T00:00:00Z",
  };
}

describe("dataStore", () => {
  describe("init", () => {
    it("loads all data sources in parallel and sets initialized=true", async () => {
      const assistant = makeAssistant();
      const conversation = makeConversation();
      const provider = makeProvider();
      const prompt = makePrompt();

      vi.mocked(assistantRepo.getAll).mockResolvedValue([assistant]);
      vi.mocked(conversationRepo.getAll).mockResolvedValue([conversation]);
      vi.mocked(providerRepo.getAll).mockResolvedValue([provider]);
      vi.mocked(promptRepo.getAll).mockResolvedValue([prompt]);

      await useDataStore.getState().init();

      const state = useDataStore.getState();
      expect(state.assistants).toEqual([assistant]);
      expect(state.conversations).toEqual([conversation]);
      expect(state.providers).toEqual([provider]);
      expect(state.prompts).toEqual([prompt]);
      expect(state.initialized).toBe(true);
    });

    it("calls workspaceStore.init()", async () => {
      const mockInit = vi.fn().mockResolvedValue(undefined);
      vi.mocked(useWorkspaceStore.getState).mockReturnValue(
        { init: mockInit } as unknown as ReturnType<typeof useWorkspaceStore.getState>,
      );

      vi.mocked(assistantRepo.getAll).mockResolvedValue([]);
      vi.mocked(conversationRepo.getAll).mockResolvedValue([]);
      vi.mocked(providerRepo.getAll).mockResolvedValue([]);
      vi.mocked(promptRepo.getAll).mockResolvedValue([]);

      await useDataStore.getState().init();

      expect(mockInit).toHaveBeenCalledOnce();
    });

    it("starts with initialized=false before init is called", () => {
      expect(useDataStore.getState().initialized).toBe(false);
    });
  });

  describe("loadAssistants", () => {
    it("populates assistants from repo", async () => {
      const a1 = makeAssistant({ id: "a1", name: "Alice" });
      const a2 = makeAssistant({ id: "a2", name: "Bob" });
      vi.mocked(assistantRepo.getAll).mockResolvedValue([a1, a2]);

      await useDataStore.getState().loadAssistants();

      expect(useDataStore.getState().assistants).toEqual([a1, a2]);
    });

    it("sets empty array when repo returns empty", async () => {
      vi.mocked(assistantRepo.getAll).mockResolvedValue([]);
      await useDataStore.getState().loadAssistants();
      expect(useDataStore.getState().assistants).toEqual([]);
    });
  });

  describe("loadConversations", () => {
    it("populates conversations from repo", async () => {
      const c = makeConversation({ title: "My Conversation" });
      vi.mocked(conversationRepo.getAll).mockResolvedValue([c]);

      await useDataStore.getState().loadConversations();

      expect(useDataStore.getState().conversations).toEqual([c]);
    });

    it("sets empty array when repo returns empty", async () => {
      vi.mocked(conversationRepo.getAll).mockResolvedValue([]);
      await useDataStore.getState().loadConversations();
      expect(useDataStore.getState().conversations).toEqual([]);
    });
  });

  describe("loadProviders", () => {
    it("populates providers from repo", async () => {
      const p = makeProvider({ id: "prov-1", name: "My Provider" });
      vi.mocked(providerRepo.getAll).mockResolvedValue([p]);

      await useDataStore.getState().loadProviders();

      expect(useDataStore.getState().providers).toEqual([p]);
    });

    it("sets empty array when repo returns empty", async () => {
      vi.mocked(providerRepo.getAll).mockResolvedValue([]);
      await useDataStore.getState().loadProviders();
      expect(useDataStore.getState().providers).toEqual([]);
    });
  });

  describe("loadPrompts", () => {
    it("populates prompts from repo", async () => {
      const prompt = makePrompt({ id: "pr-1", name: "Custom Prompt" });
      vi.mocked(promptRepo.getAll).mockResolvedValue([prompt]);

      await useDataStore.getState().loadPrompts();

      expect(useDataStore.getState().prompts).toEqual([prompt]);
    });

    it("sets empty array when repo returns empty", async () => {
      vi.mocked(promptRepo.getAll).mockResolvedValue([]);
      await useDataStore.getState().loadPrompts();
      expect(useDataStore.getState().prompts).toEqual([]);
    });
  });

  describe("loadMessages", () => {
    it("loads messages for the specified conversationId", async () => {
      const m1 = makeMessage({ conversation_id: "conv-42" });
      const m2 = makeMessage({ conversation_id: "conv-42" });
      vi.mocked(messageRepo.getByConversation).mockResolvedValue([m1, m2]);

      await useDataStore.getState().loadMessages("conv-42");

      expect(messageRepo.getByConversation).toHaveBeenCalledWith("conv-42");
      expect(useDataStore.getState().messages).toEqual([m1, m2]);
    });

    it("sets empty array when conversation has no messages", async () => {
      vi.mocked(messageRepo.getByConversation).mockResolvedValue([]);
      await useDataStore.getState().loadMessages("conv-empty");
      expect(useDataStore.getState().messages).toEqual([]);
    });
  });

  describe("setActiveConversation", () => {
    it("sets activeConversationId and stores in localStorage", async () => {
      vi.mocked(messageRepo.getByConversation).mockResolvedValue([]);

      useDataStore.getState().setActiveConversation("conv-1");

      expect(useDataStore.getState().activeConversationId).toBe("conv-1");
      expect(localStorage.getItem("office_chat_active_conversation_id")).toBe(
        "conv-1",
      );
    });

    it("clears messages immediately when setting a new conversation", () => {
      // Pre-load messages into state
      useDataStore.setState({ messages: [makeMessage()] });

      vi.mocked(messageRepo.getByConversation).mockResolvedValue([]);
      useDataStore.getState().setActiveConversation("conv-2");

      // Messages are cleared synchronously before async load
      expect(useDataStore.getState().messages).toEqual([]);
    });

    it("calls loadMessages with the given id", async () => {
      const msg = makeMessage({ conversation_id: "conv-5" });
      vi.mocked(messageRepo.getByConversation).mockResolvedValue([msg]);

      useDataStore.getState().setActiveConversation("conv-5");

      await vi.waitFor(() => {
        expect(messageRepo.getByConversation).toHaveBeenCalledWith("conv-5");
      });
    });

    it("sets activeConversationId to null and removes localStorage key", () => {
      localStorage.setItem("office_chat_active_conversation_id", "conv-1");
      useDataStore.setState({ activeConversationId: "conv-1" });

      useDataStore.getState().setActiveConversation(null);

      expect(useDataStore.getState().activeConversationId).toBeNull();
      expect(
        localStorage.getItem("office_chat_active_conversation_id"),
      ).toBeNull();
    });

    it("does not call loadMessages when id is null", () => {
      useDataStore.getState().setActiveConversation(null);
      expect(messageRepo.getByConversation).not.toHaveBeenCalled();
    });
  });

  describe("updateConversation", () => {
    it("calls repo.update and then reloads conversations", async () => {
      const updated = makeConversation({ id: "conv-1", title: "Updated" });
      vi.mocked(conversationRepo.update).mockResolvedValue(undefined);
      vi.mocked(conversationRepo.getAll).mockResolvedValue([updated]);

      await useDataStore.getState().updateConversation("conv-1", { title: "Updated" });

      expect(conversationRepo.update).toHaveBeenCalledWith("conv-1", {
        title: "Updated",
      });
      expect(useDataStore.getState().conversations).toEqual([updated]);
    });
  });

  describe("setPinned", () => {
    it("calls repo.setPinned and then reloads conversations", async () => {
      const conv = makeConversation({ id: "conv-1", pinned: 1 });
      vi.mocked(conversationRepo.setPinned).mockResolvedValue(undefined);
      vi.mocked(conversationRepo.getAll).mockResolvedValue([conv]);

      await useDataStore.getState().setPinned("conv-1", 1);

      expect(conversationRepo.setPinned).toHaveBeenCalledWith("conv-1", 1);
      expect(useDataStore.getState().conversations).toEqual([conv]);
    });
  });

  describe("deleteConversation", () => {
    it("deletes messages and conversation from repos for non-active conversation", async () => {
      vi.mocked(messageRepo.deleteByConversation).mockResolvedValue(undefined);
      vi.mocked(conversationRepo.delete).mockResolvedValue(undefined);
      vi.mocked(conversationRepo.getAll).mockResolvedValue([]);

      await useDataStore.getState().deleteConversation("conv-x");

      expect(messageRepo.deleteByConversation).toHaveBeenCalledWith("conv-x");
      expect(conversationRepo.delete).toHaveBeenCalledWith("conv-x");
    });

    it("does NOT clear activeConversationId for non-active conversation", async () => {
      useDataStore.setState({ activeConversationId: "conv-other" });
      vi.mocked(messageRepo.deleteByConversation).mockResolvedValue(undefined);
      vi.mocked(conversationRepo.delete).mockResolvedValue(undefined);
      vi.mocked(conversationRepo.getAll).mockResolvedValue([]);

      await useDataStore.getState().deleteConversation("conv-x");

      expect(useDataStore.getState().activeConversationId).toBe("conv-other");
    });

    it("clears activeConversationId and localStorage when deleting the active conversation", async () => {
      localStorage.setItem("office_chat_active_conversation_id", "conv-active");
      useDataStore.setState({
        activeConversationId: "conv-active",
        messages: [makeMessage()],
      });
      vi.mocked(messageRepo.deleteByConversation).mockResolvedValue(undefined);
      vi.mocked(conversationRepo.delete).mockResolvedValue(undefined);
      vi.mocked(conversationRepo.getAll).mockResolvedValue([]);

      await useDataStore.getState().deleteConversation("conv-active");

      expect(useDataStore.getState().activeConversationId).toBeNull();
      expect(useDataStore.getState().messages).toEqual([]);
      expect(
        localStorage.getItem("office_chat_active_conversation_id"),
      ).toBeNull();
    });

    it("reloads conversations after deletion", async () => {
      const remaining = makeConversation({ id: "conv-2" });
      vi.mocked(messageRepo.deleteByConversation).mockResolvedValue(undefined);
      vi.mocked(conversationRepo.delete).mockResolvedValue(undefined);
      vi.mocked(conversationRepo.getAll).mockResolvedValue([remaining]);

      await useDataStore.getState().deleteConversation("conv-1");

      expect(useDataStore.getState().conversations).toEqual([remaining]);
    });
  });

  describe("createProvider", () => {
    it("calls repo.create and then reloads providers", async () => {
      const newProvider = makeProvider({ id: "prov-new", name: "New Provider" });
      vi.mocked(providerRepo.create).mockResolvedValue(undefined);
      vi.mocked(providerRepo.getAll).mockResolvedValue([newProvider]);

      const { created_at: _ca, updated_at: _ua, ...providerData } = newProvider;
      await useDataStore.getState().createProvider(providerData);

      expect(providerRepo.create).toHaveBeenCalledWith(providerData);
      expect(useDataStore.getState().providers).toEqual([newProvider]);
    });
  });

  describe("updateProvider", () => {
    it("calls repo.update and then reloads providers", async () => {
      const updated = makeProvider({ id: "prov-1", name: "Updated Name" });
      vi.mocked(providerRepo.update).mockResolvedValue(undefined);
      vi.mocked(providerRepo.getAll).mockResolvedValue([updated]);

      await useDataStore.getState().updateProvider("prov-1", {
        name: "Updated Name",
      });

      expect(providerRepo.update).toHaveBeenCalledWith("prov-1", {
        name: "Updated Name",
      });
      expect(useDataStore.getState().providers).toEqual([updated]);
    });
  });

  describe("deleteProvider", () => {
    it("calls repo.delete and then reloads providers", async () => {
      vi.mocked(providerRepo.delete).mockResolvedValue(undefined);
      vi.mocked(providerRepo.getAll).mockResolvedValue([]);

      await useDataStore.getState().deleteProvider("prov-1");

      expect(providerRepo.delete).toHaveBeenCalledWith("prov-1");
      expect(useDataStore.getState().providers).toEqual([]);
    });
  });

  describe("toggleProvider", () => {
    it("disables an enabled provider", async () => {
      const provider = makeProvider({ id: "prov-1", enabled: 1 });
      useDataStore.setState({ providers: [provider] });
      vi.mocked(providerRepo.update).mockResolvedValue(undefined);
      vi.mocked(providerRepo.getAll).mockResolvedValue([
        { ...provider, enabled: 0 },
      ]);

      await useDataStore.getState().toggleProvider("prov-1");

      expect(providerRepo.update).toHaveBeenCalledWith("prov-1", {
        enabled: 0,
      });
    });

    it("enables a disabled provider", async () => {
      const provider = makeProvider({ id: "prov-1", enabled: 0 });
      useDataStore.setState({ providers: [provider] });
      vi.mocked(providerRepo.update).mockResolvedValue(undefined);
      vi.mocked(providerRepo.getAll).mockResolvedValue([
        { ...provider, enabled: 1 },
      ]);

      await useDataStore.getState().toggleProvider("prov-1");

      expect(providerRepo.update).toHaveBeenCalledWith("prov-1", {
        enabled: 1,
      });
    });

    it("does nothing when provider does not exist", async () => {
      useDataStore.setState({ providers: [] });

      await useDataStore.getState().toggleProvider("non-existent");

      expect(providerRepo.update).not.toHaveBeenCalled();
    });
  });
});
