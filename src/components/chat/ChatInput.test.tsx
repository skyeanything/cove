// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ChatInput } from "./ChatInput";

// --- Mock stores ---
const mockSendMessage = vi.fn();
const mockStopGeneration = vi.fn();
const mockAddDraftAttachments = vi.fn();
const mockRemoveDraftAttachment = vi.fn();

vi.mock("@/stores/chatStore", () => ({
  useChatStore: (sel: (s: Record<string, unknown>) => unknown) => {
    const state = {
      sendMessage: mockSendMessage,
      stopGeneration: mockStopGeneration,
      addDraftAttachments: mockAddDraftAttachments,
      removeDraftAttachment: mockRemoveDraftAttachment,
      draftAttachments: [],
      isStreaming: false,
      modelId: "gpt-4",
      providerId: "openai",
      messages: [],
      error: null,
      isCompressing: false,
    };
    return sel(state);
  },
}));

vi.mock("@/stores/dataStore", () => ({
  useDataStore: (sel: (s: Record<string, unknown>) => unknown) =>
    sel({ providers: [{ id: "openai", type: "openai" }] }),
}));

vi.mock("@/stores/workspaceStore", () => ({
  useWorkspaceStore: (sel: (s: Record<string, unknown>) => unknown) =>
    sel({ activeWorkspace: null }),
}));

vi.mock("@/stores/settingsStore", () => ({
  useSettingsStore: (sel: (s: Record<string, unknown>) => unknown) =>
    sel({ sendMessageShortcut: "enter" }),
}));

vi.mock("@/stores/skillsStore", () => ({
  useSkillsStore: (sel: (s: Record<string, unknown>) => unknown) =>
    sel({ externalSkills: [] }),
}));

// --- Mock dependencies ---
vi.mock("@/lib/ai/model-service", () => ({
  getModelOption: () => ({ context_window: 128000 }),
}));
vi.mock("@/lib/ai/context-compression", () => ({
  estimateNextTurnTokens: () => 100,
}));
vi.mock("@tauri-apps/plugin-opener", () => ({
  revealItemInDir: vi.fn(),
}));
vi.mock("@/lib/ai/skills/loader", () => ({
  listSkills: () => [],
}));
vi.mock("@/lib/ai/tools/tool-meta", () => ({
  USER_VISIBLE_TOOLS: [
    { id: "bash", name: "Shell", description: "Run shell", category: "core", userVisible: true },
  ],
}));
vi.mock("@/lib/attachment-utils", () => ({
  isImageAttachment: () => false,
}));
vi.mock("@/lib/chat-input-utils", () => ({
  isImageFile: () => false,
  imageFilesToDraftAttachments: async () => [],
  nonImageFilesToDraftAttachments: async () => [],
}));
vi.mock("@/hooks/useAttachFiles", () => ({
  pickAndSaveAttachments: vi.fn(),
}));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (k: string) => k }),
}));

// --- Mock child components ---
vi.mock("./WorkspacePopover", () => ({
  WorkspacePopover: () => null,
}));
vi.mock("./AttachmentBar", () => ({
  AttachmentBar: () => null,
}));

const mockUpdateMention = vi.fn();
const mockCloseMention = vi.fn();
const mockInsertMention = vi.fn(() => ({ newMessage: "@tool:bash ", newCursorPos: 11 }));
let mockMentionState = { open: false, query: "", triggerIndex: -1 };

vi.mock("@/hooks/useMentionDetect", () => ({
  useMentionDetect: () => ({
    mentionState: mockMentionState,
    updateMention: mockUpdateMention,
    closeMention: mockCloseMention,
    insertMention: mockInsertMention,
  }),
}));
vi.mock("@/hooks/useMentionFiles", () => ({
  useMentionFiles: () => [],
}));
vi.mock("./MentionPopover", () => ({
  MentionPopover: ({ open }: { open: boolean }) =>
    open ? <div data-testid="mention-popover" /> : null,
  buildMentionItems: () =>
    mockMentionState.open
      ? [{ type: "tool", id: "bash", label: "bash", description: "Shell" }]
      : [],
}));
vi.mock("./ChatToolbar", () => ({
  ChatToolbar: ({ onSend, onStop }: { onSend: () => void; onStop: () => void }) => (
    <div data-testid="chat-toolbar">
      <button data-testid="send-btn" onClick={onSend}>Send</button>
      <button data-testid="stop-btn" onClick={onStop}>Stop</button>
    </div>
  ),
}));

beforeEach(() => {
  vi.clearAllMocks();
  mockMentionState = { open: false, query: "", triggerIndex: -1 };
});
afterEach(cleanup);

describe("ChatInput", () => {
  it("renders textarea and toolbar", () => {
    render(<ChatInput />);
    expect(screen.getByRole("textbox")).toBeTruthy();
    expect(screen.getByTestId("chat-toolbar")).toBeTruthy();
  });

  it("calls updateMention on text change", async () => {
    const user = userEvent.setup();
    render(<ChatInput />);
    const textarea = screen.getByRole("textbox");
    await user.type(textarea, "@");
    expect(mockUpdateMention).toHaveBeenCalled();
  });

  it("shows MentionPopover when mentionState.open is true", () => {
    mockMentionState = { open: true, query: "ba", triggerIndex: 0 };
    render(<ChatInput />);
    expect(screen.getByTestId("mention-popover")).toBeTruthy();
  });

  it("hides MentionPopover when mentionState.open is false", () => {
    mockMentionState = { open: false, query: "", triggerIndex: -1 };
    render(<ChatInput />);
    expect(screen.queryByTestId("mention-popover")).toBeNull();
  });

  it("calls closeMention on Escape when mention is open", () => {
    mockMentionState = { open: true, query: "ba", triggerIndex: 0 };
    render(<ChatInput />);
    const textarea = screen.getByRole("textbox");
    fireEvent.keyDown(textarea, { key: "Escape" });
    expect(mockCloseMention).toHaveBeenCalledTimes(1);
  });

  it("calls insertMention on Enter when mention is open", () => {
    mockMentionState = { open: true, query: "ba", triggerIndex: 0 };
    render(<ChatInput />);
    const textarea = screen.getByRole("textbox");
    fireEvent.keyDown(textarea, { key: "Enter" });
    expect(mockInsertMention).toHaveBeenCalled();
  });

  it("calls insertMention on Tab when mention is open", () => {
    mockMentionState = { open: true, query: "ba", triggerIndex: 0 };
    render(<ChatInput />);
    const textarea = screen.getByRole("textbox");
    fireEvent.keyDown(textarea, { key: "Tab" });
    expect(mockInsertMention).toHaveBeenCalled();
  });

  it("does not send message on Enter when mention is open", () => {
    mockMentionState = { open: true, query: "ba", triggerIndex: 0 };
    render(<ChatInput />);
    const textarea = screen.getByRole("textbox");
    fireEvent.keyDown(textarea, { key: "Enter" });
    expect(mockSendMessage).not.toHaveBeenCalled();
  });

  it("sends message on Enter when mention is closed", async () => {
    const user = userEvent.setup();
    render(<ChatInput />);
    const textarea = screen.getByRole("textbox");
    await user.type(textarea, "hello");
    fireEvent.keyDown(textarea, { key: "Enter" });
    expect(mockSendMessage).toHaveBeenCalledTimes(1);
  });

  it("shows slash commands when message starts with /", async () => {
    vi.mocked(await import("@/lib/ai/skills/loader")).listSkills = vi.fn(() => [
      { name: "officellm", description: "Office", emoji: "📦" },
    ]) as unknown as typeof import("@/lib/ai/skills/loader").listSkills;

    const user = userEvent.setup();
    render(<ChatInput />);
    const textarea = screen.getByRole("textbox");
    await user.type(textarea, "/");
    // Slash command dropdown should appear
    expect(screen.queryByText(/\/skill:/)).toBeTruthy();
  });
});
