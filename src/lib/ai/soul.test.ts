import { describe, expect, it, vi } from "vitest";
import { formatSoulPrompt, type SoulContent } from "./soul";

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
});
