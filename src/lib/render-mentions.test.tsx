// @vitest-environment happy-dom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";

afterEach(cleanup);
import { renderContentWithMentions } from "./render-mentions";

vi.mock("@/hooks/useOpenFilePreview", () => ({
  useOpenFilePreview: () => ({ open: vi.fn(), openPreview: vi.fn(), openExternal: vi.fn() }),
}));

vi.mock("@/lib/file-tree-icons", () => ({
  getFileIcon: () => null,
}));

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn().mockResolvedValue({}),
}));

vi.mock("@/stores/filePreviewStore", () => ({
  useFilePreviewStore: (selector: (s: { workspaceRoot: string | null }) => unknown) =>
    selector({ workspaceRoot: "/workspace" }),
}));

describe("renderContentWithMentions", () => {
  it("returns original content when no mentions", () => {
    const result = renderContentWithMentions("hello world");
    expect(result).toEqual(["hello world"]);
  });

  it("renders @file: as FilePathChip", () => {
    const nodes = renderContentWithMentions("check @file:src/main.tsx please");
    const { container } = render(<>{nodes}</>);
    const chip = container.querySelector("[role='button']");
    expect(chip).toBeTruthy();
    expect(chip?.getAttribute("title")).toBe("src/main.tsx");
  });

  it("renders @tool: as inline badge", () => {
    const nodes = renderContentWithMentions("use @tool:bash to run");
    const { container } = render(<>{nodes}</>);
    expect(container.textContent).toContain("@tool:bash");
  });

  it("renders @skill: as inline badge", () => {
    const nodes = renderContentWithMentions("enable @skill:coder first");
    const { container } = render(<>{nodes}</>);
    expect(container.textContent).toContain("@skill:coder");
  });

  it("handles multiple mentions", () => {
    const nodes = renderContentWithMentions("@file:src/a.ts and @file:src/b.ts");
    const { container } = render(<>{nodes}</>);
    const chips = container.querySelectorAll("[role='button']");
    expect(chips).toHaveLength(2);
  });

  it("preserves text between mentions", () => {
    const nodes = renderContentWithMentions("before @tool:read after");
    const { container } = render(<>{nodes}</>);
    expect(container.textContent).toContain("before");
    expect(container.textContent).toContain("after");
  });
});
