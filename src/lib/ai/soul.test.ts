import { describe, expect, it, vi } from "vitest";
import { formatSoulPrompt, truncateToLimit, type SoulContent } from "./soul";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));

// readSoul, writeSoul, writeSoulPrivate depend on Tauri invoke -- tested via integration.
// Unit tests here focus on formatSoulPrompt (pure function).

describe("formatSoulPrompt", () => {
  it("formats public and private files", () => {
    const soul: SoulContent = {
      public: "# Who I Am\nI'm cove.",
      private: [
        { name: "observations.md", content: "- obs 1" },
        { name: "patterns.md", content: "# Patterns\n- p1" },
      ],
    };
    const result = formatSoulPrompt(soul);
    expect(result).toContain("[SOUL]\n# Who I Am\nI'm cove.");
    expect(result).toContain("[SOUL:private:observations.md]\n- obs 1");
    expect(result).toContain("[SOUL:private:patterns.md]\n# Patterns\n- p1");
  });

  it("includes only public section when private is empty", () => {
    const soul: SoulContent = { public: "public content", private: [] };
    const result = formatSoulPrompt(soul);
    expect(result).toContain("[SOUL]\npublic content");
    expect(result).not.toContain("[SOUL:private");
  });

  it("includes only private files when public is empty", () => {
    const soul: SoulContent = {
      public: "",
      private: [{ name: "observations.md", content: "- obs" }],
    };
    const result = formatSoulPrompt(soul);
    expect(result).not.toContain("[SOUL]\n");
    expect(result).toContain("[SOUL:private:observations.md]\n- obs");
  });

  it("returns empty string when both are empty", () => {
    const soul: SoulContent = { public: "", private: [] };
    const result = formatSoulPrompt(soul);
    expect(result).toBe("");
  });

  it("skips private files with empty content", () => {
    const soul: SoulContent = {
      public: "public",
      private: [
        { name: "empty.md", content: "  " },
        { name: "real.md", content: "content" },
      ],
    };
    const result = formatSoulPrompt(soul);
    expect(result).not.toContain("empty.md");
    expect(result).toContain("[SOUL:private:real.md]");
  });

  it("preserves multiline content", () => {
    const soul: SoulContent = {
      public: "line1\nline2\nline3",
      private: [{ name: "obs.md", content: "obs1\nobs2" }],
    };
    const result = formatSoulPrompt(soul);
    expect(result).toContain("line1\nline2\nline3");
    expect(result).toContain("obs1\nobs2");
  });

  it("truncates SOUL.md from the end when over limit", () => {
    const longPublic = "x".repeat(5000);
    const soul: SoulContent = { public: longPublic, private: [] };
    const result = formatSoulPrompt(soul);
    expect(result.length).toBeLessThan(longPublic.length);
    expect(result).toContain("(truncated)");
    // Keeps the beginning (identity/DNA)
    expect(result).toContain("[SOUL]\n" + "x".repeat(100));
  });

  it("truncates observations.md from the beginning (keeps recent)", () => {
    const longObs = "old-stuff\n" + "x".repeat(7000) + "\nrecent-observation";
    const soul: SoulContent = {
      public: "pub",
      private: [{ name: "observations.md", content: longObs }],
    };
    const result = formatSoulPrompt(soul);
    expect(result).toContain("(earlier content omitted)");
    expect(result).toContain("recent-observation");
    expect(result).not.toContain("old-stuff");
  });

  it("applies default limit to unknown private files", () => {
    const longContent = "y".repeat(4000);
    const soul: SoulContent = {
      public: "pub",
      private: [{ name: "custom.md", content: longContent }],
    };
    const result = formatSoulPrompt(soul);
    // DEFAULT_PRIVATE_LIMIT is 3000, so 4000 chars should be truncated
    expect(result).toContain("(truncated)");
  });

  it("does not truncate content within limits", () => {
    const soul: SoulContent = {
      public: "short public",
      private: [
        { name: "observations.md", content: "- obs 1" },
        { name: "patterns.md", content: "# Patterns" },
      ],
    };
    const result = formatSoulPrompt(soul);
    expect(result).not.toContain("(truncated)");
    expect(result).not.toContain("(earlier content omitted)");
  });
});

describe("truncateToLimit", () => {
  it("returns content unchanged when within limit", () => {
    expect(truncateToLimit("hello", 100, false)).toBe("hello");
    expect(truncateToLimit("hello", 100, true)).toBe("hello");
  });

  it("truncates from end when keepEnd is false", () => {
    const result = truncateToLimit("abcdefgh", 4, false);
    expect(result).toBe("abcd\n\n(truncated)");
  });

  it("truncates from start when keepEnd is true", () => {
    const result = truncateToLimit("abcdefgh", 4, true);
    expect(result).toBe("(earlier content omitted)\n\nefgh");
  });
});
