// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ChatToolbar } from "./ChatToolbar";

// Mock child components to isolate ChatToolbar
vi.mock("./ContextRing", () => ({
  ContextRing: ({ percent }: { percent: number }) => <span data-testid="context-ring">{percent}%</span>,
}));
vi.mock("./ToolbarIcon", () => ({
  ToolbarIcon: ({ title, onClick }: { title: string; onClick?: () => void }) => (
    <button data-testid={`toolbar-${title}`} onClick={onClick}>{title}</button>
  ),
}));
vi.mock("./SkillsPopover", () => ({
  SkillsPopover: () => <span data-testid="skills-popover" />,
}));
vi.mock("./ModelSelector", () => ({
  ModelSelector: () => <span data-testid="model-selector" />,
}));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (k: string) => k }),
}));

beforeEach(() => vi.clearAllMocks());
afterEach(cleanup);

const defaultProps = {
  isStreaming: false,
  canSend: true,
  contextPercent: 42,
  contextTooltip: "42% used",
  modelSelectorOpen: false,
  onModelSelectorOpenChange: vi.fn(),
  onAttachFiles: vi.fn(),
  onSend: vi.fn(),
  onStop: vi.fn(),
};

describe("ChatToolbar", () => {
  it("renders attach files button", () => {
    render(<ChatToolbar {...defaultProps} />);
    expect(screen.getByTestId("toolbar-chat.attachFiles")).toBeTruthy();
  });

  it("renders web search button", () => {
    render(<ChatToolbar {...defaultProps} />);
    expect(screen.getByTestId("toolbar-chat.webSearch")).toBeTruthy();
  });

  it("renders skills popover", () => {
    render(<ChatToolbar {...defaultProps} />);
    expect(screen.getByTestId("skills-popover")).toBeTruthy();
  });

  it("renders model selector", () => {
    render(<ChatToolbar {...defaultProps} />);
    expect(screen.getByTestId("model-selector")).toBeTruthy();
  });

  it("renders context ring with percent", () => {
    render(<ChatToolbar {...defaultProps} />);
    expect(screen.getByTestId("context-ring").textContent).toContain("42%");
  });

  it("renders send button when not streaming", () => {
    render(<ChatToolbar {...defaultProps} />);
    expect(screen.getByTitle("chat.sendMessage")).toBeTruthy();
  });

  it("renders stop button when streaming", () => {
    render(<ChatToolbar {...defaultProps} isStreaming={true} />);
    expect(screen.getByTitle("chat.stopGeneration")).toBeTruthy();
  });

  it("disables send button when canSend is false", () => {
    render(<ChatToolbar {...defaultProps} canSend={false} />);
    const sendBtn = screen.getByTitle("chat.sendMessage") as HTMLButtonElement;
    expect(sendBtn.disabled).toBe(true);
  });

  it("calls onSend when send button clicked", async () => {
    const user = userEvent.setup();
    render(<ChatToolbar {...defaultProps} />);
    await user.click(screen.getByTitle("chat.sendMessage"));
    expect(defaultProps.onSend).toHaveBeenCalledTimes(1);
  });

  it("calls onStop when stop button clicked", async () => {
    const user = userEvent.setup();
    const onStop = vi.fn();
    render(<ChatToolbar {...defaultProps} isStreaming={true} onStop={onStop} />);
    await user.click(screen.getByTitle("chat.stopGeneration"));
    expect(onStop).toHaveBeenCalledTimes(1);
  });

  it("calls onAttachFiles when attach button clicked", async () => {
    const user = userEvent.setup();
    render(<ChatToolbar {...defaultProps} />);
    await user.click(screen.getByTestId("toolbar-chat.attachFiles"));
    expect(defaultProps.onAttachFiles).toHaveBeenCalledTimes(1);
  });
});
