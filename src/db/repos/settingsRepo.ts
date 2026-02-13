import { getDb } from "../index";

export const settingsRepo = {
  async get(key: string): Promise<string | undefined> {
    const db = await getDb();
    const rows: { value: string }[] = await db.select(
      "SELECT value FROM settings WHERE key = $1",
      [key],
    );
    return rows[0]?.value;
  },

  async set(key: string, value: string): Promise<void> {
    const db = await getDb();
    await db.execute(
      `INSERT INTO settings (key, value) VALUES ($1, $2)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
      [key, value],
    );
  },

  async delete(key: string): Promise<void> {
    const db = await getDb();
    await db.execute("DELETE FROM settings WHERE key = $1", [key]);
  },

  async getAll(): Promise<Record<string, string>> {
    const db = await getDb();
    const rows: { key: string; value: string }[] = await db.select("SELECT * FROM settings");
    return Object.fromEntries(rows.map((r) => [r.key, r.value]));
  },
};
