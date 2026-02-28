import { getDb } from "../index";
import type { Workspace } from "../types";

export const workspaceRepo = {
  async getAll(): Promise<Workspace[]> {
    const db = await getDb();
    return db.select("SELECT * FROM workspaces ORDER BY is_default DESC, created_at ASC");
  },

  async getById(id: string): Promise<Workspace | undefined> {
    const db = await getDb();
    const rows: Workspace[] = await db.select("SELECT * FROM workspaces WHERE id = $1", [id]);
    return rows[0];
  },

  async getByPath(path: string): Promise<Workspace | undefined> {
    const db = await getDb();
    const rows: Workspace[] = await db.select("SELECT * FROM workspaces WHERE path = $1", [path]);
    return rows[0];
  },

  async getDefault(): Promise<Workspace | undefined> {
    const db = await getDb();
    const rows: Workspace[] = await db.select("SELECT * FROM workspaces WHERE is_default = 1 LIMIT 1");
    return rows[0];
  },

  async create(ws: Omit<Workspace, "created_at">): Promise<void> {
    const db = await getDb();
    await db.execute(
      "INSERT INTO workspaces (id, name, path, is_default) VALUES ($1, $2, $3, $4)",
      [ws.id, ws.name, ws.path, ws.is_default],
    );
  },

  async delete(id: string): Promise<void> {
    const db = await getDb();
    await db.execute("DELETE FROM workspaces WHERE id = $1", [id]);
  },

  async updateName(id: string, name: string): Promise<void> {
    const db = await getDb();
    await db.execute("UPDATE workspaces SET name = $1 WHERE id = $2", [name, id]);
  },

  async setDefault(id: string): Promise<void> {
    const db = await getDb();
    // First unset all defaults, then set the new one
    await db.execute("UPDATE workspaces SET is_default = 0 WHERE is_default = 1");
    await db.execute("UPDATE workspaces SET is_default = 1 WHERE id = $1", [id]);
  },
};
