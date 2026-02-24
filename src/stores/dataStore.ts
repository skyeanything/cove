import { create } from "zustand";
import type { Assistant, Conversation, Message, Provider, Prompt } from "@/db/types";
import { assistantRepo } from "@/db/repos/assistantRepo";
import { conversationRepo } from "@/db/repos/conversationRepo";
import { messageRepo } from "@/db/repos/messageRepo";
import { providerRepo } from "@/db/repos/providerRepo";
import { promptRepo } from "@/db/repos/promptRepo";
import { useWorkspaceStore } from "@/stores/workspaceStore";

interface DataState {
  // Data
  assistants: Assistant[];
  conversations: Conversation[];
  providers: Provider[];
  prompts: Prompt[];
  messages: Message[];
  activeConversationId: string | null;

  // Loading state
  initialized: boolean;

  // Actions
  init: () => Promise<void>;
  loadAssistants: () => Promise<void>;
  loadConversations: () => Promise<void>;
  loadProviders: () => Promise<void>;
  loadPrompts: () => Promise<void>;
  loadMessages: (conversationId: string) => Promise<void>;
  setActiveConversation: (id: string | null) => void;

  // Conversation
  updateConversation: (id: string, data: Partial<Conversation>) => Promise<void>;
  setPinned: (id: string, pinned: number) => Promise<void>;
  deleteConversation: (id: string) => Promise<void>;

  // Provider CRUD
  createProvider: (provider: Omit<Provider, "created_at" | "updated_at">) => Promise<void>;
  updateProvider: (id: string, data: Partial<Provider>) => Promise<void>;
  deleteProvider: (id: string) => Promise<void>;
  toggleProvider: (id: string) => Promise<void>;
}

export const useDataStore = create<DataState>()((set, get) => ({
  assistants: [],
  conversations: [],
  providers: [],
  prompts: [],
  messages: [],
  activeConversationId: null,
  initialized: false,

  async init() {
    await Promise.all([
      get().loadAssistants(),
      get().loadConversations(),
      get().loadProviders(),
      get().loadPrompts(),
      useWorkspaceStore.getState().init(),
    ]);
    // 刚进入应用时不恢复上次选中的会话，保持左侧不选中、右侧为新会话状态，避免「左侧高亮一条、右侧却是新窗口」的不一致
    set({ initialized: true });
  },

  async loadAssistants() {
    const assistants = await assistantRepo.getAll();
    set({ assistants });
  },

  async loadConversations() {
    const conversations = await conversationRepo.getAll();
    set({ conversations });
  },

  async loadProviders() {
    const providers = await providerRepo.getAll();
    set({ providers });
  },

  async loadPrompts() {
    const prompts = await promptRepo.getAll();
    set({ prompts });
  },

  async loadMessages(conversationId: string) {
    const messages = await messageRepo.getByConversation(conversationId);
    set({ messages });
  },

  setActiveConversation(id: string | null) {
    if (typeof localStorage !== "undefined") {
      if (id) localStorage.setItem("office_chat_active_conversation_id", id);
      else localStorage.removeItem("office_chat_active_conversation_id");
    }
    set({ activeConversationId: id, messages: [] });
    if (id) {
      get().loadMessages(id);
    }
  },

  async updateConversation(id, data) {
    await conversationRepo.update(id, data);
    await get().loadConversations();
  },

  async setPinned(id, pinned) {
    await conversationRepo.setPinned(id, pinned);
    await get().loadConversations();
  },

  async deleteConversation(id) {
    await messageRepo.deleteByConversation(id);
    await conversationRepo.delete(id);
    if (get().activeConversationId === id) {
      if (typeof localStorage !== "undefined") localStorage.removeItem("office_chat_active_conversation_id");
      set({ activeConversationId: null, messages: [] });
    }
    await get().loadConversations();
  },

  async createProvider(provider) {
    await providerRepo.create(provider);
    await get().loadProviders();
  },

  async updateProvider(id, data) {
    await providerRepo.update(id, data);
    await get().loadProviders();
  },

  async deleteProvider(id) {
    await providerRepo.delete(id);
    await get().loadProviders();
  },

  async toggleProvider(id) {
    const provider = get().providers.find((p) => p.id === id);
    if (provider) {
      await providerRepo.update(id, { enabled: provider.enabled ? 0 : 1 });
      await get().loadProviders();
    }
  },
}));
