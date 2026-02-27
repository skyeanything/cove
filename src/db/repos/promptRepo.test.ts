import { describe, it, expect, vi, beforeEach } from "vitest";
import { createMockDb, mockGetDb, type MockDatabase, makePrompt } from "@/test-utils";

let db: MockDatabase;
let promptRepo: (typeof import("@/db/repos/promptRepo"))["promptRepo"];

beforeEach(async () => {
  vi.resetModules();
  db = createMockDb();
  mockGetDb(db);
  const mod = await import("@/db/repos/promptRepo");
  promptRepo = mod.promptRepo;
});

describe("promptRepo", () => {
  describe("getAll", () => {
    it("returns all prompts ordered by sort_order, name", async () => {
      const rows = [makePrompt({ id: "pr-1" }), makePrompt({ id: "pr-2" })];
      db.select.mockResolvedValueOnce(rows);
      const result = await promptRepo.getAll();
      expect(db.select).toHaveBeenCalledWith("SELECT * FROM prompts ORDER BY sort_order, name");
      expect(result).toEqual(rows);
    });
  });

  describe("getById", () => {
    it("returns prompt when found", async () => {
      const prompt = makePrompt();
      db.select.mockResolvedValueOnce([prompt]);
      const result = await promptRepo.getById("prompt-1");
      expect(db.select).toHaveBeenCalledWith("SELECT * FROM prompts WHERE id = $1", ["prompt-1"]);
      expect(result).toEqual(prompt);
    });

    it("returns undefined when not found", async () => {
      db.select.mockResolvedValueOnce([]);
      const result = await promptRepo.getById("missing");
      expect(result).toBeUndefined();
    });
  });

  describe("create", () => {
    it("inserts prompt with 5 parameters", async () => {
      await promptRepo.create({
        id: "pr-1", name: "Summarize", content: "Summarize this.", builtin: 0, sort_order: 1,
      });
      expect(db.execute).toHaveBeenCalledWith(
        expect.stringContaining("INSERT INTO prompts"),
        ["pr-1", "Summarize", "Summarize this.", 0, 1],
      );
    });
  });

  describe("update", () => {
    it("builds dynamic SET with updated_at", async () => {
      await promptRepo.update("pr-1", { name: "Updated", content: "New content" });
      const [sql, params] = db.execute.mock.calls[0];
      expect(sql).toContain("UPDATE prompts SET");
      expect(sql).toContain("name = $1");
      expect(sql).toContain("content = $2");
      expect(sql).toContain("updated_at = datetime('now')");
      expect(sql).toContain("WHERE id = $3");
      expect(params).toEqual(["Updated", "New content", "pr-1"]);
    });

    it("skips id and created_at fields", async () => {
      await promptRepo.update("pr-1", { id: "x", created_at: "x", name: "New" });
      const [sql] = db.execute.mock.calls[0];
      const setClause = sql.substring(sql.indexOf("SET"), sql.indexOf("WHERE"));
      expect(setClause).not.toContain("id =");
      expect(setClause).not.toContain("created_at =");
    });
  });

  describe("delete", () => {
    it("deletes with builtin = 0 guard", async () => {
      await promptRepo.delete("pr-1");
      expect(db.execute).toHaveBeenCalledWith(
        "DELETE FROM prompts WHERE id = $1 AND builtin = 0",
        ["pr-1"],
      );
    });
  });
});
