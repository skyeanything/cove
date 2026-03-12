import { describe, it, expect } from "vitest";
import { buildAttachmentInjection, SMALL_FILE_THRESHOLD } from "./attachment-injection";
import type { DraftAttachment } from "@/stores/chat-types";

function makeDraft(overrides: Partial<DraftAttachment> = {}): DraftAttachment {
  return {
    id: "att-1",
    type: "file",
    name: "test.txt",
    path: "/app/attachments/test.txt",
    ...overrides,
  };
}

describe("buildAttachmentInjection", () => {
  const visionOpts = { modelSupportsVision: true, modelSupportsPdfNative: false };
  const noVisionOpts = { modelSupportsVision: false, modelSupportsPdfNative: false };
  const pdfNativeOpts = { modelSupportsVision: false, modelSupportsPdfNative: true };

  describe("images", () => {
    it("creates vision part when model supports vision", () => {
      const img = makeDraft({
        type: "image", name: "photo.png",
        content: "data:image/png;base64,abc",
        workspace_path: "/ws/photo_123.png",
      });
      const result = buildAttachmentInjection([img], visionOpts);

      expect(result.visionParts).toHaveLength(1);
      expect(result.visionParts[0]).toEqual({ type: "image", image: "data:image/png;base64,abc" });
      expect(result.textBlock).toContain("[Image: photo.png at /ws/photo_123.png]");
      expect(result.textBlock).toContain("Image attached as multimodal content");
      expect(result.textBlock).toContain("may not support image input");
    });

    it("only adds text when model lacks vision", () => {
      const img = makeDraft({
        type: "image", name: "photo.png",
        content: "data:image/png;base64,abc",
        workspace_path: "/ws/photo_123.png",
        parsed_summary: "800x600",
      });
      const result = buildAttachmentInjection([img], noVisionOpts);

      expect(result.visionParts).toHaveLength(0);
      expect(result.textBlock).toContain("[Image: photo.png at /ws/photo_123.png (800x600)]");
      expect(result.textBlock).toContain("cannot extract text from images");
      expect(result.textBlock).toContain("vision-capable model");
    });

    it("skips vision part when no data URL content", () => {
      const img = makeDraft({
        type: "image", name: "photo.png",
        workspace_path: "/ws/photo_123.png",
      });
      const result = buildAttachmentInjection([img], visionOpts);

      expect(result.visionParts).toHaveLength(0);
      expect(result.textBlock).toContain("[Image: photo.png at /ws/photo_123.png]");
      expect(result.textBlock).toContain("cannot extract text from images");
    });
  });

  describe("small documents (<=8K chars)", () => {
    it("inlines full content in fenced code block", () => {
      const doc = makeDraft({
        name: "readme.md",
        workspace_path: "/ws/readme_123.md",
        parsed_content: "# Hello\nWorld",
        parsed_summary: "Hello World",
      });
      const result = buildAttachmentInjection([doc], noVisionOpts);

      expect(result.textBlock).toContain("[Attachment: readme.md at /ws/readme_123.md]");
      expect(result.textBlock).toContain("```\n# Hello\nWorld\n```");
      expect(result.visionParts).toHaveLength(0);
      expect(result.pdfParts).toHaveLength(0);
    });

    it("uses custom threshold", () => {
      const doc = makeDraft({
        name: "file.txt",
        parsed_content: "Short",
        parsed_summary: "Short",
      });
      const result = buildAttachmentInjection([doc], { ...noVisionOpts, smallThreshold: 3 });

      // 5 chars > threshold 3, so should show as large
      expect(result.textBlock).toContain("chars, truncated");
      expect(result.textBlock).toContain("Full content available via");
    });
  });

  describe("large documents (>8K chars)", () => {
    it("shows summary and read path for large files", () => {
      const content = "x".repeat(SMALL_FILE_THRESHOLD + 1000);
      const doc = makeDraft({
        name: "large.txt",
        workspace_path: "/ws/large_123.txt",
        parsed_content: content,
        parsed_summary: "Summary of the file",
      });
      const result = buildAttachmentInjection([doc], noVisionOpts);

      expect(result.textBlock).toContain("chars, truncated");
      expect(result.textBlock).toContain("Summary of the file");
      expect(result.textBlock).toContain("Full content available via `read` tool at: /ws/large_123.txt");
    });

    it("falls back to first 800 chars when no summary", () => {
      const content = "abcdefg ".repeat(2000);
      const doc = makeDraft({
        name: "large.txt",
        parsed_content: content,
      });
      const result = buildAttachmentInjection([doc], noVisionOpts);

      expect(result.textBlock).toContain("chars, truncated");
    });
  });

  describe("documents with no parsed content", () => {
    it("suggests using read tool", () => {
      const doc = makeDraft({
        name: "binary.dat",
        workspace_path: "/ws/binary_123.dat",
      });
      const result = buildAttachmentInjection([doc], noVisionOpts);

      expect(result.textBlock).toContain("[Attachment: binary.dat at /ws/binary_123.dat -- use `read` tool to view content]");
    });

    it("falls back to path when no workspace_path", () => {
      const doc = makeDraft({
        name: "old.txt",
        path: "/app/attachments/old.txt",
      });
      const result = buildAttachmentInjection([doc], noVisionOpts);

      expect(result.textBlock).toContain("at /app/attachments/old.txt");
    });
  });

  describe("PDFs", () => {
    it("sends as native file part when model supports it", () => {
      const pdf = makeDraft({
        type: "pdf", name: "report.pdf",
        content: "data:application/pdf;base64,abc",
        workspace_path: "/ws/report_123.pdf",
        parsed_content: "PDF content text",
      });
      const result = buildAttachmentInjection([pdf], pdfNativeOpts);

      expect(result.pdfParts).toHaveLength(1);
      expect(result.pdfParts[0]).toEqual({ type: "file", data: "data:application/pdf;base64,abc", mediaType: "application/pdf" });
      expect(result.textBlock).toContain("[PDF: report.pdf at /ws/report_123.pdf]");
      expect(result.textBlock).toContain("Extracted text preview:");
      expect(result.textBlock).toContain("PDF content text");
      expect(result.textBlock).toContain("PDF attached natively");
    });

    it("inlines text content when model lacks native PDF support", () => {
      const pdf = makeDraft({
        type: "pdf", name: "report.pdf",
        workspace_path: "/ws/report_123.pdf",
        parsed_content: "PDF text content",
        parsed_summary: "PDF text",
      });
      const result = buildAttachmentInjection([pdf], noVisionOpts);

      expect(result.pdfParts).toHaveLength(0);
      expect(result.textBlock).toContain("```\nPDF text content\n```");
    });

    it("falls through to text injection when no PDF data URL on native model", () => {
      const pdf = makeDraft({
        type: "pdf", name: "report.pdf",
        content: "data:image/png;base64,notpdf",
        workspace_path: "/ws/report_123.pdf",
        parsed_content: "Extracted PDF text",
      });
      const result = buildAttachmentInjection([pdf], pdfNativeOpts);

      expect(result.pdfParts).toHaveLength(0);
      expect(result.textBlock).toContain("[Attachment: report.pdf at /ws/report_123.pdf]");
      expect(result.textBlock).toContain("```\nExtracted PDF text\n```");
    });

    it("falls through to read-tool hint when no data URL and no parsed content", () => {
      const pdf = makeDraft({
        type: "pdf", name: "report.pdf",
        workspace_path: "/ws/report_123.pdf",
      });
      const result = buildAttachmentInjection([pdf], pdfNativeOpts);

      expect(result.pdfParts).toHaveLength(0);
      expect(result.textBlock).toContain("use `read` tool to view content");
    });
  });

  describe("multiple attachments", () => {
    it("handles mixed attachment types", () => {
      const img = makeDraft({ type: "image", name: "photo.png", content: "data:image/png;base64,abc", workspace_path: "/ws/photo.png" });
      const doc = makeDraft({ name: "readme.md", parsed_content: "hello", workspace_path: "/ws/readme.md" });
      const pdf = makeDraft({ type: "pdf", name: "report.pdf", content: "data:application/pdf;base64,pdf", workspace_path: "/ws/report.pdf", parsed_content: "pdf text" });

      const result = buildAttachmentInjection([img, doc, pdf], { ...visionOpts, modelSupportsPdfNative: true });

      expect(result.visionParts).toHaveLength(1);
      expect(result.pdfParts).toHaveLength(1);
      expect(result.textBlock).toContain("[Image: photo.png");
      expect(result.textBlock).toContain("[Attachment: readme.md");
      expect(result.textBlock).toContain("[PDF: report.pdf");
    });
  });

  describe("empty attachments", () => {
    it("returns empty result for no attachments", () => {
      const result = buildAttachmentInjection([], noVisionOpts);

      expect(result.textBlock).toBe("");
      expect(result.visionParts).toHaveLength(0);
      expect(result.pdfParts).toHaveLength(0);
    });
  });
});
