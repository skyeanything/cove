import { describe, expect, it } from "vitest";
import {
  detectAttachmentType,
  detectMimeType,
  getAttachmentVisualKind,
  getAttachmentVisualLabel,
  getFileExtension,
  isSupportedUploadFile,
  isImageAttachment,
  isPdfAttachment,
} from "./attachment-utils";

describe("attachment-utils", () => {
  it("识别文件扩展名", () => {
    expect(getFileExtension("/tmp/demo/test.PnG")).toBe("png");
    expect(getFileExtension("README")).toBe("");
  });

  it("按扩展名识别附件类型", () => {
    expect(detectAttachmentType("a.webp")).toBe("image");
    expect(detectAttachmentType("a.pdf")).toBe("pdf");
    expect(detectAttachmentType("a.docx")).toBe("file");
    expect(detectAttachmentType("a.mp3")).toBe("file");
    expect(detectAttachmentType("a.zip")).toBe("file");
  });

  it("识别 MIME 类型", () => {
    expect(detectMimeType("a.jpg")).toBe("image/jpeg");
    expect(detectMimeType("a.pdf")).toBe("application/pdf");
    expect(detectMimeType("a.docx")).toBe("application/vnd.openxmlformats-officedocument.wordprocessingml.document");
    expect(detectMimeType("a.md")).toBe("text/markdown");
    expect(detectMimeType("a.xyz")).toBeUndefined();
  });

  it("判断图片附件", () => {
    expect(isImageAttachment({ type: "image", mime_type: undefined, path: "", name: "" })).toBe(true);
    expect(
      isImageAttachment({ type: "file", mime_type: "image/png", path: "/tmp/a.bin", name: "a.bin" }),
    ).toBe(true);
    expect(
      isImageAttachment({ type: "file", mime_type: undefined, path: "/tmp/a.pdf", name: "a.pdf" }),
    ).toBe(false);
  });

  it("识别可视化类型与标签", () => {
    expect(
      getAttachmentVisualKind({ type: "file", mime_type: undefined, path: "/tmp/demo.docx", name: "demo.docx" }),
    ).toBe("word");
    expect(
      getAttachmentVisualKind({ type: "file", mime_type: undefined, path: "/tmp/sheet.xlsx", name: "sheet.xlsx" }),
    ).toBe("excel");
    expect(
      getAttachmentVisualKind({ type: "file", mime_type: undefined, path: "/tmp/slides.pptx", name: "slides.pptx" }),
    ).toBe("ppt");
    expect(
      getAttachmentVisualKind({ type: "file", mime_type: undefined, path: "/tmp/file.pdf", name: "file.pdf" }),
    ).toBe("pdf");
    expect(getAttachmentVisualLabel("word")).toBe("WORD");
    expect(getAttachmentVisualLabel("pdf")).toBe("PDF");
    expect(getAttachmentVisualLabel("text")).toBe("TEXT");
  });

  it("判断 PDF 附件", () => {
    expect(isPdfAttachment({ type: "pdf", path: "", name: "" })).toBe(true);
    expect(isPdfAttachment({ type: "file", mime_type: "application/pdf", path: "/x", name: "x.pdf" })).toBe(true);
    expect(isPdfAttachment({ type: "file", mime_type: undefined, path: "/tmp/a.pdf", name: "a.pdf" })).toBe(true);
    expect(isPdfAttachment({ type: "file", mime_type: undefined, path: "/tmp/a.docx", name: "a.docx" })).toBe(false);
  });

  it("仅允许图片和文本类上传", () => {
    expect(isSupportedUploadFile("a.png")).toBe(true);
    expect(isSupportedUploadFile("b.md")).toBe(true);
    expect(isSupportedUploadFile("c.docx")).toBe(true);
    expect(isSupportedUploadFile("d.xlsx")).toBe(true);
    expect(isSupportedUploadFile("e.pptx")).toBe(true);
    expect(isSupportedUploadFile("f.ts")).toBe(true);
    expect(isSupportedUploadFile("x.pdf")).toBe(true);
    expect(isSupportedUploadFile("y.mp3")).toBe(false);
    expect(isSupportedUploadFile("z.zip")).toBe(false);
  });
});
