// @vitest-environment happy-dom
import { describe, expect, it, vi, beforeEach } from "vitest";
import { setupTauriMocks, makeAttachment, makeMessage } from "@/test-utils";

// ── Module mocks ──────────────────────────────────────────────────────────────

vi.mock("@/stores/dataStore", () => ({
  useDataStore: {
    getState: vi.fn(() => ({ activeConversationId: "conv-1" })),
  },
}));

vi.mock("@/db/repos/attachmentRepo", () => ({
  attachmentRepo: {
    getById: vi.fn(),
  },
}));

vi.mock("@/db/repos/messageRepo", () => ({
  messageRepo: {
    getById: vi.fn(),
  },
}));

import { useDataStore } from "@/stores/dataStore";
import { attachmentRepo } from "@/db/repos/attachmentRepo";
import { messageRepo } from "@/db/repos/messageRepo";

const mockDataStore = vi.mocked(useDataStore.getState);
const mockGetAttachment = vi.mocked(attachmentRepo.getById);
const mockGetMessage = vi.mocked(messageRepo.getById);

import { parseDocumentTool } from "./parse-document";

// ── Helpers ───────────────────────────────────────────────────────────────────

type ExecInput = Parameters<NonNullable<typeof parseDocumentTool.execute>>[0];
type ExecOptions = Parameters<NonNullable<typeof parseDocumentTool.execute>>[1];

async function exec(attachmentId: string, opts: Partial<Omit<ExecInput, "attachmentId">> = {}) {
  return parseDocumentTool.execute!(
    { attachmentId, ...opts } as ExecInput,
    {} as ExecOptions,
  );
}

function defaultParseResult(content = "Hello document content") {
  return {
    fileType: "txt",
    content,
    truncated: false,
    warnings: [],
  };
}

// ── Setup ─────────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  mockDataStore.mockReturnValue({ activeConversationId: "conv-1" } as ReturnType<typeof mockDataStore>);
});

// ── Error path tests ──────────────────────────────────────────────────────────

describe("parseDocumentTool – error paths", () => {
  it("returns no-active-conversation when conversationId is null", async () => {
    mockDataStore.mockReturnValue({ activeConversationId: null } as ReturnType<typeof mockDataStore>);
    const result = await exec("att-1");
    expect(result).toContain("没有激活会话");
  });

  it("returns not-found when attachment does not exist", async () => {
    mockGetAttachment.mockResolvedValue(undefined);
    const result = await exec("att-missing");
    expect(result).toContain("附件不存在");
    expect(result).toContain("att-missing");
  });

  it("returns missing message_id error when attachment has no message_id", async () => {
    mockGetAttachment.mockResolvedValue(
      makeAttachment({ id: "att-1", message_id: undefined }),
    );
    const result = await exec("att-1");
    expect(result).toContain("附件缺少消息关联");
  });

  it("returns no-permission when message not found", async () => {
    mockGetAttachment.mockResolvedValue(
      makeAttachment({ id: "att-1", message_id: "msg-1" }),
    );
    mockGetMessage.mockResolvedValue(undefined);
    const result = await exec("att-1");
    expect(result).toContain("无权解析");
  });

  it("returns no-permission when message belongs to different conversation", async () => {
    mockGetAttachment.mockResolvedValue(
      makeAttachment({ id: "att-1", message_id: "msg-1" }),
    );
    mockGetMessage.mockResolvedValue(
      makeMessage({ id: "msg-1", conversation_id: "conv-OTHER" }),
    );
    const result = await exec("att-1");
    expect(result).toContain("无权解析");
  });

  it("returns missing path error when attachment path is empty", async () => {
    mockGetAttachment.mockResolvedValue(
      makeAttachment({ id: "att-1", message_id: "msg-1", path: "" }),
    );
    mockGetMessage.mockResolvedValue(
      makeMessage({ id: "msg-1", conversation_id: "conv-1" }),
    );
    const result = await exec("att-1");
    expect(result).toContain("附件缺少文件路径");
  });

  it("returns parse-failure message when invoke throws", async () => {
    mockGetAttachment.mockResolvedValue(
      makeAttachment({ id: "att-1", message_id: "msg-1", path: "/tmp/file.txt" }),
    );
    mockGetMessage.mockResolvedValue(
      makeMessage({ id: "msg-1", conversation_id: "conv-1" }),
    );
    setupTauriMocks({
      parse_document_text: () => {
        throw new Error("unsupported file type");
      },
    });
    const result = await exec("att-1");
    expect(result).toContain("解析附件失败");
    expect(result).toContain("unsupported file type");
  });
});

// ── Success path tests ────────────────────────────────────────────────────────

describe("parseDocumentTool – success paths", () => {
  beforeEach(() => {
    mockGetAttachment.mockResolvedValue(
      makeAttachment({ id: "att-1", message_id: "msg-1", path: "/tmp/doc.txt", name: "doc.txt" }),
    );
    mockGetMessage.mockResolvedValue(
      makeMessage({ id: "msg-1", conversation_id: "conv-1" }),
    );
  });

  it("returns full mode with chunkCount=1 and single chunk", async () => {
    setupTauriMocks({
      parse_document_text: () => defaultParseResult("Full document content."),
    });

    const raw = await exec("att-1", { mode: "full" });
    const result = JSON.parse(raw as string);

    expect(result.mode).toBe("full");
    expect(result.chunkCount).toBe(1);
    expect(result.chunks).toHaveLength(1);
    expect(result.chunks[0].index).toBe(0);
    expect(result.chunks[0].text).toBe("Full document content.");
  });

  it("returns summary mode with summary field and no chunks", async () => {
    setupTauriMocks({
      parse_document_text: () => defaultParseResult("Summary document content."),
    });

    const raw = await exec("att-1", { mode: "summary" });
    const result = JSON.parse(raw as string);

    expect(result.mode).toBe("summary");
    expect(result.chunkCount).toBe(0);
    expect(result.chunks).toHaveLength(0);
    expect(result.summary).toBeTruthy();
    expect(result.summary).toContain("Summary document content.");
  });

  it("returns chunks mode splitting content by chunkSize", async () => {
    // 10000 chars, chunkSize=4000 → 3 chunks
    const content = "X".repeat(10_000);
    setupTauriMocks({
      parse_document_text: () => defaultParseResult(content),
    });

    const raw = await exec("att-1", { mode: "chunks", chunkSize: 4000, maxChunks: 10 });
    const result = JSON.parse(raw as string);

    expect(result.mode).toBe("chunks");
    expect(result.chunkCount).toBe(3);
    expect(result.chunks).toHaveLength(3);
    expect(result.chunks[0].index).toBe(0);
    expect(result.chunks[1].index).toBe(1);
    expect(result.chunks[2].index).toBe(2);
  });

  it("respects maxChunks limit", async () => {
    // 20000 chars, chunkSize=1000 → 20 raw chunks; maxChunks=5 → only 5
    const content = "Y".repeat(20_000);
    setupTauriMocks({
      parse_document_text: () => defaultParseResult(content),
    });

    const raw = await exec("att-1", { mode: "chunks", chunkSize: 1000, maxChunks: 5 });
    const result = JSON.parse(raw as string);

    expect(result.chunks.length).toBe(5);
  });

  it("clamps chunkSize to 12000 when over maximum", async () => {
    const content = "Z".repeat(50_000);
    setupTauriMocks({
      parse_document_text: () => defaultParseResult(content),
    });

    const raw = await exec("att-1", { mode: "chunks", chunkSize: 20_000, maxChunks: 10 });
    const result = JSON.parse(raw as string);

    // chunkSize clamped to 12000 → ceil(50000/12000) = 5 chunks (capped at 10)
    expect(result.chunks[0].text.length).toBeLessThanOrEqual(12_000);
  });

  it("uses default chunkSize 3200 when chunkSize <= 200", async () => {
    const content = "A".repeat(10_000);
    setupTauriMocks({
      parse_document_text: () => defaultParseResult(content),
    });

    const raw = await exec("att-1", { mode: "chunks", chunkSize: 100 });
    const result = JSON.parse(raw as string);

    // Default 3200 → 10000/3200 = 4 chunks (maxChunks defaults to 12)
    expect(result.chunks[0].text.length).toBe(3200);
  });

  it("clamps maxChunks to 50 when over maximum", async () => {
    const content = "B".repeat(60_000);
    setupTauriMocks({
      parse_document_text: () => defaultParseResult(content),
    });

    const raw = await exec("att-1", { mode: "chunks", chunkSize: 1000, maxChunks: 100 });
    const result = JSON.parse(raw as string);

    expect(result.chunks.length).toBeLessThanOrEqual(50);
  });

  it("includes attachment metadata in result", async () => {
    setupTauriMocks({
      parse_document_text: () => ({ ...defaultParseResult(), fileType: "pdf", truncated: true, warnings: ["large file"] }),
    });

    const raw = await exec("att-1", { mode: "full" });
    const result = JSON.parse(raw as string);

    expect(result.attachmentId).toBe("att-1");
    expect(result.name).toBe("doc.txt");
    expect(result.path).toBe("/tmp/doc.txt");
    expect(result.fileType).toBe("pdf");
    expect(result.truncated).toBe(true);
    expect(result.warnings).toEqual(["large file"]);
  });

  it("defaults mode to full when not specified", async () => {
    setupTauriMocks({
      parse_document_text: () => defaultParseResult("content"),
    });

    const raw = await exec("att-1");
    const result = JSON.parse(raw as string);

    expect(result.mode).toBe("full");
    expect(result.chunkCount).toBe(1);
  });
});
