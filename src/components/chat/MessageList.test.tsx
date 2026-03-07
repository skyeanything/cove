// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";

afterEach(cleanup);

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (k: string) => k }),
}));

const LONG_URL = "https://example.com/" + "a".repeat(400);

let mockMessages: Array<{ id: string; role: string; content: string; parent_id?: string; parts?: string }> = [];
let mockIsStreaming = false;
let mockAttachmentsByMessage: Record<string, unknown[]> = {};

vi.mock("@/stores/chatStore", () => ({
  useChatStore: (sel: (s: Record<string, unknown>) => unknown) =>
    sel({
      messages: mockMessages,
      isStreaming: mockIsStreaming,
      streamingContent: "",
      streamingReasoning: "",
      streamingToolCalls: [],
      streamingParts: [],
      editAndResend: vi.fn(),
      regenerateMessage: vi.fn(),
      attachmentsByMessage: mockAttachmentsByMessage,
    }),
}));

vi.mock("@/stores/permissionStore", () => ({
  usePermissionStore: (sel: (s: Record<string, unknown>) => unknown) =>
    sel({ pendingAsk: null }),
}));

vi.mock("@/hooks/useAutoScroll", () => ({
  useAutoScroll: () => ({ scrollRef: { current: null }, isDetached: false, scrollToBottom: vi.fn() }),
}));

vi.mock("./ScrollToBottomButton", () => ({
  ScrollToBottomButton: () => null,
}));

vi.mock("./AssistantMessage", () => ({
  AssistantMessage: () => <div data-testid="assistant-msg" />,
  CopyFeedbackIcon: () => null,
  ActionButton: () => null,
  COPY_FEEDBACK_MS: 1500,
}));

vi.mock("./AttachmentRow", () => ({
  UserAttachmentList: () => null,
}));

vi.mock("@/lib/render-mentions", () => ({
  renderContentWithMentions: (c: string) => c,
}));

vi.mock("@/components/ui/button", () => ({
  Button: ({ children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & { children: React.ReactNode }) => (
    <button {...props}>{children}</button>
  ),
}));

import { MessageList } from "./MessageList";

describe("MessageList overflow prevention", () => {
  beforeEach(() => {
    mockMessages = [];
    mockIsStreaming = false;
    mockAttachmentsByMessage = {};
  });

  it("scroll container has overflow-x-hidden", () => {
    mockMessages = [{ id: "1", role: "user", content: LONG_URL }];
    const { container } = render(<MessageList />);
    const scrollDiv = container.querySelector(".overflow-y-auto");
    expect(scrollDiv).toBeTruthy();
    expect(scrollDiv!.className).toContain("overflow-x-hidden");
  });

  it("user message wrapper has min-w-0 for flex shrink", () => {
    mockMessages = [{ id: "1", role: "user", content: LONG_URL }];
    const { container } = render(<MessageList />);
    const wrapper = container.querySelector(".max-w-\\[85\\%\\]");
    expect(wrapper).toBeTruthy();
    expect(wrapper!.className).toContain("min-w-0");
  });

  it("user message content div has break-words and max-w-full", () => {
    mockMessages = [{ id: "1", role: "user", content: LONG_URL }];
    const { container } = render(<MessageList />);
    const bubble = container.querySelector(".bg-background-tertiary");
    expect(bubble).toBeTruthy();
    expect(bubble!.className).toContain("break-words");
    expect(bubble!.className).toContain("max-w-full");
  });

  it("user message content div retains whitespace-pre-wrap", () => {
    mockMessages = [{ id: "1", role: "user", content: "line1\nline2" }];
    const { container } = render(<MessageList />);
    const bubble = container.querySelector(".bg-background-tertiary");
    expect(bubble).toBeTruthy();
    expect(bubble!.className).toContain("whitespace-pre-wrap");
  });
});
