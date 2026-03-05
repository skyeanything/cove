import { describe, expect, it, vi } from "vitest";

vi.mock("@/db/repos/summaryRepo", () => ({
  summaryRepo: {
    searchSummaries: vi.fn(),
  },
}));
vi.mock("@/db/repos/messageRepo", () => ({
  messageRepo: {
    getByConversation: vi.fn(),
  },
}));

import { summaryRepo } from "@/db/repos/summaryRepo";
import { messageRepo } from "@/db/repos/messageRepo";
import { recallTool, recallDetailTool } from "./recall";

describe("recallTool", () => {
  it("returns found=false when no matches", async () => {
    vi.mocked(summaryRepo.searchSummaries).mockResolvedValue([]);
    const result = await recallTool.execute(
      { query: "test", limit: 5 },
      { toolCallId: "t1", messages: [], abortSignal: new AbortController().signal },
    );
    expect(result).toHaveProperty("found", false);
  });

  it("returns results when matches found", async () => {
    vi.mocked(summaryRepo.searchSummaries).mockResolvedValue([
      {
        conversation_id: "c1",
        summary: "Discussed architecture",
        keywords: "arch,design",
        created_at: "2026-03-01",
        rank: 1,
      },
    ]);
    const result = await recallTool.execute(
      { query: "architecture", limit: 5 },
      { toolCallId: "t1", messages: [], abortSignal: new AbortController().signal },
    );
    expect(result).toHaveProperty("found", true);
    expect(result).toHaveProperty("count", 1);
    const r = result as { results: string };
    const parsed = JSON.parse(r.results) as Record<string, unknown>[];
    expect(parsed[0]).toHaveProperty("date", "2026-03-01");
  });
});

describe("recallDetailTool", () => {
  it("returns found=false when no messages", async () => {
    vi.mocked(messageRepo.getByConversation).mockResolvedValue([]);
    const result = await recallDetailTool.execute(
      { conversationId: "c1", limit: 50 },
      { toolCallId: "t1", messages: [], abortSignal: new AbortController().signal },
    );
    expect(result).toHaveProperty("found", false);
  });

  it("returns formatted messages", async () => {
    vi.mocked(messageRepo.getByConversation).mockResolvedValue([
      { id: "m1", conversation_id: "c1", role: "user", content: "Hello", created_at: "" },
      { id: "m2", conversation_id: "c1", role: "assistant", content: "Hi there", created_at: "" },
    ]);
    const result = await recallDetailTool.execute(
      { conversationId: "c1", limit: 50 },
      { toolCallId: "t1", messages: [], abortSignal: new AbortController().signal },
    );
    expect(result).toHaveProperty("found", true);
    expect(result).toHaveProperty("messageCount", 2);
  });
});
