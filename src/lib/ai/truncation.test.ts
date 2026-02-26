import { describe, expect, it } from "vitest";
import { truncateOutput } from "./truncation";

describe("truncateOutput", () => {
  it("returns short text unchanged with truncated=false", () => {
    const result = truncateOutput("hello\nworld");
    expect(result).toEqual({ content: "hello\nworld", truncated: false });
  });

  it("returns empty string unchanged", () => {
    const result = truncateOutput("");
    expect(result).toEqual({ content: "", truncated: false });
  });

  it("truncates when line count exceeds maxLines", () => {
    const lines = Array.from({ length: 20 }, (_, i) => `line-${i}`);
    const text = lines.join("\n");
    const result = truncateOutput(text, { maxLines: 10, maxBytes: 100_000 });

    expect(result.truncated).toBe(true);
    expect(result.content).toContain("line-0");
    expect(result.content).toContain("line-19");
    expect(result.content).toContain("输出已截断");
    // Head (first 5) and tail (last 5) for maxLines=10
    expect(result.content).toContain("line-4");
    expect(result.content).toContain("line-15");
  });

  it("truncates when byte size exceeds maxBytes", () => {
    // Create text under line limit but over byte limit
    const text = "a".repeat(200);
    const result = truncateOutput(text, { maxLines: 10000, maxBytes: 100 });

    expect(result.truncated).toBe(true);
    expect(result.content).toContain("输出已截断");
  });

  it("uses default limits when no options provided", () => {
    // Text well under defaults (2000 lines, 50KB)
    const result = truncateOutput("short text");
    expect(result.truncated).toBe(false);
  });

  it("preserves head and tail lines in truncated output", () => {
    const lines = Array.from({ length: 100 }, (_, i) => `L${i}`);
    const result = truncateOutput(lines.join("\n"), { maxLines: 10, maxBytes: 1_000_000 });

    expect(result.truncated).toBe(true);
    // halfLines = 5, so head=L0..L4, tail=L95..L99
    expect(result.content).toContain("L0");
    expect(result.content).toContain("L4");
    expect(result.content).toContain("L95");
    expect(result.content).toContain("L99");
    // Middle should be gone
    expect(result.content).not.toContain("L50");
  });
});
