import { describe, it, expect, vi, beforeEach } from "vitest";
import { createMockDb, mockGetDb } from "../mock-db";

describe("createMockDb", () => {
  it("returns mock with default empty select", async () => {
    const db = createMockDb();
    const result = await db.select("SELECT * FROM messages");
    expect(result).toEqual([]);
  });

  it("returns mock with default execute result", async () => {
    const db = createMockDb();
    const result = await db.execute("INSERT INTO messages ...");
    expect(result).toEqual({ rowsAffected: 0 });
  });

  it("tracks call arguments", async () => {
    const db = createMockDb();
    await db.select("SELECT * FROM providers WHERE id = ?", ["p-1"]);
    expect(db.select).toHaveBeenCalledWith(
      "SELECT * FROM providers WHERE id = ?",
      ["p-1"],
    );
  });

  it("supports mockResolvedValueOnce for per-test overrides", async () => {
    const db = createMockDb();
    db.select.mockResolvedValueOnce([{ id: "msg-1", content: "hi" }]);

    const first = await db.select("SELECT * FROM messages");
    expect(first).toEqual([{ id: "msg-1", content: "hi" }]);

    const second = await db.select("SELECT * FROM messages");
    expect(second).toEqual([]);
  });

  it("accepts overrides in constructor", async () => {
    const db = createMockDb({
      execute: expect.any(Function) as never,
    });
    expect(db.select).toBeDefined();
  });
});

describe("mockGetDb", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("mocks @/db so dynamic import returns the mock database", async () => {
    const db = createMockDb();
    db.select.mockResolvedValueOnce([{ id: "p-1", name: "Test" }]);

    mockGetDb(db);

    const { getDb } = await import("@/db");
    const resolved = await getDb();
    const rows = await resolved.select("SELECT * FROM providers");

    expect(rows).toEqual([{ id: "p-1", name: "Test" }]);
    expect(db.select).toHaveBeenCalledWith("SELECT * FROM providers");
  });
});
