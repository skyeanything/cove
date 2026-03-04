import { describe, expect, it, vi } from "vitest";
import { formatSoulPrompt, type SoulContent } from "./soul";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));

// readSoul and writeSoul depend on Tauri invoke -- tested via integration.
// Unit tests here focus on formatSoulPrompt (pure function).

describe("formatSoulPrompt", () => {
  it("formats both public and private sections", () => {
    const soul: SoulContent = {
      public: "# Who I Am\nI'm cove.",
      private: "# Private\nObservations here.",
    };
    const result = formatSoulPrompt(soul);
    expect(result).toContain("[SOUL]\n# Who I Am\nI'm cove.");
    expect(result).toContain("[SOUL:private]\n# Private\nObservations here.");
  });

  it("includes only public section when private is empty", () => {
    const soul: SoulContent = { public: "public content", private: "" };
    const result = formatSoulPrompt(soul);
    expect(result).toContain("[SOUL]\npublic content");
    expect(result).not.toContain("[SOUL:private]");
  });

  it("includes only private section when public is empty", () => {
    const soul: SoulContent = { public: "", private: "private content" };
    const result = formatSoulPrompt(soul);
    expect(result).not.toContain("[SOUL]\n");
    expect(result).toContain("[SOUL:private]\nprivate content");
  });

  it("returns empty string when both are empty", () => {
    const soul: SoulContent = { public: "", private: "" };
    const result = formatSoulPrompt(soul);
    expect(result).toBe("");
  });

  it("preserves multiline content", () => {
    const soul: SoulContent = {
      public: "line1\nline2\nline3",
      private: "obs1\nobs2",
    };
    const result = formatSoulPrompt(soul);
    expect(result).toContain("line1\nline2\nline3");
    expect(result).toContain("obs1\nobs2");
  });
});
