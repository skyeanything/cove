import { describe, it, expect, vi } from "vitest";

vi.mock("pdfjs-dist", () => ({
  GlobalWorkerOptions: { workerSrc: "" },
  getDocument: vi.fn(),
}));
vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}));
vi.mock("./PdfPage", () => ({
  PdfPage: () => null,
}));

import { cacheKey } from "./OfficePdfViewer";

describe("cacheKey", () => {
  it("produces deterministic keys for the same input", () => {
    const url = "data:application/pdf;base64,AAAA";
    expect(cacheKey("docx_to_pdf", url)).toBe(cacheKey("docx_to_pdf", url));
  });

  it("differs by command", () => {
    const url = "data:application/pdf;base64,AAAA";
    expect(cacheKey("docx_to_pdf", url)).not.toBe(cacheKey("pptx_to_pdf", url));
  });

  it("differs for same-length content with different suffixes", () => {
    // Same prefix, same length, different suffix — old key would collide
    const prefix = "data:application/pdf;base64,";
    const contentA = "A".repeat(100) + "XXXX";
    const contentB = "A".repeat(100) + "YYYY";
    const urlA = prefix + contentA;
    const urlB = prefix + contentB;
    expect(urlA.length).toBe(urlB.length);
    expect(cacheKey("docx_to_pdf", urlA)).not.toBe(cacheKey("docx_to_pdf", urlB));
  });

  it("differs for same-length content with different prefixes", () => {
    const prefix = "data:application/pdf;base64,";
    const contentA = "XXXX" + "A".repeat(100);
    const contentB = "YYYY" + "A".repeat(100);
    const urlA = prefix + contentA;
    const urlB = prefix + contentB;
    expect(urlA.length).toBe(urlB.length);
    expect(cacheKey("docx_to_pdf", urlA)).not.toBe(cacheKey("docx_to_pdf", urlB));
  });

  it("handles dataUrl without comma separator", () => {
    const raw = "rawbase64content";
    const key = cacheKey("test", raw);
    expect(key).toContain("test:");
    expect(key).toContain(String(raw.length));
  });

  it("uses content after comma for key generation", () => {
    const url = "data:application/pdf;base64,actualcontent";
    const key = cacheKey("cmd", url);
    // Should use "actualcontent" not the full URL
    expect(key).toContain(String("actualcontent".length));
  });
});
