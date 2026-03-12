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
vi.mock("prismjs/components/prism-lua", () => ({}));
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

function getToggleButton(container: HTMLElement): HTMLButtonElement | null {
  return container.querySelector("button[type='button']");
}

function getGrid(container: HTMLElement): HTMLElement | null {
  return container.querySelector("[style]");
}

describe("CodeBlock collapse", () => {
  it("short blocks have no toggle button and are always expanded", () => {
    const { container } = render(
      <CodeBlock>{makeCodeElement(shortCode())}</CodeBlock>,
    );
    expect(container.querySelector("pre")).toBeTruthy();
    expect(getToggleButton(container)).toBeNull();
    expect(screen.queryByText(/lines/)).toBeNull();
  });

  it("long blocks start collapsed with line count", () => {
    const lines = COLLAPSE_THRESHOLD + 5;
    const { container } = render(
      <CodeBlock>{makeCodeElement(longCode())}</CodeBlock>,
    );
    expect(screen.getByText(`${lines} lines`)).toBeTruthy();
    expect(getGrid(container)!.getAttribute("style")).toContain("0fr");
  });

  it("shows first-line preview when collapsed", () => {
    const { container } = render(<CodeBlock>{makeCodeElement(longCode())}</CodeBlock>);
    const preview = container.querySelector(".font-mono.truncate");
    expect(preview).toBeTruthy();
    expect(preview!.textContent).toBe("line 1");
  });

  it("clicking toggle button expands the code block", () => {
    const { container } = render(
      <CodeBlock>{makeCodeElement(longCode())}</CodeBlock>,
    );
    const toggle = getToggleButton(container)!;
    expect(toggle).toBeTruthy();
    fireEvent.click(toggle);
    expect(getGrid(container)!.getAttribute("style")).toContain("1fr");
  });

  it("clicking toggle button again collapses the code block", () => {
    const { container } = render(
      <CodeBlock>{makeCodeElement(longCode())}</CodeBlock>,
    );
    const toggle = getToggleButton(container)!;
    fireEvent.click(toggle);
    fireEvent.click(toggle);
    expect(getGrid(container)!.getAttribute("style")).toContain("0fr");
  });

  it("toggle button is keyboard accessible", () => {
    const { container } = render(
      <CodeBlock>{makeCodeElement(longCode())}</CodeBlock>,
    );
    const toggle = getToggleButton(container)!;
    expect(toggle.tagName).toBe("BUTTON");
    // Enter key triggers native button click via fireEvent.click
    fireEvent.keyDown(toggle, { key: "Enter" });
    // Native button handles Enter/Space, just verify it's focusable
    expect(toggle.tabIndex).not.toBe(-1);
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
    // Last button is the copy button (after the toggle button)
    const buttons = container.querySelectorAll("button");
    const copyBtn = buttons[buttons.length - 1];
    fireEvent.click(copyBtn!);
    expect(getGrid(container)!.getAttribute("style")).toContain("0fr");
    expect(clipboardSpy).toHaveBeenCalled();
  });

  it("syncs expanded state when code changes from short to long", () => {
    const { container, rerender } = render(
      <CodeBlock>{makeCodeElement(shortCode())}</CodeBlock>,
    );
    // Short code: expanded, no grid collapse
    expect(getGrid(container)!.getAttribute("style")).toContain("1fr");

    // Rerender with long code
    rerender(<CodeBlock>{makeCodeElement(longCode())}</CodeBlock>);
    expect(getGrid(container)!.getAttribute("style")).toContain("0fr");
  });

  it("syncs expanded state when code changes from long to short", () => {
    const { container, rerender } = render(
      <CodeBlock>{makeCodeElement(longCode())}</CodeBlock>,
    );
    expect(getGrid(container)!.getAttribute("style")).toContain("0fr");

    rerender(<CodeBlock>{makeCodeElement(shortCode())}</CodeBlock>);
    expect(getGrid(container)!.getAttribute("style")).toContain("1fr");
  });
});
