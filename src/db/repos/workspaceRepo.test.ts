import { describe, it, expect, vi, beforeEach } from "vitest";
import { createMockDb, mockGetDb, type MockDatabase, makeWorkspace } from "@/test-utils";

let db: MockDatabase;
let workspaceRepo: (typeof import("@/db/repos/workspaceRepo"))["workspaceRepo"];

beforeEach(async () => {
  vi.resetModules();
  db = createMockDb();
  mockGetDb(db);
  const mod = await import("@/db/repos/workspaceRepo");
  workspaceRepo = mod.workspaceRepo;
});

describe("workspaceRepo", () => {
  describe("getAll", () => {
    it("returns workspaces ordered by is_default DESC, created_at ASC", async () => {
      const rows = [makeWorkspace({ id: "ws-1" }), makeWorkspace({ id: "ws-2" })];
      db.select.mockResolvedValueOnce(rows);
      const result = await workspaceRepo.getAll();
      expect(db.select).toHaveBeenCalledWith(
        "SELECT * FROM workspaces ORDER BY is_default DESC, created_at ASC",
      );
      expect(result).toEqual(rows);
    });
  });

  describe("getById", () => {
    it("returns workspace when found", async () => {
      const ws = makeWorkspace();
      db.select.mockResolvedValueOnce([ws]);
      const result = await workspaceRepo.getById("ws-1");
      expect(db.select).toHaveBeenCalledWith("SELECT * FROM workspaces WHERE id = $1", ["ws-1"]);
      expect(result).toEqual(ws);
    });

    it("returns undefined when not found", async () => {
      db.select.mockResolvedValueOnce([]);
      const result = await workspaceRepo.getById("missing");
      expect(result).toBeUndefined();
    });
  });

  describe("getByPath", () => {
    it("returns workspace matching path", async () => {
      const ws = makeWorkspace({ path: "/Users/test/project" });
      db.select.mockResolvedValueOnce([ws]);
      const result = await workspaceRepo.getByPath("/Users/test/project");
      expect(db.select).toHaveBeenCalledWith(
        "SELECT * FROM workspaces WHERE path = $1",
        ["/Users/test/project"],
      );
      expect(result).toEqual(ws);
    });

    it("returns undefined when path not found", async () => {
      db.select.mockResolvedValueOnce([]);
      const result = await workspaceRepo.getByPath("/nonexistent");
      expect(result).toBeUndefined();
    });
  });

  describe("getDefault", () => {
    it("returns default workspace", async () => {
      const ws = makeWorkspace({ is_default: 1 });
      db.select.mockResolvedValueOnce([ws]);
      const result = await workspaceRepo.getDefault();
      expect(db.select).toHaveBeenCalledWith(
        "SELECT * FROM workspaces WHERE is_default = 1 LIMIT 1",
      );
      expect(result).toEqual(ws);
    });

    it("returns undefined when no default exists", async () => {
      db.select.mockResolvedValueOnce([]);
      const result = await workspaceRepo.getDefault();
      expect(result).toBeUndefined();
    });
  });

  describe("create", () => {
    it("inserts workspace with 4 parameters", async () => {
      await workspaceRepo.create({ id: "ws-1", name: "My Project", path: "/tmp/project", is_default: 0 });
      expect(db.execute).toHaveBeenCalledWith(
        "INSERT INTO workspaces (id, name, path, is_default) VALUES ($1, $2, $3, $4)",
        ["ws-1", "My Project", "/tmp/project", 0],
      );
    });
  });

  describe("delete", () => {
    it("deletes workspace by id", async () => {
      await workspaceRepo.delete("ws-1");
      expect(db.execute).toHaveBeenCalledWith("DELETE FROM workspaces WHERE id = $1", ["ws-1"]);
    });
  });
});
