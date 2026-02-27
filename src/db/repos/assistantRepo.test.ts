import { describe, it, expect, vi, beforeEach } from "vitest";
import { createMockDb, mockGetDb, type MockDatabase, makeAssistant } from "@/test-utils";

let db: MockDatabase;
let assistantRepo: (typeof import("@/db/repos/assistantRepo"))["assistantRepo"];

beforeEach(async () => {
  vi.resetModules();
  db = createMockDb();
  mockGetDb(db);
  const mod = await import("@/db/repos/assistantRepo");
  assistantRepo = mod.assistantRepo;
});

describe("assistantRepo", () => {
  describe("getAll", () => {
    it("returns all assistants ordered by sort_order, name", async () => {
      const rows = [makeAssistant({ id: "a-1" }), makeAssistant({ id: "a-2" })];
      db.select.mockResolvedValueOnce(rows);
      const result = await assistantRepo.getAll();
      expect(db.select).toHaveBeenCalledWith("SELECT * FROM assistants ORDER BY sort_order, name");
      expect(result).toEqual(rows);
    });
  });

  describe("getById", () => {
    it("returns assistant when found", async () => {
      const assistant = makeAssistant();
      db.select.mockResolvedValueOnce([assistant]);
      const result = await assistantRepo.getById("assistant-1");
      expect(db.select).toHaveBeenCalledWith("SELECT * FROM assistants WHERE id = $1", ["assistant-1"]);
      expect(result).toEqual(assistant);
    });

    it("returns undefined when not found", async () => {
      db.select.mockResolvedValueOnce([]);
      const result = await assistantRepo.getById("missing");
      expect(result).toBeUndefined();
    });
  });

  describe("create", () => {
    it("inserts assistant with 15 parameters", async () => {
      const a = makeAssistant({ id: "a-1", name: "GPT Agent" });
      const { created_at: _, updated_at: __, ...input } = a;
      await assistantRepo.create(input);
      expect(db.execute).toHaveBeenCalledWith(
        expect.stringContaining("INSERT INTO assistants"),
        [
          "a-1", "GPT Agent", a.icon, a.model, a.provider,
          a.system_instruction, a.temperature, a.top_p, a.max_tokens,
          a.frequency_penalty, a.presence_penalty, a.web_search_enabled,
          a.artifacts_enabled, a.tools_enabled, a.sort_order,
        ],
      );
    });
  });

  describe("update", () => {
    it("builds dynamic SET with updated_at", async () => {
      await assistantRepo.update("a-1", { name: "Renamed", temperature: 0.5 });
      const [sql, params] = db.execute.mock.calls[0];
      expect(sql).toContain("UPDATE assistants SET");
      expect(sql).toContain("name = $1");
      expect(sql).toContain("temperature = $2");
      expect(sql).toContain("updated_at = datetime('now')");
      expect(sql).toContain("WHERE id = $3");
      expect(params).toEqual(["Renamed", 0.5, "a-1"]);
    });

    it("skips id and created_at fields", async () => {
      await assistantRepo.update("a-1", { id: "x", created_at: "x", name: "New" });
      const [sql] = db.execute.mock.calls[0];
      const setClause = sql.substring(sql.indexOf("SET"), sql.indexOf("WHERE"));
      expect(setClause).not.toContain("id =");
      expect(setClause).not.toContain("created_at =");
    });
  });

  describe("delete", () => {
    it("deletes assistant by id", async () => {
      await assistantRepo.delete("a-1");
      expect(db.execute).toHaveBeenCalledWith("DELETE FROM assistants WHERE id = $1", ["a-1"]);
    });
  });
});
