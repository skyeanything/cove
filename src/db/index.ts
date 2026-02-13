import Database from "@tauri-apps/plugin-sql";

let db: Database | null = null;

async function runMigrations(database: Database): Promise<void> {
  const migrations = [
    "ALTER TABLE messages ADD COLUMN parts TEXT",
    "ALTER TABLE conversations ADD COLUMN provider_type TEXT",
    "CREATE VIRTUAL TABLE IF NOT EXISTS message_fts USING fts5(body, conversation_id UNINDEXED, message_id UNINDEXED)",
  ];
  for (const sql of migrations) {
    try {
      await database.execute(sql);
    } catch {
      // Column/table already exists — ignore
    }
  }
  // 首次创建 message_fts 后从 messages 回填
  try {
    const rows = (await database.select("SELECT COUNT(*) as c FROM message_fts")) as { c: number }[];
    if (rows[0]?.c === 0) {
      await database.execute(
        `INSERT INTO message_fts(conversation_id, message_id, body)
         SELECT conversation_id, id, COALESCE(content,'') || ' ' || COALESCE(reasoning,'') FROM messages`,
      );
    }
  } catch {
    // FTS 不可用时忽略（如部分环境未编译 FTS5）
  }
}

export async function getDb(): Promise<Database> {
  if (!db) {
    db = await Database.load("sqlite:office-chat.db");
    await runMigrations(db);
  }
  return db;
}
