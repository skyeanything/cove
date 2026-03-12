import { describe, it, expect } from "vitest";
import { matchesPinyinOrSubstring } from "./pinyin-filter";

describe("matchesPinyinOrSubstring", () => {
  it("matches ASCII substring case-insensitively", () => {
    expect(matchesPinyinOrSubstring("package.json", "pack")).toBe(true);
    expect(matchesPinyinOrSubstring("README.md", "readme")).toBe(true);
    expect(matchesPinyinOrSubstring("README.md", "READ")).toBe(true);
  });

  it("matches Chinese text by full pinyin", () => {
    expect(matchesPinyinOrSubstring("宝贝.txt", "baobei")).toBe(true);
    expect(matchesPinyinOrSubstring("测试文件.md", "ceshi")).toBe(true);
  });

  it("matches Chinese text by pinyin abbreviation", () => {
    expect(matchesPinyinOrSubstring("宝贝.txt", "bb")).toBe(true);
    expect(matchesPinyinOrSubstring("测试文件.md", "cswj")).toBe(true);
  });

  it("matches partial pinyin", () => {
    expect(matchesPinyinOrSubstring("宝贝.txt", "bao")).toBe(true);
  });

  it("matches mixed Chinese and English text", () => {
    expect(matchesPinyinOrSubstring("项目plan.docx", "xm")).toBe(true);
    expect(matchesPinyinOrSubstring("项目plan.docx", "plan")).toBe(true);
  });

  it("returns false for non-matching query", () => {
    expect(matchesPinyinOrSubstring("package.json", "xyz")).toBe(false);
    expect(matchesPinyinOrSubstring("宝贝.txt", "dajia")).toBe(false);
  });

  it("returns true for empty query", () => {
    expect(matchesPinyinOrSubstring("anything", "")).toBe(true);
  });

  it("returns false for empty text with non-empty query", () => {
    expect(matchesPinyinOrSubstring("", "abc")).toBe(false);
  });
});
