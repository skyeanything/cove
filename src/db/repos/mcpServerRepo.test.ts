import { describe, it, expect, vi, beforeEach } from "vitest";
import { createMockDb, mockGetDb, type MockDatabase, makeMcpServer } from "@/test-utils";

let db: MockDatabase;
let mcpServerRepo: (typeof import("@/db/repos/mcpServerRepo"))["mcpServerRepo"];

beforeEach(async () => {
  vi.resetModules();
  db = createMockDb();
  mockGetDb(db);
  const mod = await import("@/db/repos/mcpServerRepo");
  mcpServerRepo = mod.mcpServerRepo;
});

describe("mcpServerRepo", () => {
  describe("getAll", () => {
    it("returns all servers ordered by name", async () => {
      const rows = [makeMcpServer({ id: "m-1" }), makeMcpServer({ id: "m-2" })];
      db.select.mockResolvedValueOnce(rows);
      const result = await mcpServerRepo.getAll();
      expect(db.select).toHaveBeenCalledWith("SELECT * FROM mcp_servers ORDER BY name");
      expect(result).toEqual(rows);
    });
  });

  describe("getById", () => {
    it("returns server when found", async () => {
      const server = makeMcpServer();
      db.select.mockResolvedValueOnce([server]);
      const result = await mcpServerRepo.getById("mcp-1");
      expect(db.select).toHaveBeenCalledWith("SELECT * FROM mcp_servers WHERE id = $1", ["mcp-1"]);
      expect(result).toEqual(server);
    });

    it("returns undefined when not found", async () => {
      db.select.mockResolvedValueOnce([]);
      const result = await mcpServerRepo.getById("missing");
      expect(result).toBeUndefined();
    });
  });

  describe("create", () => {
    it("inserts server with 10 parameters", async () => {
      const s = makeMcpServer({ id: "m-1", name: "My Server" });
      const { created_at: _, ...input } = s;
      await mcpServerRepo.create(input);
      expect(db.execute).toHaveBeenCalledWith(
        expect.stringContaining("INSERT INTO mcp_servers"),
        [s.id, s.name, s.type, s.command, s.args, s.env, s.url, s.auto_run, s.long_running, s.enabled],
      );
    });
  });

  describe("update", () => {
    it("builds dynamic SET without updated_at", async () => {
      await mcpServerRepo.update("m-1", { name: "Renamed", enabled: 0 });
      const [sql, params] = db.execute.mock.calls[0];
      expect(sql).toContain("UPDATE mcp_servers SET");
      expect(sql).toContain("name = $1");
      expect(sql).toContain("enabled = $2");
      expect(sql).not.toContain("updated_at");
      expect(sql).toContain("WHERE id = $3");
      expect(params).toEqual(["Renamed", 0, "m-1"]);
    });

    it("skips id and created_at fields", async () => {
      await mcpServerRepo.update("m-1", { id: "x", created_at: "x", name: "New" });
      const [sql] = db.execute.mock.calls[0];
      const setClause = sql.substring(sql.indexOf("SET"), sql.indexOf("WHERE"));
      expect(setClause).not.toContain("id =");
      expect(setClause).not.toContain("created_at =");
    });
  });

  describe("delete", () => {
    it("deletes server by id", async () => {
      await mcpServerRepo.delete("m-1");
      expect(db.execute).toHaveBeenCalledWith("DELETE FROM mcp_servers WHERE id = $1", ["m-1"]);
    });
  });
});
