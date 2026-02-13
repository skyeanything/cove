import { getDb } from "../index";
import type { Prompt } from "../types";

export const promptRepo = {
  async getAll(): Promise<Prompt[]> {
    const db = await getDb();
    return db.select("SELECT * FROM prompts ORDER BY sort_order, name");
  },

  async getById(id: string): Promise<Prompt | undefined> {
    const db = await getDb();
    const rows: Prompt[] = await db.select("SELECT * FROM prompts WHERE id = $1", [id]);
    return rows[0];
  },

  async create(prompt: Omit<Prompt, "created_at" | "updated_at">): Promise<void> {
    const db = await getDb();
    await db.execute(
      `INSERT INTO prompts (id, name, content, builtin, sort_order)
       VALUES ($1, $2, $3, $4, $5)`,
      [prompt.id, prompt.name, prompt.content, prompt.builtin, prompt.sort_order],
    );
  },

  async update(id: string, data: Partial<Prompt>): Promise<void> {
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
      `UPDATE prompts SET ${fields.join(", ")} WHERE id = $${idx}`,
      values,
    );
  },

  async delete(id: string): Promise<void> {
    const db = await getDb();
    await db.execute("DELETE FROM prompts WHERE id = $1 AND builtin = 0", [id]);
  },
};
