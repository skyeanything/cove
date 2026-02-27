import { describe, it, expect, vi, beforeEach } from "vitest";
import { createMockDb, mockGetDb, type MockDatabase, makeProvider } from "@/test-utils";

let db: MockDatabase;
let providerRepo: (typeof import("@/db/repos/providerRepo"))["providerRepo"];

beforeEach(async () => {
  vi.resetModules();
  db = createMockDb();
  mockGetDb(db);
  const mod = await import("@/db/repos/providerRepo");
  providerRepo = mod.providerRepo;
});

describe("providerRepo", () => {
  describe("getAll", () => {
    it("returns all providers ordered by name", async () => {
      const rows = [makeProvider({ id: "p-1" }), makeProvider({ id: "p-2" })];
      db.select.mockResolvedValueOnce(rows);
      const result = await providerRepo.getAll();
      expect(db.select).toHaveBeenCalledWith("SELECT * FROM providers ORDER BY name");
      expect(result).toEqual(rows);
    });
  });

  describe("getById", () => {
    it("returns provider when found", async () => {
      const provider = makeProvider();
      db.select.mockResolvedValueOnce([provider]);
      const result = await providerRepo.getById("provider-1");
      expect(db.select).toHaveBeenCalledWith("SELECT * FROM providers WHERE id = $1", ["provider-1"]);
      expect(result).toEqual(provider);
    });

    it("returns undefined when not found", async () => {
      db.select.mockResolvedValueOnce([]);
      const result = await providerRepo.getById("missing");
      expect(result).toBeUndefined();
    });
  });

  describe("create", () => {
    it("inserts provider with all fields", async () => {
      await providerRepo.create({
        id: "p-1", name: "OpenAI", type: "openai",
        api_key: "sk-key", base_url: "https://api.openai.com/v1", enabled: 1, config: '{}',
      });
      expect(db.execute).toHaveBeenCalledWith(
        expect.stringContaining("INSERT INTO providers"),
        ["p-1", "OpenAI", "openai", "sk-key", "https://api.openai.com/v1", 1, "{}"],
      );
    });

    it("coerces undefined optional fields to null", async () => {
      await providerRepo.create({
        id: "p-2", name: "Minimal", type: "custom", enabled: 1,
      });
      expect(db.execute).toHaveBeenCalledWith(
        expect.stringContaining("INSERT INTO providers"),
        ["p-2", "Minimal", "custom", null, null, 1, null],
      );
    });
  });

  describe("update", () => {
    it("builds dynamic SET with updated_at", async () => {
      await providerRepo.update("p-1", { name: "Renamed", enabled: 0 });
      const [sql, params] = db.execute.mock.calls[0];
      expect(sql).toContain("UPDATE providers SET");
      expect(sql).toContain("name = $1");
      expect(sql).toContain("enabled = $2");
      expect(sql).toContain("updated_at = datetime('now')");
      expect(sql).toContain("WHERE id = $3");
      expect(params).toEqual(["Renamed", 0, "p-1"]);
    });

    it("skips id and created_at fields", async () => {
      await providerRepo.update("p-1", { id: "ignored", created_at: "ignored", name: "New" });
      const [sql, params] = db.execute.mock.calls[0];
      const setClause = sql.substring(sql.indexOf("SET"), sql.indexOf("WHERE"));
      expect(setClause).not.toContain("id =");
      expect(setClause).not.toContain("created_at =");
      expect(params).toEqual(["New", "p-1"]);
    });

    it("handles empty update (only timestamp)", async () => {
      await providerRepo.update("p-1", {});
      const [sql, params] = db.execute.mock.calls[0];
      expect(sql).toContain("updated_at = datetime('now')");
      expect(sql).toContain("WHERE id = $1");
      expect(params).toEqual(["p-1"]);
    });
  });

  describe("delete", () => {
    it("deletes provider by id", async () => {
      await providerRepo.delete("p-1");
      expect(db.execute).toHaveBeenCalledWith("DELETE FROM providers WHERE id = $1", ["p-1"]);
    });
  });
});
