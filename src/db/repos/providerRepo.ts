import { getDb } from "../index";
import type { Provider } from "../types";

export const providerRepo = {
  async getAll(): Promise<Provider[]> {
    const db = await getDb();
    return db.select("SELECT * FROM providers ORDER BY name");
  },

  async getById(id: string): Promise<Provider | undefined> {
    const db = await getDb();
    const rows: Provider[] = await db.select("SELECT * FROM providers WHERE id = $1", [id]);
    return rows[0];
  },

  async create(provider: Omit<Provider, "created_at" | "updated_at">): Promise<void> {
    const db = await getDb();
    await db.execute(
      `INSERT INTO providers (id, name, type, api_key, base_url, enabled, config)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [provider.id, provider.name, provider.type, provider.api_key ?? null, provider.base_url ?? null, provider.enabled, provider.config ?? null],
    );
  },

  async update(id: string, data: Partial<Provider>): Promise<void> {
    const db = await getDb();
    const fields: string[] = [];
    const values: unknown[] = [];
    let idx = 1;

    for (const [key, value] of Object.entries(data)) {
      if (key === "id" || key === "created_at") continue;
      if (value === undefined) continue; // skip undefined — use null to clear
      fields.push(`${key} = $${idx}`);
      values.push(value);
      idx++;
    }

    if (fields.length === 0) {
      // Nothing to update besides timestamp
      fields.push(`updated_at = datetime('now')`);
      values.push(id);
      await db.execute(`UPDATE providers SET ${fields.join(", ")} WHERE id = $${idx}`, values);
      return;
    }

    fields.push(`updated_at = datetime('now')`);
    values.push(id);

    await db.execute(
      `UPDATE providers SET ${fields.join(", ")} WHERE id = $${idx}`,
      values,
    );
  },

  async delete(id: string): Promise<void> {
    const db = await getDb();
    await db.execute("DELETE FROM providers WHERE id = $1", [id]);
  },
};
