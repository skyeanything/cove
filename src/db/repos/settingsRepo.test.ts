import { describe, it, expect, vi, beforeEach } from "vitest";
import { createMockDb, mockGetDb, type MockDatabase } from "@/test-utils";

let db: MockDatabase;
let settingsRepo: (typeof import("@/db/repos/settingsRepo"))["settingsRepo"];

beforeEach(async () => {
  vi.resetModules();
  db = createMockDb();
  mockGetDb(db);
  const mod = await import("@/db/repos/settingsRepo");
  settingsRepo = mod.settingsRepo;
});

describe("settingsRepo", () => {
  describe("get", () => {
    it("returns value when key exists", async () => {
      db.select.mockResolvedValueOnce([{ value: "dark" }]);
      const result = await settingsRepo.get("theme");
      expect(db.select).toHaveBeenCalledWith("SELECT value FROM settings WHERE key = $1", ["theme"]);
      expect(result).toBe("dark");
    });

    it("returns undefined when key not found", async () => {
      db.select.mockResolvedValueOnce([]);
      const result = await settingsRepo.get("missing");
      expect(result).toBeUndefined();
    });
  });

  describe("set", () => {
    it("upserts with ON CONFLICT", async () => {
      await settingsRepo.set("theme", "dark");
      const [sql, params] = db.execute.mock.calls[0];
      expect(sql).toContain("INSERT INTO settings (key, value) VALUES ($1, $2)");
      expect(sql).toContain("ON CONFLICT(key) DO UPDATE SET value = excluded.value");
      expect(params).toEqual(["theme", "dark"]);
    });
  });

  describe("delete", () => {
    it("deletes setting by key", async () => {
      await settingsRepo.delete("theme");
      expect(db.execute).toHaveBeenCalledWith("DELETE FROM settings WHERE key = $1", ["theme"]);
    });
  });

  describe("getAll", () => {
    it("returns Record<string,string> from all rows", async () => {
      db.select.mockResolvedValueOnce([
        { key: "theme", value: "dark" },
        { key: "language", value: "en" },
      ]);
      const result = await settingsRepo.getAll();
      expect(db.select).toHaveBeenCalledWith("SELECT * FROM settings");
      expect(result).toEqual({ theme: "dark", language: "en" });
    });

    it("returns empty object when no settings", async () => {
      db.select.mockResolvedValueOnce([]);
      const result = await settingsRepo.getAll();
      expect(result).toEqual({});
    });
  });
});
