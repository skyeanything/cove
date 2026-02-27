import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  createMockDb,
  mockGetDb,
  type MockDatabase,
} from "@/test-utils/mock-db";
import { makeConversation } from "@/test-utils/fixtures/messages";

let db: MockDatabase;
let conversationRepo: (typeof import("@/db/repos/conversationRepo"))["conversationRepo"];

beforeEach(async () => {
  vi.resetModules();
  db = createMockDb();
  mockGetDb(db);
  const mod = await import("@/db/repos/conversationRepo");
  conversationRepo = mod.conversationRepo;
});

describe("conversationRepo", () => {
  describe("getAll", () => {
    it("returns conversations ordered by pinned DESC, updated_at DESC", async () => {
      const convs = [makeConversation({ pinned: 1 }), makeConversation()];
      db.select.mockResolvedValueOnce(convs);

      const result = await conversationRepo.getAll();

      expect(db.select).toHaveBeenCalledWith(
        expect.stringContaining(
          "ORDER BY pinned DESC, updated_at DESC",
        ),
      );
      expect(result).toEqual(convs);
    });
  });

  describe("getById", () => {
    it("returns first row when found", async () => {
      const conv = makeConversation({ id: "conv-find" });
      db.select.mockResolvedValueOnce([conv]);

      const result = await conversationRepo.getById("conv-find");

      expect(result).toEqual(conv);
      expect(db.select).toHaveBeenCalledWith(
        expect.stringContaining("WHERE id = $1"),
        ["conv-find"],
      );
    });

    it("returns undefined when no rows", async () => {
      db.select.mockResolvedValueOnce([]);
      const result = await conversationRepo.getById("nonexistent");
      expect(result).toBeUndefined();
    });
  });

  describe("search", () => {
    it("calls db.select with LIKE %query% pattern", async () => {
      const convs = [makeConversation({ title: "My Chat" })];
      db.select.mockResolvedValueOnce(convs);

      const result = await conversationRepo.search("Chat");

      expect(db.select).toHaveBeenCalledWith(
        expect.stringContaining("WHERE title LIKE $1"),
        ["%Chat%"],
      );
      expect(result).toEqual(convs);
    });
  });

  describe("getGrouped", () => {
    beforeEach(() => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2025-06-15T12:00:00Z"));
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it("groups conversations into time buckets", async () => {
      // Derive bucket timestamps from local midnight, same as the repo
      const now = new Date("2025-06-15T12:00:00Z");
      const todayStart = new Date(
        now.getFullYear(),
        now.getMonth(),
        now.getDate(),
      );
      const yesterdayStart = new Date(todayStart.getTime() - 86400000);
      const past7Start = new Date(todayStart.getTime() - 7 * 86400000);

      const todayConv = makeConversation({
        updated_at: new Date(todayStart.getTime() + 3600000).toISOString(),
      });
      const yesterdayConv = makeConversation({
        updated_at: new Date(yesterdayStart.getTime() + 3600000).toISOString(),
      });
      const past7Conv = makeConversation({
        updated_at: new Date(past7Start.getTime() + 3600000).toISOString(),
      });
      const earlierConv = makeConversation({
        updated_at: new Date(past7Start.getTime() - 86400000).toISOString(),
      });
      db.select.mockResolvedValueOnce([
        todayConv,
        yesterdayConv,
        past7Conv,
        earlierConv,
      ]);

      const groups = await conversationRepo.getGrouped();

      expect(groups["Today"]).toEqual([todayConv]);
      expect(groups["Yesterday"]).toEqual([yesterdayConv]);
      expect(groups["Past 7 days"]).toEqual([past7Conv]);
      expect(groups["Earlier"]).toEqual([earlierConv]);
    });

    it("returns empty object when no conversations", async () => {
      db.select.mockResolvedValueOnce([]);
      const groups = await conversationRepo.getGrouped();
      expect(groups).toEqual({});
    });

    it("correctly categorizes boundary dates", async () => {
      // Compute "today" the same way the repo does (local midnight)
      const now = new Date("2025-06-15T12:00:00Z");
      const todayStart = new Date(
        now.getFullYear(),
        now.getMonth(),
        now.getDate(),
      );
      // 1 ms before local midnight = yesterday
      const justBefore = new Date(todayStart.getTime() - 1);
      // at local midnight = today
      const atMidnight = makeConversation({
        updated_at: todayStart.toISOString(),
      });
      const justBeforeMidnight = makeConversation({
        updated_at: justBefore.toISOString(),
      });
      db.select.mockResolvedValueOnce([atMidnight, justBeforeMidnight]);

      const groups = await conversationRepo.getGrouped();

      expect(groups["Today"]).toEqual([atMidnight]);
      expect(groups["Yesterday"]).toEqual([justBeforeMidnight]);
    });
  });

  describe("create", () => {
    it("calls db.execute with INSERT SQL and 9 params", async () => {
      const conv = makeConversation({
        id: "conv-new",
        assistant_id: "a-1",
        title: "New Chat",
        pinned: 0,
        model_override: "gpt-4o",
      });
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { created_at, updated_at, ...input } = conv;

      await conversationRepo.create(input);

      expect(db.execute).toHaveBeenCalledWith(
        expect.stringContaining("INSERT INTO conversations"),
        [
          "conv-new",
          "a-1",
          "New Chat",
          0,
          "gpt-4o",
          null, // system_instruction_override
          null, // temperature_override
          null, // provider_type
          null, // workspace_path
        ],
      );
    });

    it("nullifies undefined optional fields", async () => {
      const conv = makeConversation({ id: "conv-null" });
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { created_at, updated_at, ...input } = conv;

      await conversationRepo.create(input);

      const params = db.execute.mock.calls[0][1];
      expect(params[4]).toBeNull(); // model_override
      expect(params[5]).toBeNull(); // system_instruction_override
      expect(params[6]).toBeNull(); // temperature_override
      expect(params[7]).toBeNull(); // provider_type
      expect(params[8]).toBeNull(); // workspace_path
    });
  });

  describe("update", () => {
    it("builds dynamic SET clause from data fields", async () => {
      await conversationRepo.update("conv-1", {
        title: "Renamed",
        pinned: 1,
      });

      const [sql, params] = db.execute.mock.calls[0];
      expect(sql).toContain("UPDATE conversations SET");
      expect(sql).toContain("title = $1");
      expect(sql).toContain("pinned = $2");
      expect(sql).toContain("updated_at = datetime('now')");
      expect(params).toEqual(["Renamed", 1, "conv-1"]);
    });

    it("skips id, created_at, and undefined values", async () => {
      await conversationRepo.update("conv-1", {
        id: "skip-id",
        created_at: "skip-ts",
        title: "Kept",
        model_override: undefined,
      } as Partial<import("@/db/types").Conversation>);

      const [sql, params] = db.execute.mock.calls[0];
      // "id" and "created_at" should not appear in SET clause (only in WHERE)
      const setClause = sql.split("WHERE")[0];
      expect(setClause).not.toContain("id =");
      expect(setClause).not.toContain("created_at =");
      expect(setClause).not.toContain("model_override");
      expect(sql).toContain("title = $1");
      expect(params).toEqual(["Kept", "conv-1"]);
    });

    it("appends updated_at = datetime('now') to SET clause", async () => {
      await conversationRepo.update("conv-1", { title: "T" });

      const [sql] = db.execute.mock.calls[0];
      expect(sql).toContain("updated_at = datetime('now')");
    });

    it("uses correct param index for WHERE id", async () => {
      await conversationRepo.update("conv-1", {
        title: "A",
        pinned: 1,
        model_override: "gpt-4",
      });

      const [sql, params] = db.execute.mock.calls[0];
      // 3 fields + id = $4
      expect(sql).toContain("WHERE id = $4");
      expect(params).toEqual(["A", 1, "gpt-4", "conv-1"]);
    });
  });

  describe("delete", () => {
    it("calls db.execute with DELETE WHERE id", async () => {
      await conversationRepo.delete("conv-del");

      expect(db.execute).toHaveBeenCalledWith(
        expect.stringContaining("DELETE FROM conversations WHERE id = $1"),
        ["conv-del"],
      );
    });
  });

  describe("setPinned", () => {
    it("updates pinned only without touching updated_at", async () => {
      await conversationRepo.setPinned("conv-pin", 1);

      expect(db.execute).toHaveBeenCalledWith(
        "UPDATE conversations SET pinned = $1 WHERE id = $2",
        [1, "conv-pin"],
      );
    });

    it("passes [pinned, id] as params", async () => {
      await conversationRepo.setPinned("conv-2", 0);

      const params = db.execute.mock.calls[0][1];
      expect(params).toEqual([0, "conv-2"]);
    });
  });
});
