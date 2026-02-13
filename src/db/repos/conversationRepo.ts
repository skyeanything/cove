import { getDb } from "../index";
import type { Conversation } from "../types";

export const conversationRepo = {
  async getAll(): Promise<Conversation[]> {
    const db = await getDb();
    return db.select("SELECT * FROM conversations ORDER BY pinned DESC, updated_at DESC");
  },

  async getById(id: string): Promise<Conversation | undefined> {
    const db = await getDb();
    const rows: Conversation[] = await db.select("SELECT * FROM conversations WHERE id = $1", [id]);
    return rows[0];
  },

  async search(query: string): Promise<Conversation[]> {
    const db = await getDb();
    return db.select(
      "SELECT * FROM conversations WHERE title LIKE $1 ORDER BY updated_at DESC",
      [`%${query}%`],
    );
  },

  async getGrouped(): Promise<Record<string, Conversation[]>> {
    const all = await this.getAll();
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const yesterday = new Date(today.getTime() - 86400000);
    const past7 = new Date(today.getTime() - 7 * 86400000);

    const groups: Record<string, Conversation[]> = {};

    for (const conv of all) {
      const d = new Date(conv.updated_at);
      let group: string;
      if (d >= today) group = "Today";
      else if (d >= yesterday) group = "Yesterday";
      else if (d >= past7) group = "Past 7 days";
      else group = "Earlier";

      if (!groups[group]) groups[group] = [];
      groups[group]!.push(conv);
    }

    return groups;
  },

  async create(conv: Omit<Conversation, "created_at" | "updated_at">): Promise<void> {
    const db = await getDb();
    await db.execute(
      `INSERT INTO conversations (id, assistant_id, title, pinned, model_override, system_instruction_override, temperature_override, provider_type, workspace_path)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [conv.id, conv.assistant_id, conv.title ?? null, conv.pinned, conv.model_override ?? null, conv.system_instruction_override ?? null, conv.temperature_override ?? null, conv.provider_type ?? null, conv.workspace_path ?? null],
    );
  },

  async update(id: string, data: Partial<Conversation>): Promise<void> {
    const db = await getDb();
    const fields: string[] = [];
    const values: unknown[] = [];
    let idx = 1;

    for (const [key, value] of Object.entries(data)) {
      if (key === "id" || key === "created_at") continue;
      if (value === undefined) continue;
      fields.push(`${key} = $${idx}`);
      values.push(value);
      idx++;
    }

    fields.push(`updated_at = datetime('now')`);
    values.push(id);
    const idPlaceholder = values.length;

    await db.execute(
      `UPDATE conversations SET ${fields.join(", ")} WHERE id = $${idPlaceholder}`,
      values,
    );
  },

  async delete(id: string): Promise<void> {
    const db = await getDb();
    await db.execute("DELETE FROM conversations WHERE id = $1", [id]);
  },

  /** 仅更新 pinned，不修改 updated_at，便于取消置顶后会话回到原时间位置 */
  async setPinned(id: string, pinned: number): Promise<void> {
    const db = await getDb();
    await db.execute("UPDATE conversations SET pinned = $1 WHERE id = $2", [pinned, id]);
  },
};
