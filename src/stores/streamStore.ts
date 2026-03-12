import { create } from "zustand";
import type { ToolCallInfo, MessagePart } from "./chat-types";

export interface ConversationStreamState {
  isStreaming: boolean;
  streamingContent: string;
  streamingReasoning: string;
  streamingToolCalls: ToolCallInfo[];
  streamingParts: MessagePart[];
  abortController: AbortController | null;
  isCompressing: boolean;
  compressionNotice: string | null;
}

interface StreamStore {
  streams: Record<string, ConversationStreamState>;

  startStream(conversationId: string, abortController: AbortController): void;
  updateStream(conversationId: string, update: Partial<ConversationStreamState>): void;
  endStream(conversationId: string): void;
  abortStream(conversationId: string): void;
  getStream(conversationId: string): ConversationStreamState | undefined;
  isConversationStreaming(conversationId: string): boolean;
}

const INITIAL_STREAM_STATE: Omit<ConversationStreamState, "abortController"> = {
  isStreaming: true,
  streamingContent: "",
  streamingReasoning: "",
  streamingToolCalls: [],
  streamingParts: [],
  isCompressing: false,
  compressionNotice: null,
};

export const useStreamStore = create<StreamStore>()((set, get) => ({
  streams: {},

  startStream(conversationId, abortController) {
    set((state) => ({
      streams: {
        ...state.streams,
        [conversationId]: { ...INITIAL_STREAM_STATE, abortController },
      },
    }));
  },

  updateStream(conversationId, update) {
    set((state) => {
      const existing = state.streams[conversationId];
      if (!existing) return state;
      return {
        streams: {
          ...state.streams,
          [conversationId]: { ...existing, ...update },
        },
      };
    });
  },

  endStream(conversationId) {
    set((state) => {
      const { [conversationId]: _, ...rest } = state.streams;
      return { streams: rest };
    });
  },

  abortStream(conversationId) {
    const stream = get().streams[conversationId];
    if (stream?.abortController) {
      stream.abortController.abort();
    }
    get().endStream(conversationId);
  },

  getStream(conversationId) {
    return get().streams[conversationId];
  },

  isConversationStreaming(conversationId) {
    return get().streams[conversationId]?.isStreaming === true;
  },
}));
