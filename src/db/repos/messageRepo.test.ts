import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  createMockDb,
  mockGetDb,
  type MockDatabase,
} from "@/test-utils/mock-db";
import { makeMessage } from "@/test-utils/fixtures/messages";

let db: MockDatabase;
let messageRepo: (typeof import("@/db/repos/messageRepo"))["messageRepo"];

beforeEach(async () => {
  vi.resetModules();
  db = createMockDb();
  mockGetDb(db);
  const mod = await import("@/db/repos/messageRepo");
  messageRepo = mod.messageRepo;
});

describe("messageRepo", () => {
  describe("getByConversation", () => {
    it("returns messages with default limit and offset", async () => {
      const msgs = [makeMessage(), makeMessage()];
      db.select.mockResolvedValueOnce(msgs);

      const result = await messageRepo.getByConversation("conv-1");

      expect(db.select).toHaveBeenCalledWith(
        expect.stringContaining("WHERE conversation_id = $1"),
        ["conv-1", 100, 0],
      );
      expect(result).toEqual(msgs);
    });

    it("passes custom limit and offset", async () => {
      db.select.mockResolvedValueOnce([]);
      await messageRepo.getByConversation("conv-1", 50, 10);

      expect(db.select).toHaveBeenCalledWith(
        expect.stringContaining("LIMIT $2 OFFSET $3"),
        ["conv-1", 50, 10],
      );
    });
  });

  describe("getById", () => {
    it("returns first row when found", async () => {
      const msg = makeMessage({ id: "msg-find" });
      db.select.mockResolvedValueOnce([msg]);

      const result = await messageRepo.getById("msg-find");

      expect(result).toEqual(msg);
      expect(db.select).toHaveBeenCalledWith(
        expect.stringContaining("WHERE id = $1"),
        ["msg-find"],
      );
    });

    it("returns undefined when no rows", async () => {
      db.select.mockResolvedValueOnce([]);
      const result = await messageRepo.getById("nonexistent");
      expect(result).toBeUndefined();
    });
  });

  describe("create", () => {
    it("calls db.execute with INSERT and all 10 params", async () => {
      const msg = makeMessage({
        id: "msg-new",
        conversation_id: "conv-1",
        role: "user",
        content: "hello",
        reasoning: "because",
        model: "gpt-4o",
        tokens_input: 10,
        tokens_output: 20,
        parent_id: "msg-parent",
      });
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { created_at, ...input } = msg;

      await messageRepo.create(input);

      expect(db.execute).toHaveBeenCalledWith(
        expect.stringContaining("INSERT INTO messages"),
        [
          "msg-new",
          "conv-1",
          "user",
          "hello",
          "because",
          null, // parts ?? null
          "gpt-4o",
          10,
          20,
          "msg-parent",
        ],
      );
    });

    it("nullifies undefined optional fields", async () => {
      const msg = makeMessage({ id: "msg-null" });
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { created_at, ...input } = msg;

      await messageRepo.create(input);

      const params = db.execute.mock.calls[0][1];
      // content, reasoning, parts, model, tokens_input, tokens_output, parent_id
      expect(params[3]).toBe("Hello, world!"); // content from fixture
      expect(params[4]).toBeNull(); // reasoning
      expect(params[5]).toBeNull(); // parts
      expect(params[6]).toBeNull(); // model
      expect(params[7]).toBeNull(); // tokens_input
      expect(params[8]).toBeNull(); // tokens_output
      expect(params[9]).toBeNull(); // parent_id
    });

    it("calls insertFts with concatenated content+reasoning", async () => {
      const msg = makeMessage({
        id: "msg-fts",
        content: "hello",
        reasoning: "world",
      });
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { created_at, ...input } = msg;

      await messageRepo.create(input);

      // First execute = INSERT INTO messages, second = INSERT INTO message_fts
      expect(db.execute).toHaveBeenCalledTimes(2);
      const ftsCall = db.execute.mock.calls[1];
      expect(ftsCall[0]).toContain("INSERT INTO message_fts");
      expect(ftsCall[1][0]).toBe("conv-1"); // conversationId
      expect(ftsCall[1][1]).toBe("msg-fts"); // messageId
      expect(ftsCall[1][2]).toBe("hello world"); // body trimmed
    });
  });

  describe("update", () => {
    it("builds dynamic SET clause from data fields", async () => {
      await messageRepo.update("msg-1", {
        content: "updated",
        role: "assistant",
      });

      const [sql, params] = db.execute.mock.calls[0];
      expect(sql).toContain("UPDATE messages SET");
      expect(sql).toContain("content = $1");
      expect(sql).toContain("role = $2");
      expect(sql).toContain("WHERE id = $3");
      expect(params).toEqual(["updated", "assistant", "msg-1"]);
    });

    it("skips id and created_at fields", async () => {
      await messageRepo.update("msg-1", {
        id: "should-skip",
        created_at: "should-skip",
        content: "kept",
      } as Partial<import("@/db/types").Message>);

      const [sql, params] = db.execute.mock.calls[0];
      // "id" and "created_at" should not appear in SET clause (only in WHERE)
      const setClause = sql.split("WHERE")[0];
      expect(setClause).not.toContain("id =");
      expect(setClause).not.toContain("created_at =");
      expect(sql).toContain("content = $1");
      expect(params).toEqual(["kept", "msg-1"]);
    });
  });

  describe("delete", () => {
    it("deletes from message_fts first, then messages", async () => {
      await messageRepo.delete("msg-del");

      expect(db.execute).toHaveBeenCalledTimes(2);
      expect(db.execute.mock.calls[0][0]).toContain(
        "DELETE FROM message_fts WHERE message_id = $1",
      );
      expect(db.execute.mock.calls[0][1]).toEqual(["msg-del"]);
      expect(db.execute.mock.calls[1][0]).toContain(
        "DELETE FROM messages WHERE id = $1",
      );
      expect(db.execute.mock.calls[1][1]).toEqual(["msg-del"]);
    });
  });

  describe("deleteByConversation", () => {
    it("deletes FTS and messages by conversation_id", async () => {
      await messageRepo.deleteByConversation("conv-del");

      expect(db.execute).toHaveBeenCalledTimes(2);
      expect(db.execute.mock.calls[0][1]).toEqual(["conv-del"]);
      expect(db.execute.mock.calls[1][1]).toEqual(["conv-del"]);
      expect(db.execute.mock.calls[0][0]).toContain("message_fts");
      expect(db.execute.mock.calls[1][0]).toContain("messages");
    });
  });

  describe("deleteAfter", () => {
    it("deletes FTS entries via subquery and messages by conditions", async () => {
      await messageRepo.deleteAfter("conv-1", "2025-06-01T00:00:00Z");

      expect(db.execute).toHaveBeenCalledTimes(2);

      const [ftsSql, ftsParams] = db.execute.mock.calls[0];
      expect(ftsSql).toContain("DELETE FROM message_fts");
      expect(ftsSql).toContain("SELECT id FROM messages");
      expect(ftsParams).toEqual(["conv-1", "2025-06-01T00:00:00Z"]);

      const [msgSql, msgParams] = db.execute.mock.calls[1];
      expect(msgSql).toContain("DELETE FROM messages");
      expect(msgSql).toContain("conversation_id = $1");
      expect(msgSql).toContain("created_at >= $2");
      expect(msgParams).toEqual(["conv-1", "2025-06-01T00:00:00Z"]);
    });
  });

  describe("count", () => {
    it("returns count from SELECT COUNT(*) result", async () => {
      db.select.mockResolvedValueOnce([{ count: 42 }]);
      const result = await messageRepo.count("conv-1");
      expect(result).toBe(42);
      expect(db.select).toHaveBeenCalledWith(
        expect.stringContaining("COUNT(*)"),
        ["conv-1"],
      );
    });

    it("returns 0 when rows is empty", async () => {
      db.select.mockResolvedValueOnce([]);
      const result = await messageRepo.count("conv-1");
      expect(result).toBe(0);
    });
  });

  describe("searchContent", () => {
    it("returns empty array for empty query without db call", async () => {
      const result = await messageRepo.searchContent("");
      expect(result).toEqual([]);
      expect(db.select).not.toHaveBeenCalled();
    });

    it("returns empty array for whitespace query", async () => {
      const result = await messageRepo.searchContent("   ");
      expect(result).toEqual([]);
      expect(db.select).not.toHaveBeenCalled();
    });

    it("escapes double quotes in query", async () => {
      db.select.mockResolvedValueOnce([]);
      await messageRepo.searchContent('say "hello"');

      const ftsQuery = db.select.mock.calls[0][1][0];
      expect(ftsQuery).toBe('say ""hello""');
    });

    it("splits multi-word query into FTS terms", async () => {
      db.select.mockResolvedValueOnce([]);
      await messageRepo.searchContent("foo  bar");

      const ftsQuery = db.select.mock.calls[0][1][0];
      expect(ftsQuery).toBe("foo bar");
    });

    it("maps results with snippet truncation at 120 chars", async () => {
      const longSnippet = "a".repeat(200);
      db.select.mockResolvedValueOnce([
        { conversation_id: "conv-1", snippet: longSnippet },
        { conversation_id: "conv-2", snippet: "short" },
      ]);

      const results = await messageRepo.searchContent("test");

      expect(results[0].conversationId).toBe("conv-1");
      expect(results[0].snippet).toHaveLength(121); // 120 + "…"
      expect(results[0].snippet.endsWith("…")).toBe(true);

      expect(results[1].conversationId).toBe("conv-2");
      expect(results[1].snippet).toBe("short");
    });

    it("returns empty array when db.select throws", async () => {
      db.select.mockRejectedValueOnce(new Error("FTS unavailable"));
      const result = await messageRepo.searchContent("test");
      expect(result).toEqual([]);
    });
  });

  describe("insertFts", () => {
    it("inserts into message_fts with truncated body", async () => {
      const longBody = "x".repeat(20000);
      // insertFts takes db as first arg, so we call it with our mock
      await messageRepo.insertFts(
        db as Parameters<typeof messageRepo.insertFts>[0],
        "conv-1",
        "msg-1",
        longBody,
      );

      expect(db.execute).toHaveBeenCalledWith(
        expect.stringContaining("INSERT INTO message_fts"),
        ["conv-1", "msg-1", "x".repeat(10000)],
      );
    });

    it("silently catches errors", async () => {
      db.execute.mockRejectedValueOnce(new Error("FTS broken"));

      await expect(
        messageRepo.insertFts(
          db as Parameters<typeof messageRepo.insertFts>[0],
          "conv-1",
          "msg-1",
          "body",
        ),
      ).resolves.toBeUndefined();
    });
  });
});
