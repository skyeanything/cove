// @vitest-environment happy-dom
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import React from "react";
import type { ToolCallInfo } from "@/stores/chat-types";
import type { PendingPermission } from "@/stores/permissionStore";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (k: string) => k }),
}));

vi.mock("@/stores/permissionStore", () => ({
  usePermissionStore: (sel: (s: Record<string, unknown>) => unknown) =>
    sel({ respond: vi.fn() }),
}));

vi.mock("prismjs", () => ({ default: {} }));
vi.mock("prismjs/components/prism-bash", () => ({}));
vi.mock("@/hooks/useOpenFilePreview", () => ({
  useOpenFilePreview: () => ({ open: vi.fn(), openPreview: vi.fn(), openExternal: vi.fn() }),
}));
vi.mock("@/lib/file-tree-icons", () => ({
  getFileIcon: () => null,
}));
vi.mock("prism-react-renderer", () => ({
  Highlight: ({
    children,
    code,
  }: {
    children: (props: {
      tokens: { type: string }[][];
      getLineProps: (p: { line: unknown }) => Record<string, unknown>;
      getTokenProps: (p: { token: unknown }) => Record<string, unknown>;
    }) => React.ReactNode;
    code: string;
  }) =>
    children({
      tokens: [[{ type: "plain" }]],
      getLineProps: () => ({}),
      getTokenProps: () => ({ children: code }),
    }),
}));

import {
  extractDiffLines,
  isToolResultRejected,
  getToolHeaderSummary,
  isBashSandboxed,
  TOOL_ICON_MAP,
  REJECTED_PREFIXES,
  ToolCallIcon,
  ResultContent,
  ToolCallBlock,
} from "./ToolCallBlock";

// ---------------------------------------------------------------------------
// extractDiffLines
// ---------------------------------------------------------------------------
describe("extractDiffLines", () => {
  it("returns null when no diff marker present", () => {
    expect(extractDiffLines("just some text")).toBeNull();
  });

  it("extracts intro and diff lines when marker present", () => {
    const text = "File updated\n--- Diff ---\n+added\n-removed";
    const result = extractDiffLines(text);
    expect(result).not.toBeNull();
    expect(result!.intro).toBe("File updated");
    expect(result!.diffLines).toEqual(["+added", "-removed"]);
  });

  it("handles empty intro", () => {
    const text = "--- Diff ---\n+line1";
    const result = extractDiffLines(text);
    expect(result!.intro).toBe("");
    expect(result!.diffLines).toEqual(["+line1"]);
  });

  it("handles empty diff after marker", () => {
    const text = "intro\n--- Diff ---";
    const result = extractDiffLines(text);
    expect(result!.intro).toBe("intro");
    expect(result!.diffLines).toEqual([""]);
  });

  it("preserves multiple diff lines", () => {
    const text = "--- Diff ---\n+a\n b\n-c\n+d";
    const result = extractDiffLines(text);
    expect(result!.diffLines).toHaveLength(4);
  });
});

// ---------------------------------------------------------------------------
// isToolResultRejected
// ---------------------------------------------------------------------------
describe("isToolResultRejected", () => {
  it("returns false for non-string result", () => {
    expect(isToolResultRejected(42)).toBe(false);
    expect(isToolResultRejected(null)).toBe(false);
    expect(isToolResultRejected({ error: true })).toBe(false);
  });

  it("returns true for each rejected prefix", () => {
    for (const prefix of REJECTED_PREFIXES) {
      expect(isToolResultRejected(prefix + " extra text")).toBe(true);
    }
  });

  it("is case-insensitive", () => {
    expect(isToolResultRejected("THIS SKILL IS NOT ENABLED for this")).toBe(true);
  });

  it("returns false for non-matching string", () => {
    expect(isToolResultRejected("Success: file written")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// getToolHeaderSummary
// ---------------------------------------------------------------------------
describe("getToolHeaderSummary", () => {
  it("returns null when args undefined", () => {
    expect(getToolHeaderSummary("bash", undefined)).toBeNull();
  });

  it("returns description for bash", () => {
    expect(getToolHeaderSummary("bash", { description: "list files" })).toBe("list files");
  });

  it("returns null for bash without description", () => {
    expect(getToolHeaderSummary("bash", { command: "ls" })).toBeNull();
  });

  it("returns FilePathChip for read", () => {
    const result = getToolHeaderSummary("read", { filePath: "/tmp/file.ts" });
    expect(result).not.toBeNull();
    const { container } = render(<>{result}</>);
    expect(container.querySelector("[role='button']")?.getAttribute("title")).toBe("/tmp/file.ts");
  });

  it("returns FilePathChip for edit", () => {
    const result = getToolHeaderSummary("edit", { filePath: "/src/app.tsx" });
    expect(result).not.toBeNull();
    const { container } = render(<>{result}</>);
    expect(container.querySelector("[role='button']")?.getAttribute("title")).toBe("/src/app.tsx");
  });

  it("returns description for cove_interpreter", () => {
    expect(getToolHeaderSummary("cove_interpreter", { description: "run code" })).toBe("run code");
  });

  it("returns FilePathChip for write", () => {
    const result = getToolHeaderSummary("write", { filePath: "/tmp" });
    expect(result).not.toBeNull();
    const { container } = render(<>{result}</>);
    expect(container.querySelector("[role='button']")?.getAttribute("title")).toBe("/tmp");
  });

  it("returns null for empty string value", () => {
    expect(getToolHeaderSummary("bash", { description: "  " })).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// isBashSandboxed
// ---------------------------------------------------------------------------
describe("isBashSandboxed", () => {
  it("returns true for sandboxed prefix", () => {
    expect(isBashSandboxed("[sandboxed] ls -la")).toBe(true);
  });

  it("returns false for non-string", () => {
    expect(isBashSandboxed(42)).toBe(false);
    expect(isBashSandboxed(null)).toBe(false);
  });

  it("returns false for string without prefix", () => {
    expect(isBashSandboxed("regular output")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// TOOL_ICON_MAP
// ---------------------------------------------------------------------------
describe("TOOL_ICON_MAP", () => {
  it("maps known tools to icons", () => {
    expect(TOOL_ICON_MAP["bash"]).toBeDefined();
    expect(TOOL_ICON_MAP["edit"]).toBeDefined();
    expect(TOOL_ICON_MAP["read"]).toBeDefined();
    expect(TOOL_ICON_MAP["write"]).toBeDefined();
    expect(TOOL_ICON_MAP["cove_interpreter"]).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// ToolCallIcon
// ---------------------------------------------------------------------------
describe("ToolCallIcon", () => {
  it("renders without crashing for known tool", () => {
    const { container } = render(<ToolCallIcon toolName="bash" />);
    expect(container.querySelector("svg")).toBeTruthy();
  });

  it("renders fallback icon for unknown tool", () => {
    const { container } = render(<ToolCallIcon toolName="unknown_tool" />);
    expect(container.querySelector("svg")).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// ResultContent
// ---------------------------------------------------------------------------
describe("ResultContent", () => {
  it("renders plain text result", () => {
    const { container } = render(<ResultContent result="hello world" />);
    expect(container.textContent).toContain("hello world");
  });

  it("renders non-string result as JSON", () => {
    const { container } = render(<ResultContent result={{ key: "val" }} />);
    expect(container.textContent).toContain('"key"');
    expect(container.textContent).toContain('"val"');
  });

  it("renders diff lines when marker present", () => {
    const text = "intro\n--- Diff ---\n+added line\n-removed line\n context";
    const { container } = render(<ResultContent result={text} toolName="edit" />);
    expect(container.textContent).toContain("+added line");
    expect(container.textContent).toContain("-removed line");
  });

  it("applies text-foreground class for bash tool", () => {
    const { container } = render(<ResultContent result="output" toolName="bash" />);
    const pre = container.querySelector("pre");
    expect(pre?.className).toContain("text-foreground");
    expect(pre?.className).not.toContain("text-foreground-secondary");
  });

  it("applies text-foreground-secondary for non-bash tool", () => {
    const { container } = render(<ResultContent result="output" toolName="read" />);
    const pre = container.querySelector("pre");
    expect(pre?.className).toContain("text-foreground-secondary");
  });
});

// ---------------------------------------------------------------------------
// ToolCallBlock
// ---------------------------------------------------------------------------
function makeToolCall(overrides: Partial<ToolCallInfo> = {}): ToolCallInfo {
  return {
    id: "tc-1",
    toolName: "bash",
    args: { command: "ls", description: "list files" },
    isLoading: false,
    result: undefined,
    ...overrides,
  };
}

describe("ToolCallBlock", () => {
  it("renders tool name", () => {
    render(<ToolCallBlock toolCall={makeToolCall()} pendingAsk={null} />);
    expect(screen.getByText("bash")).toBeTruthy();
  });

  it("shows pending badge when isLoading", () => {
    render(
      <ToolCallBlock toolCall={makeToolCall({ isLoading: true })} pendingAsk={null} />,
    );
    expect(screen.getByText("tool.pending")).toBeTruthy();
  });

  it("shows completed badge when done and not rejected", () => {
    render(
      <ToolCallBlock
        toolCall={makeToolCall({ result: "ok", isLoading: false })}
        pendingAsk={null}
      />,
    );
    expect(screen.getByText("tool.completed")).toBeTruthy();
  });

  it("shows rejected badge when result matches rejected prefix", () => {
    render(
      <ToolCallBlock
        toolCall={makeToolCall({
          result: "this skill is not enabled for now",
          isLoading: false,
        })}
        pendingAsk={null}
      />,
    );
    expect(screen.getByText("tool.rejected")).toBeTruthy();
  });

  it("shows duration when >= 1000ms", () => {
    render(
      <ToolCallBlock
        toolCall={makeToolCall({
          result: "done",
          isLoading: false,
          durationMs: 2500,
        })}
        pendingAsk={null}
      />,
    );
    expect(screen.getByText("2.5 s")).toBeTruthy();
  });

  it("does not show duration when < 1000ms", () => {
    const { container } = render(
      <ToolCallBlock
        toolCall={makeToolCall({
          result: "done",
          isLoading: false,
          durationMs: 500,
        })}
        pendingAsk={null}
      />,
    );
    // formatDuration(500) = "500 ms" — but it should not appear
    expect(container.textContent).not.toContain("500 ms");
    expect(container.textContent).not.toContain("0.5 s");
  });

  it("collapses and expands on click", async () => {
    const { container } = render(
      <ToolCallBlock
        toolCall={makeToolCall({ args: { command: "echo hi", description: "echo" } })}
        pendingAsk={null}
      />,
    );
    const grid = container.querySelector("[style]") as HTMLElement;
    // Default: collapsed
    expect(grid.style.gridTemplateRows).toBe("0fr");
    // Click the header button to expand
    const headerBtn = container.querySelector("button") as HTMLElement;
    await fireEvent.click(headerBtn);
    // After click, state toggles closed -> open
    const gridAfter = container.querySelector("[style]") as HTMLElement;
    expect(gridAfter.style.gridTemplateRows).toBe("1fr");
  });

  it("shows permission bar when pending ask matches", () => {
    const pendingAsk: PendingPermission = {
      conversationId: "c-1",
      operation: "bash",
      pathOrCommand: "rm -rf /",
      resolve: vi.fn(),
    };
    const { container } = render(
      <ToolCallBlock
        toolCall={makeToolCall({
          toolName: "bash",
          args: { command: "rm -rf /", description: "danger" },
          isLoading: true,
        })}
        pendingAsk={pendingAsk}
      />,
    );
    expect(container.textContent).toContain("permission.title");
    expect(container.textContent).toContain("permission.deny");
    expect(container.textContent).toContain("permission.allow");
    expect(container.textContent).toContain("permission.alwaysAllow");
  });
});
