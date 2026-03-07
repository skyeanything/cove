// @vitest-environment happy-dom
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import React from "react";

vi.mock("prismjs", () => ({ default: {} }));
vi.mock("prismjs/components/prism-bash", () => ({}));
vi.mock("prismjs/components/prism-json", () => ({}));
vi.mock("prismjs/components/prism-typescript", () => ({}));
vi.mock("prismjs/components/prism-javascript", () => ({}));
vi.mock("prismjs/components/prism-jsx", () => ({}));
vi.mock("prismjs/components/prism-tsx", () => ({}));
vi.mock("prismjs/components/prism-css", () => ({}));
vi.mock("prismjs/components/prism-python", () => ({}));
vi.mock("prismjs/components/prism-yaml", () => ({}));
vi.mock("prismjs/components/prism-markdown", () => ({}));
vi.mock("beautiful-mermaid", () => ({
  renderMermaidSVG: () => "<svg></svg>",
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
      tokens: code.split("\n").map(() => [{ type: "plain" }]),
      getLineProps: () => ({}),
      getTokenProps: (_p: { token: unknown }, i?: number) => ({
        children: code.split("\n")[i ?? 0],
      }),
    }),
}));

import { CodeBlock, COLLAPSE_THRESHOLD } from "./CodeBlock";

function makeCodeElement(code: string, lang = "typescript") {
  return React.createElement("code", { className: `language-${lang}` }, code);
}

function shortCode() {
  return Array.from({ length: COLLAPSE_THRESHOLD }, (_, i) => `line ${i + 1}`).join("\n");
}

function longCode() {
  return Array.from({ length: COLLAPSE_THRESHOLD + 5 }, (_, i) => `line ${i + 1}`).join("\n");
}

describe("CodeBlock collapse", () => {
  it("short blocks have no chevron and are always expanded", () => {
    const { container } = render(
      <CodeBlock>{makeCodeElement(shortCode())}</CodeBlock>,
    );
    expect(container.querySelector("pre")).toBeTruthy();
    expect(screen.queryByText(/lines/)).toBeNull();
  });

  it("long blocks start collapsed with line count", () => {
    const lines = COLLAPSE_THRESHOLD + 5;
    const { container } = render(
      <CodeBlock>{makeCodeElement(longCode())}</CodeBlock>,
    );
    expect(screen.getByText(`${lines} lines`)).toBeTruthy();
    const grid = container.querySelector("[style]");
    expect(grid).toBeTruthy();
    expect(grid!.getAttribute("style")).toContain("0fr");
  });

  it("shows first-line preview when collapsed", () => {
    const { container } = render(<CodeBlock>{makeCodeElement(longCode())}</CodeBlock>);
    const preview = container.querySelector(".font-mono.truncate");
    expect(preview).toBeTruthy();
    expect(preview!.textContent).toBe("line 1");
  });

  it("clicking header expands the code block", () => {
    const { container } = render(
      <CodeBlock>{makeCodeElement(longCode())}</CodeBlock>,
    );
    const header = container.firstElementChild!.firstElementChild!;
    expect(header.className).toContain("cursor-pointer");
    fireEvent.click(header);
    const grid = container.querySelector("[style]");
    expect(grid!.getAttribute("style")).toContain("1fr");
  });

  it("clicking header again collapses the code block", () => {
    const { container } = render(
      <CodeBlock>{makeCodeElement(longCode())}</CodeBlock>,
    );
    const header = container.firstElementChild!.firstElementChild!;
    fireEvent.click(header);
    fireEvent.click(header);
    const grid = container.querySelector("[style]");
    expect(grid!.getAttribute("style")).toContain("0fr");
  });

  it("copy button does not toggle collapse", () => {
    const clipboardSpy = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText: clipboardSpy },
      writable: true,
      configurable: true,
    });
    const { container } = render(
      <CodeBlock>{makeCodeElement(longCode())}</CodeBlock>,
    );
    const buttons = container.querySelectorAll("button");
    const copyBtn = buttons[buttons.length - 1];
    fireEvent.click(copyBtn!);
    const grid = container.querySelector("[style]");
    expect(grid!.getAttribute("style")).toContain("0fr");
    expect(clipboardSpy).toHaveBeenCalled();
  });

  it("short block header is not clickable", () => {
    const { container } = render(
      <CodeBlock>{makeCodeElement(shortCode())}</CodeBlock>,
    );
    // The header div (first child of the outer container) should not have cursor-pointer
    const outerDiv = container.firstElementChild!;
    const headerDiv = outerDiv.firstElementChild!;
    expect(headerDiv.className).not.toContain("cursor-pointer");
  });
});
