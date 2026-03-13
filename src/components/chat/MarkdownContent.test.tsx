// @vitest-environment happy-dom
import { describe, it, expect, vi } from "vitest";
import { render } from "@testing-library/react";

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

vi.mock("@tauri-apps/api/core", () => ({
  convertFileSrc: (path: string) => `asset://localhost/${path.replace(/^\//, "")}`,
  invoke: vi.fn(),
}));

import { MarkdownContent, computeMarkdownBasePath } from "./MarkdownContent";

const LONG_URL = "https://example.com/" + "a".repeat(400);

describe("MarkdownContent overflow prevention", () => {
  it("wrapper has break-words class for normal render", () => {
    const { container } = render(<MarkdownContent source="hello world" />);
    const wrapper = container.querySelector("[data-md]");
    expect(wrapper).toBeTruthy();
    expect(wrapper!.className).toContain("break-words");
  });

  it("wrapper has break-words when rendering long unbroken text", () => {
    const { container } = render(<MarkdownContent source={LONG_URL} />);
    const wrapper = container.querySelector("[data-md]");
    expect(wrapper!.className).toContain("break-words");
  });

  it("streaming pending line has break-words", () => {
    const source = "settled line\npending-text-here";
    const { container } = render(
      <MarkdownContent source={source} trailingCursor />,
    );
    const paragraphs = container.querySelectorAll("p");
    const pendingP = Array.from(paragraphs).find((p) =>
      p.textContent?.includes("pending-text-here"),
    );
    expect(pendingP).toBeTruthy();
    expect(pendingP!.className).toContain("break-words");
  });

  it("streaming first-line (no newline yet) has break-words", () => {
    const { container } = render(
      <MarkdownContent source="no-newline-yet" trailingCursor />,
    );
    const p = container.querySelector("p");
    expect(p).toBeTruthy();
    expect(p!.className).toContain("break-words");
  });

  it("returns null for empty/whitespace source", () => {
    const { container } = render(<MarkdownContent source="   " />);
    expect(container.querySelector("[data-md]")).toBeNull();
  });
});

describe("computeMarkdownBasePath", () => {
  it("returns directory for absolute path", () => {
    expect(computeMarkdownBasePath("/Users/me/docs/README.md", null)).toBe("/Users/me/docs");
  });

  it("returns directory for absolute path ignoring workspaceRoot", () => {
    expect(computeMarkdownBasePath("/Users/me/docs/guide.md", "/workspace")).toBe("/Users/me/docs");
  });

  it("returns workspaceRoot for root-level relative path (README.md)", () => {
    expect(computeMarkdownBasePath("README.md", "/workspace")).toBe("/workspace");
  });

  it("returns workspaceRoot + dir for nested relative path", () => {
    expect(computeMarkdownBasePath("docs/guide.md", "/workspace")).toBe("/workspace/docs");
  });

  it("returns undefined when relative path and no workspaceRoot", () => {
    expect(computeMarkdownBasePath("docs/guide.md", null)).toBeUndefined();
  });

  it("handles deeply nested relative path", () => {
    expect(computeMarkdownBasePath("a/b/c/file.md", "/ws")).toBe("/ws/a/b/c");
  });
});
