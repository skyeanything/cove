import { describe, expect, it } from "vitest";
import {
  extractUrls,
  buildFetchBlockFromResults,
  MAX_URLS,
  MAX_URL_LENGTH,
} from "./url-utils";

describe("url-utils", () => {
  it("从纯 URL 文本中提取单个 URL", () => {
    expect(extractUrls("https://example.com")).toEqual(["https://example.com"]);
    expect(extractUrls("http://a.b.c/path")).toEqual(["http://a.b.c/path"]);
  });

  it("从混合文本中提取多个 URL，按出现顺序且去重", () => {
    const text = "看这个 https://a.com 和 https://b.com 以及 https://a.com 重复";
    expect(extractUrls(text)).toEqual(["https://a.com", "https://b.com"]);
  });

  it("最多返回 MAX_URLS 个 URL", () => {
    const urls = Array.from({ length: 10 }, (_, i) => `https://example${i}.com`).join(" ");
    const result = extractUrls(urls);
    expect(result).toHaveLength(MAX_URLS);
    expect(result[0]).toBe("https://example0.com");
    expect(result[4]).toBe("https://example4.com");
  });

  it("不以 http(s) 开头的 slash 命令不会被识别为 URL", () => {
    expect(extractUrls("/skill")).toEqual([]);
    expect(extractUrls("/")).toEqual([]);
    expect(extractUrls("/fetch")).toEqual([]);
    expect(extractUrls("请用 /skill 加载技能")).toEqual([]);
  });

  it("纯文本不含 URL 时返回空数组", () => {
    expect(extractUrls("你好世界")).toEqual([]);
    expect(extractUrls("请总结一下")).toEqual([]);
    expect(extractUrls("")).toEqual([]);
  });

  it("空字符串或非字符串返回空数组", () => {
    expect(extractUrls("")).toEqual([]);
    expect(extractUrls(null as unknown as string)).toEqual([]);
    expect(extractUrls(undefined as unknown as string)).toEqual([]);
  });

  it("URL 末尾标点会被去掉", () => {
    expect(extractUrls("链接：https://example.com。")).toEqual(["https://example.com"]);
    expect(extractUrls("见 https://x.com)? 和")).toEqual(["https://x.com"]);
  });

  it("超长 URL 被跳过", () => {
    const longPath = "https://example.com/" + "a".repeat(MAX_URL_LENGTH);
    const result = extractUrls(longPath);
    expect(result).toHaveLength(0);
  });

  it("混合：既有 URL 又有普通文字，只返回 URL", () => {
    const text = "请抓取 https://github.com 的内容并总结";
    expect(extractUrls(text)).toEqual(["https://github.com"]);
  });

  it("中文冒号后的 ithome 等真实链接可被识别", () => {
    const text = "这个链接说的什么: https://www.ithome.com/0/922/779.htm";
    expect(extractUrls(text)).toEqual(["https://www.ithome.com/0/922/779.htm"]);
  });
});

describe("buildFetchBlockFromResults", () => {
  it("无结果时返回空字符串", () => {
    expect(buildFetchBlockFromResults([])).toBe("");
  });

  it("全部成功时拼接标题与 content_md", () => {
    const results = [
      {
        ok: true,
        title: "Example",
        content_md: "Hello world",
        source: "https://example.com",
      },
    ];
    const block = buildFetchBlockFromResults(results);
    expect(block).toContain("[以下为抓取内容]");
    expect(block).toContain("## [Example](https://example.com)");
    expect(block).toContain("Hello world");
  });

  it("无 title 时用 source 作为标题", () => {
    const results = [
      { ok: true, content_md: "Body", source: "https://a.com" },
    ];
    const block = buildFetchBlockFromResults(results);
    expect(block).toContain("## https://a.com");
    expect(block).toContain("Body");
  });

  it("抓取失败时写入错误信息", () => {
    const results = [
      { ok: false, error: "请求超时", source: "https://x.com" },
    ];
    const block = buildFetchBlockFromResults(results);
    expect(block).toContain("[以下为抓取内容]");
    expect(block).toContain("https://x.com：抓取失败（请求超时）");
  });

  it("成功与失败混合时都写入", () => {
    const results = [
      { ok: true, content_md: "OK", source: "https://a.com" },
      { ok: false, error: "403", source: "https://b.com" },
    ];
    const block = buildFetchBlockFromResults(results);
    expect(block).toContain("## https://a.com");
    expect(block).toContain("OK");
    expect(block).toContain("https://b.com：抓取失败（403）");
  });
});
