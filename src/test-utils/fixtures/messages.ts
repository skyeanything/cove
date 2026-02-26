import type {
  Message,
  Conversation,
  Attachment,
  Assistant,
} from "@/db/types";

const DEFAULT_TIMESTAMP = "2025-01-01T00:00:00Z";

let messageCounter = 0;
let conversationCounter = 0;

export function makeMessage(overrides: Partial<Message> = {}): Message {
  messageCounter += 1;
  return {
    id: `msg-${messageCounter}`,
    conversation_id: "conv-1",
    role: "user",
    content: "Hello, world!",
    reasoning: undefined,
    parts: undefined,
    model: undefined,
    tokens_input: undefined,
    tokens_output: undefined,
    parent_id: undefined,
    created_at: DEFAULT_TIMESTAMP,
    ...overrides,
  };
}

export function makeConversation(
  overrides: Partial<Conversation> = {},
): Conversation {
  conversationCounter += 1;
  return {
    id: `conv-${conversationCounter}`,
    assistant_id: "assistant-1",
    title: "Test Conversation",
    pinned: 0,
    model_override: undefined,
    system_instruction_override: undefined,
    temperature_override: undefined,
    provider_type: undefined,
    workspace_path: undefined,
    created_at: DEFAULT_TIMESTAMP,
    updated_at: DEFAULT_TIMESTAMP,
    ...overrides,
  };
}

export function makeAttachment(
  overrides: Partial<Attachment> = {},
): Attachment {
  return {
    id: "attach-1",
    message_id: "msg-1",
    type: "image",
    name: "screenshot.png",
    path: "/tmp/screenshot.png",
    mime_type: "image/png",
    size: 1024,
    content: undefined,
    created_at: DEFAULT_TIMESTAMP,
    ...overrides,
  };
}

export function makeAssistant(overrides: Partial<Assistant> = {}): Assistant {
  return {
    id: "assistant-1",
    name: "Test Assistant",
    icon: undefined,
    model: "gpt-4o",
    provider: "provider-1",
    system_instruction: undefined,
    temperature: 0.7,
    top_p: 1,
    max_tokens: undefined,
    frequency_penalty: 0,
    presence_penalty: 0,
    web_search_enabled: 0,
    artifacts_enabled: 0,
    tools_enabled: 0,
    sort_order: 0,
    created_at: DEFAULT_TIMESTAMP,
    updated_at: DEFAULT_TIMESTAMP,
    ...overrides,
  };
}

/**
 * Creates a user + assistant message pair for a conversation.
 */
export function makeMessagePair(
  conversationId: string = "conv-1",
  userContent: string = "Hello",
  assistantContent: string = "Hi there!",
): [Message, Message] {
  const userMsg = makeMessage({
    conversation_id: conversationId,
    role: "user",
    content: userContent,
  });
  const assistantMsg = makeMessage({
    conversation_id: conversationId,
    role: "assistant",
    content: assistantContent,
    parent_id: userMsg.id,
    model: "gpt-4o",
  });
  return [userMsg, assistantMsg];
}
