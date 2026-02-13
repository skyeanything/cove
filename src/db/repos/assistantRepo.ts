import { getDb } from "../index";
import type { Assistant } from "../types";

export const assistantRepo = {
  async getAll(): Promise<Assistant[]> {
    const db = await getDb();
    return db.select("SELECT * FROM assistants ORDER BY sort_order, name");
  },

  async getById(id: string): Promise<Assistant | undefined> {
    const db = await getDb();
    const rows: Assistant[] = await db.select("SELECT * FROM assistants WHERE id = $1", [id]);
    return rows[0];
  },

  async create(assistant: Omit<Assistant, "created_at" | "updated_at">): Promise<void> {
    const db = await getDb();
    await db.execute(
      `INSERT INTO assistants (id, name, icon, model, provider, system_instruction, temperature, top_p, max_tokens, frequency_penalty, presence_penalty, web_search_enabled, artifacts_enabled, tools_enabled, sort_order)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)`,
      [
        assistant.id, assistant.name, assistant.icon, assistant.model, assistant.provider,
        assistant.system_instruction, assistant.temperature, assistant.top_p, assistant.max_tokens,
        assistant.frequency_penalty, assistant.presence_penalty, assistant.web_search_enabled,
        assistant.artifacts_enabled, assistant.tools_enabled, assistant.sort_order,
      ],
    );
  },

  async update(id: string, data: Partial<Assistant>): Promise<void> {
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

    fields.push(`updated_at = datetime('now')`);
    values.push(id);

    await db.execute(
      `UPDATE assistants SET ${fields.join(", ")} WHERE id = $${idx}`,
      values,
    );
  },

  async delete(id: string): Promise<void> {
    const db = await getDb();
    await db.execute("DELETE FROM assistants WHERE id = $1", [id]);
  },
};
