import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  createMockDb,
  mockGetDb,
  type MockDatabase,
} from "@/test-utils/mock-db";

let db: MockDatabase;
let summaryRepo: (typeof import("@/db/repos/summaryRepo"))["summaryRepo"];

beforeEach(async () => {
  vi.resetModules();
  db = createMockDb();
  mockGetDb(db);
  const mod = await import("@/db/repos/summaryRepo");
  summaryRepo = mod.summaryRepo;
});

describe("summaryRepo", () => {
  describe("create", () => {
    it("inserts into summaries, deletes stale FTS, then inserts FTS", async () => {
      await summaryRepo.create("s1", "conv-1", "Test summary", "test,kw");

      expect(db.execute).toHaveBeenCalledTimes(3);
      expect(db.execute.mock.calls[0][0]).toContain(
        "INSERT OR REPLACE INTO conversation_summaries",
      );
      expect(db.execute.mock.calls[0][1]).toEqual([
        "s1",
        "conv-1",
        "Test summary",
        "test,kw",
      ]);
      // Delete stale FTS entry
      expect(db.execute.mock.calls[1][0]).toContain(
        "DELETE FROM conversation_summaries_fts",
      );
      expect(db.execute.mock.calls[1][1]).toEqual(["conv-1"]);
      // Insert fresh FTS entry
      expect(db.execute.mock.calls[2][0]).toContain(
        "INSERT INTO conversation_summaries_fts",
      );
    });

    it("nullifies undefined keywords", async () => {
      await summaryRepo.create("s2", "conv-2", "No keywords");

      expect(db.execute.mock.calls[0][1]).toEqual([
        "s2",
        "conv-2",
        "No keywords",
        null,
      ]);
      // FTS insert gets empty string for keywords
      expect(db.execute.mock.calls[2][1]).toEqual([
        "No keywords",
        "",
        "conv-2",
      ]);
    });
  });

  describe("getByConversation", () => {
    it("returns first row when found", async () => {
      const row = {
        id: "s1",
        conversation_id: "conv-1",
        summary: "Test",
        created_at: "",
      };
      db.select.mockResolvedValueOnce([row]);

      const result = await summaryRepo.getByConversation("conv-1");

      expect(result).toEqual(row);
      expect(db.select).toHaveBeenCalledWith(
        expect.stringContaining("WHERE conversation_id = $1"),
        ["conv-1"],
      );
    });

    it("returns undefined when no rows", async () => {
      db.select.mockResolvedValueOnce([]);
      const result = await summaryRepo.getByConversation("nonexistent");
      expect(result).toBeUndefined();
    });
  });

  describe("searchMessages", () => {
    it("filters by conversationId when provided", async () => {
      db.select.mockResolvedValueOnce([]);
      await summaryRepo.searchMessages("query", "conv-1");

      const sql = db.select.mock.calls[0][0] as string;
      expect(sql).toContain("conversation_id = $2");
      expect(db.select.mock.calls[0][1]).toEqual(["query", "conv-1", 20]);
    });

    it("searches all conversations when no conversationId", async () => {
      db.select.mockResolvedValueOnce([]);
      await summaryRepo.searchMessages("query");

      const sql = db.select.mock.calls[0][0] as string;
      expect(sql).not.toContain("conversation_id = $2");
      expect(db.select.mock.calls[0][1]).toEqual(["query", 20]);
    });
  });

  describe("deleteByConversation", () => {
    it("deletes FTS first then base table", async () => {
      await summaryRepo.deleteByConversation("conv-del");

      expect(db.execute).toHaveBeenCalledTimes(2);
      // FTS deleted first
      expect(db.execute.mock.calls[0][0]).toContain(
        "DELETE FROM conversation_summaries_fts",
      );
      expect(db.execute.mock.calls[0][1]).toEqual(["conv-del"]);
      // Base table deleted second
      expect(db.execute.mock.calls[1][0]).toContain(
        "DELETE FROM conversation_summaries WHERE conversation_id = $1",
      );
      expect(db.execute.mock.calls[1][1]).toEqual(["conv-del"]);
    });
  });

  describe("searchSummaries", () => {
    it("queries FTS with MATCH and default limit", async () => {
      db.select.mockResolvedValueOnce([]);
      await summaryRepo.searchSummaries("architecture");

      expect(db.select).toHaveBeenCalledWith(
        expect.stringContaining("MATCH $1"),
        ["architecture", 5],
      );
    });

    it("respects custom limit", async () => {
      db.select.mockResolvedValueOnce([]);
      await summaryRepo.searchSummaries("test", 3);

      expect(db.select.mock.calls[0][1]).toEqual(["test", 3]);
    });

    it("returns empty for blank query without db call", async () => {
      const result = await summaryRepo.searchSummaries("   ");
      expect(result).toEqual([]);
      expect(db.select).not.toHaveBeenCalled();
    });

    it("escapes double quotes in query", async () => {
      db.select.mockResolvedValueOnce([]);
      await summaryRepo.searchSummaries('say "hello"');

      const ftsQuery = db.select.mock.calls[0][1][0];
      expect(ftsQuery).toBe('say ""hello""');
    });
  });
});
