import { getDb } from "../index";
import type { McpServer } from "../types";

export const mcpServerRepo = {
  async getAll(): Promise<McpServer[]> {
    const db = await getDb();
    return db.select("SELECT * FROM mcp_servers ORDER BY name");
  },

  async getById(id: string): Promise<McpServer | undefined> {
    const db = await getDb();
    const rows: McpServer[] = await db.select("SELECT * FROM mcp_servers WHERE id = $1", [id]);
    return rows[0];
  },

  async create(server: Omit<McpServer, "created_at">): Promise<void> {
    const db = await getDb();
    await db.execute(
      `INSERT INTO mcp_servers (id, name, type, command, args, env, url, auto_run, long_running, enabled)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [server.id, server.name, server.type, server.command, server.args, server.env, server.url, server.auto_run, server.long_running, server.enabled],
    );
  },

  async update(id: string, data: Partial<McpServer>): Promise<void> {
    const db = await getDb();
    const fields: string[] = [];
    const values: unknown[] = [];
    let idx = 1;

    for (const [key, value] of Object.entries(data)) {
      if (key === "id" || key === "created_at") continue;
      fields.push(`${key} = $${idx}`);
      values.push(value);
      idx++;
    }

    values.push(id);

    await db.execute(
      `UPDATE mcp_servers SET ${fields.join(", ")} WHERE id = $${idx}`,
      values,
    );
  },

  async delete(id: string): Promise<void> {
    const db = await getDb();
    await db.execute("DELETE FROM mcp_servers WHERE id = $1", [id]);
  },
};
