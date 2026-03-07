import { describe, it, expect, vi, beforeEach } from "vitest";

const mockInvoke = vi.fn();
vi.mock("@tauri-apps/api/core", () => ({ invoke: (...args: unknown[]) => mockInvoke(...args) }));

const mockIsSupportedUploadFile = vi.fn();
vi.mock("@/lib/attachment-utils", () => ({
  isSupportedUploadFile: (p: string) => mockIsSupportedUploadFile(p),
}));

const mockProcessAttachment = vi.fn();
vi.mock("@/lib/attachment-pipeline", () => ({
  processAttachment: (...args: unknown[]) => mockProcessAttachment(...args),
}));

import {
  readClipboardFilePaths,
  clipboardFilesToDraftAttachments,
} from "./clipboard-files";

beforeEach(() => {
  vi.clearAllMocks();
  mockIsSupportedUploadFile.mockReturnValue(true);
});

describe("readClipboardFilePaths", () => {
  it("returns paths from Tauri command", async () => {
    mockInvoke.mockResolvedValue(["/a.pdf", "/b.txt"]);
    const result = await readClipboardFilePaths();
    expect(result).toEqual(["/a.pdf", "/b.txt"]);
    expect(mockInvoke).toHaveBeenCalledWith("read_clipboard_files");
  });

  it("returns empty array on invoke failure", async () => {
    mockInvoke.mockRejectedValue(new Error("fail"));
    const result = await readClipboardFilePaths();
    expect(result).toEqual([]);
  });

  it("returns empty array when command returns empty", async () => {
    mockInvoke.mockResolvedValue([]);
    const result = await readClipboardFilePaths();
    expect(result).toEqual([]);
  });
});

describe("clipboardFilesToDraftAttachments", () => {
  it("filters unsupported files and processes supported ones", async () => {
    mockInvoke.mockResolvedValue(["/a.pdf", "/b.xyz", "/c.txt"]);
    mockIsSupportedUploadFile.mockImplementation((p: string) => p.endsWith(".pdf") || p.endsWith(".txt"));
    mockProcessAttachment.mockImplementation(async (path: string) => ({
      id: path,
      type: "file",
      name: path.split("/").pop(),
      status: "ready",
    }));

    const result = await clipboardFilesToDraftAttachments("/workspace");
    expect(result).toHaveLength(2);
    expect(result[0]?.name).toBe("a.pdf");
    expect(result[1]?.name).toBe("c.txt");
    expect(mockProcessAttachment).toHaveBeenCalledWith("/a.pdf", "/workspace");
    expect(mockProcessAttachment).toHaveBeenCalledWith("/c.txt", "/workspace");
    expect(mockProcessAttachment).not.toHaveBeenCalledWith("/b.xyz", "/workspace");
  });

  it("returns empty when no clipboard paths", async () => {
    mockInvoke.mockResolvedValue([]);
    const result = await clipboardFilesToDraftAttachments();
    expect(result).toEqual([]);
    expect(mockProcessAttachment).not.toHaveBeenCalled();
  });

  it("skips files that fail to process", async () => {
    mockInvoke.mockResolvedValue(["/a.pdf", "/b.pdf"]);
    mockProcessAttachment
      .mockResolvedValueOnce({ id: "1", type: "file", status: "ready" })
      .mockRejectedValueOnce(new Error("fail"));

    const result = await clipboardFilesToDraftAttachments();
    expect(result).toHaveLength(1);
  });

  it("skips files with error status", async () => {
    mockInvoke.mockResolvedValue(["/a.pdf"]);
    mockProcessAttachment.mockResolvedValue({ id: "1", type: "file", status: "error", error: "bad" });

    const result = await clipboardFilesToDraftAttachments();
    expect(result).toEqual([]);
  });

  it("returns empty when all files unsupported", async () => {
    mockInvoke.mockResolvedValue(["/a.xyz", "/b.abc"]);
    mockIsSupportedUploadFile.mockReturnValue(false);

    const result = await clipboardFilesToDraftAttachments();
    expect(result).toEqual([]);
    expect(mockProcessAttachment).not.toHaveBeenCalled();
  });
});
