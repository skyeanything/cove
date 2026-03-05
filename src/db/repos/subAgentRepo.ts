import { getDb } from "../index";
import type { SubAgentDef } from "../types";

export const subAgentRepo = {
  async getAll(): Promise<SubAgentDef[]> {
    const db = await getDb();
    return db.select("SELECT * FROM sub_agents ORDER BY updated_at DESC");
  },

  async getById(id: string): Promise<SubAgentDef | undefined> {
    const db = await getDb();
    const rows: SubAgentDef[] = await db.select("SELECT * FROM sub_agents WHERE id = $1", [id]);
    return rows[0];
  },

  async create(agent: Omit<SubAgentDef, "created_at" | "updated_at">): Promise<void> {
    const db = await getDb();
    await db.execute(
      `INSERT INTO sub_agents (id, name, description, icon, system_prompt, skill_names, tool_ids, enabled)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [agent.id, agent.name, agent.description, agent.icon ?? null, agent.system_prompt, agent.skill_names, agent.tool_ids, agent.enabled],
    );
  },

  async update(id: string, data: Partial<SubAgentDef>): Promise<void> {
    const ALLOWED_COLUMNS = [
      "name", "description", "icon", "system_prompt",
      "skill_names", "tool_ids", "enabled"
    ] as const;

    const db = await getDb();
    const fields: string[] = [];
    const values: unknown[] = [];
    let idx = 1;

    for (const [key, value] of Object.entries(data)) {
      if (key === "id" || key === "created_at") continue;
      if (!ALLOWED_COLUMNS.includes(key as typeof ALLOWED_COLUMNS[number])) continue;
      if (value === undefined) continue;
      fields.push(`${key} = $${idx}`);
      values.push(value);
      idx++;
    }

    if (fields.length === 0) return;

    fields.push(`updated_at = datetime('now')`);
    values.push(id);

    await db.execute(
      `UPDATE sub_agents SET ${fields.join(", ")} WHERE id = $${idx}`,
      values,
    );
  },

  async delete(id: string): Promise<void> {
    const db = await getDb();
    await db.execute("DELETE FROM sub_agents WHERE id = $1", [id]);
  },
};
