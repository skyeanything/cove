import { describe, expect, it } from "vitest";
import { isOfficeReadable, isOfficeWritable } from "./office-extensions";

describe("isOfficeReadable", () => {
  it("returns true for supported office formats", () => {
    expect(isOfficeReadable("report.docx")).toBe(true);
    expect(isOfficeReadable("data.xlsx")).toBe(true);
    expect(isOfficeReadable("slides.pptx")).toBe(true);
    expect(isOfficeReadable("paper.pdf")).toBe(true);
  });

  it("is case-insensitive", () => {
    expect(isOfficeReadable("FILE.DOCX")).toBe(true);
    expect(isOfficeReadable("file.PDF")).toBe(true);
  });

  it("returns false for non-office formats", () => {
    expect(isOfficeReadable("main.ts")).toBe(false);
    expect(isOfficeReadable("readme.md")).toBe(false);
    expect(isOfficeReadable("image.png")).toBe(false);
    expect(isOfficeReadable("noext")).toBe(false);
  });

  it("returns false for legacy formats", () => {
    expect(isOfficeReadable("old.doc")).toBe(false);
    expect(isOfficeReadable("old.xls")).toBe(false);
    expect(isOfficeReadable("old.ppt")).toBe(false);
  });
});

describe("isOfficeWritable", () => {
  it("returns true for docx", () => {
    expect(isOfficeWritable("output.docx")).toBe(true);
    expect(isOfficeWritable("OUTPUT.DOCX")).toBe(true);
  });

  it("returns false for other office formats", () => {
    expect(isOfficeWritable("data.xlsx")).toBe(false);
    expect(isOfficeWritable("slides.pptx")).toBe(false);
    expect(isOfficeWritable("paper.pdf")).toBe(false);
  });

  it("returns false for non-office formats", () => {
    expect(isOfficeWritable("main.ts")).toBe(false);
    expect(isOfficeWritable("noext")).toBe(false);
  });
});
