import { describe, expect, it } from "vitest";
import { resolveFilePathsFromContext } from "./resolve-file-paths";

describe("resolveFilePathsFromContext", () => {
  it("resolves bare filenames under directory heading", () => {
    const input = [
      "**tests/**",
      "- `1.docx`",
      "- `temp_content.txt`",
    ].join("\n");
    const result = resolveFilePathsFromContext(input);
    expect(result).toContain("`tests/1.docx`");
    expect(result).toContain("`tests/temp_content.txt`");
  });

  it("handles directory heading without trailing slash", () => {
    const input = [
      "**output**",
      "- `report.pdf`",
    ].join("\n");
    const result = resolveFilePathsFromContext(input);
    expect(result).toContain("`output/report.pdf`");
  });

  it("does not transform files with unsupported extensions", () => {
    const input = [
      "**src/**",
      "- `archive.xyz`",
    ].join("\n");
    const result = resolveFilePathsFromContext(input);
    expect(result).toContain("`archive.xyz`");
    expect(result).not.toContain("`src/archive.xyz`");
  });

  it("does not transform filenames that already have a path", () => {
    const input = [
      "**tests/**",
      "- `sub/file.docx`",
    ].join("\n");
    const result = resolveFilePathsFromContext(input);
    expect(result).toContain("`sub/file.docx`");
  });

  it("resets directory context on non-list lines", () => {
    const input = [
      "**tests/**",
      "- `1.docx`",
      "Some paragraph text",
      "- `2.docx`",
    ].join("\n");
    const result = resolveFilePathsFromContext(input);
    expect(result).toContain("`tests/1.docx`");
    // After paragraph, context is reset — bare filename stays bare
    expect(result).toContain("`2.docx`");
    expect(result).not.toContain("tests/2.docx");
  });

  it("preserves blank lines within list context", () => {
    const input = [
      "**docs/**",
      "- `readme.md`",
      "",
      "- `guide.pdf`",
    ].join("\n");
    const result = resolveFilePathsFromContext(input);
    expect(result).toContain("`docs/readme.md`");
    expect(result).toContain("`docs/guide.pdf`");
  });

  it("handles nested directory names", () => {
    const input = [
      "**src/components/**",
      "- `App.html`",
    ].join("\n");
    const result = resolveFilePathsFromContext(input);
    expect(result).toContain("`src/components/App.html`");
  });

  it("returns empty string unchanged", () => {
    expect(resolveFilePathsFromContext("")).toBe("");
  });

  it("resolves bare Chinese filenames under directory heading", () => {
    const input = [
      "**文档/**",
      "- `报告.docx`",
    ].join("\n");
    const result = resolveFilePathsFromContext(input);
    expect(result).toContain("`文档/报告.docx`");
  });

  it("returns markdown without directory context unchanged", () => {
    const input = "Here is some `inline code` and `another.xyz` example.";
    expect(resolveFilePathsFromContext(input)).toBe(input);
  });

  it("handles multiple directory sections", () => {
    const input = [
      "**assets/**",
      "- `logo.png`",
      "",
      "**docs/**",
      "- `readme.md`",
    ].join("\n");
    const result = resolveFilePathsFromContext(input);
    expect(result).toContain("`assets/logo.png`");
    expect(result).toContain("`docs/readme.md`");
  });

  it("does not transform content inside fenced code blocks", () => {
    const input = [
      "**tests/**",
      "- `1.docx`",
      "",
      "```markdown",
      "- `1.docx`",
      "```",
    ].join("\n");
    const result = resolveFilePathsFromContext(input);
    // Outside fence: transformed
    expect(result).toContain("`tests/1.docx`");
    // Inside fence: the backtick line must remain untouched
    const fencedLine = result.split("\n").find(
      (_, i, arr) => i > 0 && arr[i - 1]?.startsWith("```"),
    );
    expect(fencedLine).toBe("- `1.docx`");
  });

  it("does not transform content inside tilde fenced blocks", () => {
    const input = [
      "**docs/**",
      "- `readme.md`",
      "~~~",
      "- `readme.md`",
      "~~~",
    ].join("\n");
    const result = resolveFilePathsFromContext(input);
    const lines = result.split("\n");
    // Line inside fence (index 3) stays unchanged
    expect(lines[3]).toBe("- `readme.md`");
    // Line outside fence (index 1) is transformed
    expect(lines[1]).toContain("`docs/readme.md`");
  });

  it("handles mixed fence markers without leaking state", () => {
    // A ~~~ inside a ``` block must NOT close the fence
    const input = [
      "**tests/**",
      "- `1.docx`",
      "```",
      "~~~",
      "- `1.docx`",
      "~~~",
      "```",
    ].join("\n");
    const result = resolveFilePathsFromContext(input);
    const lines = result.split("\n");
    // Line 1: outside fence, transformed
    expect(lines[1]).toContain("`tests/1.docx`");
    // Line 4: inside ``` fence (~~~ does not close it), untouched
    expect(lines[4]).toBe("- `1.docx`");
  });

  it("requires closing fence to be at least as long as opening", () => {
    const input = [
      "**tests/**",
      "- `1.docx`",
      "````",
      "```",
      "- `1.docx`",
      "```",
      "````",
    ].join("\n");
    const result = resolveFilePathsFromContext(input);
    const lines = result.split("\n");
    // ``` (3 chars) cannot close ```` (4 chars), so line 4 is still inside
    expect(lines[4]).toBe("- `1.docx`");
  });

  it("does not treat trailing text after marker as valid close", () => {
    // "```not-a-close" is not a valid closing fence
    const input = [
      "**tests/**",
      "- `1.docx`",
      "```",
      "```not-a-close",
      "- `1.docx`",
      "```",
    ].join("\n");
    const result = resolveFilePathsFromContext(input);
    const lines = result.split("\n");
    // Line 4 is still inside the fence (line 3 did not close it)
    expect(lines[4]).toBe("- `1.docx`");
  });

  it("ignores fence markers with 4+ leading spaces", () => {
    // 4 spaces = indented code block, not a real fence per CommonMark
    // Verify that a properly fenced block with 0-3 spaces works,
    // but 4-space-indented markers do NOT open a fence
    const input = [
      "```",
      "    ~~~",
      "```",
      "**tests/**",
      "- `1.docx`",
    ].join("\n");
    const result = resolveFilePathsFromContext(input);
    const lines = result.split("\n");
    // "    ~~~" (4 spaces) inside a ``` block does not close the fence,
    // but "```" on line 2 (the real close) does. After fence, dir heading
    // sets context and line 4 is transformed.
    expect(lines[4]).toContain("`tests/1.docx`");

    // Verify 4-space marker doesn't open a fence by checking subsequent
    // real fence still works correctly:
    const input3 = [
      "    ```",
      "**tests/**",
      "- `1.docx`",
      "```",
      "- `2.docx`",
      "```",
    ].join("\n");
    const result3 = resolveFilePathsFromContext(input3);
    const lines3 = result3.split("\n");
    // "    ```" didn't open fence, so "**tests/**" sets context
    expect(lines3[2]).toContain("`tests/1.docx`");
    // "```" on line 3 opens a real fence, line 4 is inside
    expect(lines3[4]).toBe("- `2.docx`");
  });
});
