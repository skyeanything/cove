import { describe, it, expect, vi, beforeEach } from "vitest";
import type { DraftAttachment } from "@/stores/chat-types";

// Mock @tauri-apps/api/core
const mockInvoke = vi.fn();
vi.mock("@tauri-apps/api/core", () => ({ invoke: (...args: unknown[]) => mockInvoke(...args) }));

// Mock crypto.randomUUID
vi.stubGlobal("crypto", { randomUUID: () => "test-uuid-1234" });

let processAttachment: typeof import("./attachment-pipeline").processAttachment;
let processAttachmentFromBase64: typeof import("./attachment-pipeline").processAttachmentFromBase64;

beforeEach(async () => {
  vi.resetModules();
  mockInvoke.mockReset();
  const mod = await import("./attachment-pipeline");
  processAttachment = mod.processAttachment;
  processAttachmentFromBase64 = mod.processAttachmentFromBase64;
});

describe("processAttachment", () => {
  it("saves to workspace and preprocesses when workspace is set", async () => {
    mockInvoke
      .mockResolvedValueOnce({ path: "/ws/report_123.pdf", name: "report.pdf", size: 5000, relativePath: "report_123.pdf" })
      .mockResolvedValueOnce({ dataUrl: "data:application/pdf;base64,pdfdata" }) // read_file_as_data_url for PDF
      .mockResolvedValueOnce({ fileType: "pdf", content: "PDF text", summary: "PDF text", charCount: 8, truncated: false, warnings: [], metadata: {} });

    const result = await processAttachment("/tmp/report.pdf", "/ws");

    expect(mockInvoke).toHaveBeenCalledWith("save_attachment_to_workspace", { args: { sourcePath: "/tmp/report.pdf", workspaceRoot: "/ws" } });
    expect(mockInvoke).toHaveBeenCalledWith("preprocess_attachment", { args: { path: "/ws/report_123.pdf" } });
    expect(result.status).toBe("ready");
    expect(result.workspace_path).toBe("/ws/report_123.pdf");
    expect(result.parsed_content).toBe("PDF text");
    expect(result.parsed_summary).toBe("PDF text");
  });

  it("falls back to app data dir when no workspace", async () => {
    mockInvoke
      .mockResolvedValueOnce({ path: "/app/attachments/report_123.pdf", name: "report.pdf", size: 5000 })
      .mockResolvedValueOnce({ dataUrl: "data:application/pdf;base64,pdfdata" }) // read_attachment_as_data_url for PDF
      .mockResolvedValueOnce({ fileType: "pdf", content: "text", summary: "text", charCount: 4, truncated: false, warnings: [], metadata: {} });

    const result = await processAttachment("/tmp/report.pdf", undefined);

    expect(mockInvoke).toHaveBeenCalledWith("save_attachment_file", { args: { sourcePath: "/tmp/report.pdf" } });
    expect(result.status).toBe("ready");
    expect(result.workspace_path).toBeUndefined();
  });

  it("handles save failure gracefully", async () => {
    mockInvoke.mockRejectedValueOnce(new Error("Save failed"));

    const result = await processAttachment("/tmp/missing.pdf", "/ws");

    expect(result.status).toBe("error");
    expect(result.error).toBe("Save failed");
  });

  it("succeeds even if preprocess fails", async () => {
    mockInvoke
      .mockResolvedValueOnce({ path: "/ws/file_123.bin", name: "file.bin", size: 100, relativePath: "file_123.bin" })
      .mockRejectedValueOnce(new Error("Unsupported format"));

    const result = await processAttachment("/tmp/file.bin", "/ws");

    expect(result.status).toBe("ready");
    expect(result.parsed_content).toBeUndefined();
  });

  it("detects attachment type from path", async () => {
    mockInvoke
      .mockResolvedValueOnce({ path: "/ws/img_123.png", name: "img.png", size: 2000, relativePath: "img_123.png", previewDataUrl: "data:image/png;base64,abc" })
      .mockResolvedValueOnce({ fileType: "image", content: "", summary: "", charCount: 0, truncated: false, warnings: [], metadata: { imageDimensions: "100x200" } });

    const result = await processAttachment("/tmp/img.png", "/ws");

    expect(result.type).toBe("image");
    expect(result.content).toBe("data:image/png;base64,abc");
  });

  it("loads PDF data URL via read_file_as_data_url for workspace PDFs", async () => {
    mockInvoke
      .mockResolvedValueOnce({ path: "/ws/report_123.pdf", name: "report.pdf", size: 5000, relativePath: "report_123.pdf" })
      .mockResolvedValueOnce({ dataUrl: "data:application/pdf;base64,pdfdata" }) // read_file_as_data_url
      .mockResolvedValueOnce({ fileType: "pdf", content: "text", summary: "text", charCount: 4, truncated: false, warnings: [], metadata: {} });

    const result = await processAttachment("/tmp/report.pdf", "/ws");

    expect(mockInvoke).toHaveBeenCalledWith("read_file_as_data_url", { args: { workspaceRoot: "/ws", path: "/ws/report_123.pdf" } });
    expect(result.content).toBe("data:application/pdf;base64,pdfdata");
    expect(result.status).toBe("ready");
  });

  it("loads PDF data URL via read_attachment_as_data_url for app-data PDFs", async () => {
    mockInvoke
      .mockResolvedValueOnce({ path: "/app/attachments/report_123.pdf", name: "report.pdf", size: 5000 })
      .mockResolvedValueOnce({ dataUrl: "data:application/pdf;base64,pdfdata" }) // read_attachment_as_data_url
      .mockResolvedValueOnce({ fileType: "pdf", content: "text", summary: "text", charCount: 4, truncated: false, warnings: [], metadata: {} });

    const result = await processAttachment("/tmp/report.pdf", undefined);

    expect(mockInvoke).toHaveBeenCalledWith("read_attachment_as_data_url", { args: { path: "/app/attachments/report_123.pdf" } });
    expect(result.content).toBe("data:application/pdf;base64,pdfdata");
  });

  it("continues without PDF data URL when loading fails", async () => {
    mockInvoke
      .mockResolvedValueOnce({ path: "/ws/report_123.pdf", name: "report.pdf", size: 5000, relativePath: "report_123.pdf" })
      .mockRejectedValueOnce(new Error("Too large")) // read_file_as_data_url fails
      .mockResolvedValueOnce({ fileType: "pdf", content: "text", summary: "text", charCount: 4, truncated: false, warnings: [], metadata: {} });

    const result = await processAttachment("/tmp/report.pdf", "/ws");

    expect(result.status).toBe("ready");
    expect(result.content).toBeUndefined();
    expect(result.parsed_content).toBe("text");
  });
});

describe("processAttachmentFromBase64", () => {
  it("saves base64 to workspace and preprocesses", async () => {
    mockInvoke
      .mockResolvedValueOnce({ path: "/ws/doc_123.docx", name: "doc.docx", size: 3000, relativePath: "doc_123.docx" })
      .mockResolvedValueOnce({ fileType: "docx", content: "Document text", summary: "Document", charCount: 13, truncated: false, warnings: [], metadata: {} });

    const result = await processAttachmentFromBase64("doc.docx", "base64data", "/ws");

    expect(mockInvoke).toHaveBeenCalledWith("save_attachment_to_workspace_from_base64", { args: { name: "doc.docx", contentBase64: "base64data", workspaceRoot: "/ws" } });
    expect(result.status).toBe("ready");
    expect(result.workspace_path).toBe("/ws/doc_123.docx");
    expect(result.parsed_content).toBe("Document text");
  });

  it("falls back to app data dir when no workspace", async () => {
    mockInvoke
      .mockResolvedValueOnce({ path: "/app/attachments/doc_123.docx", name: "doc.docx", size: 3000 })
      .mockResolvedValueOnce({ fileType: "docx", content: "text", summary: "text", charCount: 4, truncated: false, warnings: [], metadata: {} });

    const result = await processAttachmentFromBase64("doc.docx", "base64data", undefined, "application/vnd.openxmlformats-officedocument.wordprocessingml.document");

    expect(mockInvoke).toHaveBeenCalledWith("save_attachment_from_base64", expect.objectContaining({ args: expect.objectContaining({ name: "doc.docx", contentBase64: "base64data" }) }));
    expect(result.status).toBe("ready");
    expect(result.workspace_path).toBeUndefined();
  });

  it("handles save failure gracefully", async () => {
    mockInvoke.mockRejectedValueOnce("Disk full");

    const result = await processAttachmentFromBase64("large.pdf", "data", "/ws");

    expect(result.status).toBe("error");
    expect(result.error).toBe("Disk full");
  });

  it("constructs PDF data URL from original base64", async () => {
    mockInvoke
      .mockResolvedValueOnce({ path: "/ws/report_123.pdf", name: "report.pdf", size: 5000, relativePath: "report_123.pdf" })
      .mockResolvedValueOnce({ fileType: "pdf", content: "text", summary: "text", charCount: 4, truncated: false, warnings: [], metadata: {} });

    const result = await processAttachmentFromBase64("report.pdf", "pdfbase64data", "/ws");

    expect(result.content).toBe("data:application/pdf;base64,pdfbase64data");
    expect(result.status).toBe("ready");
  });

  it("skips PDF data URL when base64 exceeds 25 MB cap", async () => {
    // 25 MB decoded ~ 33.33 MB base64 chars. Create a string slightly over.
    const oversizedBase64 = "A".repeat(Math.ceil(25 * 1024 * 1024 / 0.75) + 100);
    mockInvoke
      .mockResolvedValueOnce({ path: "/ws/huge_123.pdf", name: "huge.pdf", size: 30_000_000, relativePath: "huge_123.pdf" })
      .mockResolvedValueOnce({ fileType: "pdf", content: "text", summary: "text", charCount: 4, truncated: false, warnings: [], metadata: {} });

    const result = await processAttachmentFromBase64("huge.pdf", oversizedBase64, "/ws");

    expect(result.content).toBeUndefined();
    expect(result.status).toBe("ready");
    expect(result.parsed_content).toBe("text");
  });
});
