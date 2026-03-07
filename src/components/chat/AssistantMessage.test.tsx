// @vitest-environment happy-dom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";

afterEach(cleanup);

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (k: string) => k }),
}));

vi.mock("@/stores/chatStore", () => ({
  useChatStore: (sel: (s: Record<string, unknown>) => unknown) =>
    sel({ isStreaming: false, regenerateMessage: vi.fn() }),
}));

vi.mock("@/stores/permissionStore", () => ({
  usePermissionStore: (sel: (s: Record<string, unknown>) => unknown) =>
    sel({ pendingAsk: null }),
}));

vi.mock("@/lib/utils", () => ({
  cn: (...args: unknown[]) => args.filter(Boolean).join(" "),
  stripMarkdown: (s: string) => s,
}));

vi.mock("@/lib/splitThinkBlocks", () => ({
  splitThinkBlocks: (s: string) => [{ type: "text", content: s }],
}));

vi.mock("katex/dist/katex.min.css", () => ({}));
vi.mock("react-markdown", () => ({
  default: ({ children }: { children: string }) => <p>{children}</p>,
}));
vi.mock("remark-gfm", () => ({ default: () => {} }));
vi.mock("remark-breaks", () => ({ default: () => {} }));
vi.mock("remark-math", () => ({ default: () => {} }));
vi.mock("rehype-katex", () => ({ default: () => {} }));
vi.mock("./CodeBlock", () => ({
  CodeBlock: ({ children }: { children: React.ReactNode }) => <pre>{children}</pre>,
  reactNodeToDisplayString: (n: unknown) => String(n),
}));
vi.mock("@/lib/detect-file-path", () => ({
  detectPreviewableFilePath: () => null,
}));
vi.mock("@/lib/resolve-file-paths", () => ({
  resolveFilePathsFromContext: (s: string) => s,
}));
vi.mock("@/components/common/FilePathChip", () => ({
  FilePathChip: ({ path }: { path: string }) => <span>{path}</span>,
}));
vi.mock("./ToolCallBlock", () => ({
  ToolCallBlock: () => <div data-testid="tool-call" />,
}));
vi.mock("./ReasoningSegment", () => ({
  ReasoningSegment: () => <div data-testid="reasoning" />,
}));
vi.mock("@/components/ui/button", () => ({
  Button: ({ children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & { children: React.ReactNode }) => (
    <button {...props}>{children}</button>
  ),
}));

import { AssistantMessage } from "./AssistantMessage";

const LONG_URL = "https://example.com/" + "a".repeat(400);

describe("AssistantMessage overflow prevention", () => {
  it("content wrapper has break-words for simple content", () => {
    const { container } = render(<AssistantMessage content={LONG_URL} />);
    const contentDiv = container.querySelector(".leading-relaxed");
    expect(contentDiv).toBeTruthy();
    expect(contentDiv!.className).toContain("break-words");
  });

  it("content wrapper has break-words with ordered parts", () => {
    const parts = [{ type: "text" as const, text: LONG_URL }];
    const { container } = render(<AssistantMessage content="" parts={parts} />);
    const textDivs = container.querySelectorAll(".leading-relaxed");
    const hasBreakWords = Array.from(textDivs).some((el) =>
      el.className.includes("break-words"),
    );
    expect(hasBreakWords).toBe(true);
  });

  it("outer container has min-w-0 for flex constraint", () => {
    const { container } = render(<AssistantMessage content="hello" />);
    const outer = container.querySelector(".min-w-0.flex-1");
    expect(outer).toBeTruthy();
  });
});
