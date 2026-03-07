import Database from "@tauri-apps/plugin-sql";

let db: Database | null = null;

async function runMigrations(database: Database): Promise<void> {
  const migrations = [
    "ALTER TABLE messages ADD COLUMN parts TEXT",
    "ALTER TABLE conversations ADD COLUMN provider_type TEXT",
    "CREATE VIRTUAL TABLE IF NOT EXISTS message_fts USING fts5(body, conversation_id UNINDEXED, message_id UNINDEXED)",
    "ALTER TABLE conversations ADD COLUMN summary_up_to TEXT",
    "ALTER TABLE attachments ADD COLUMN workspace_path TEXT",
    "ALTER TABLE attachments ADD COLUMN parsed_content TEXT",
    "ALTER TABLE attachments ADD COLUMN parsed_summary TEXT",
    `CREATE TABLE IF NOT EXISTS sub_agents (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT DEFAULT '',
      icon TEXT,
      system_prompt TEXT DEFAULT '',
      skill_names TEXT DEFAULT '[]',
      tool_ids TEXT DEFAULT '[]',
      enabled INTEGER DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )`,
    // SOUL: conversation summaries for archive retrieval
    `CREATE TABLE IF NOT EXISTS conversation_summaries (
      id TEXT PRIMARY KEY,
      conversation_id TEXT NOT NULL UNIQUE,
      summary TEXT NOT NULL,
      keywords TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
    )`,
    "CREATE VIRTUAL TABLE IF NOT EXISTS conversation_summaries_fts USING fts5(summary, keywords, conversation_id UNINDEXED)",
    "ALTER TABLE sub_agents ADD COLUMN connector_ids TEXT DEFAULT '[]'",
    "ALTER TABLE sub_agents ADD COLUMN created_by TEXT DEFAULT 'User'",
    "ALTER TABLE sub_agents ADD COLUMN model_id TEXT",
    "ALTER TABLE sub_agents ADD COLUMN provider_id TEXT",
  ];
  for (const sql of migrations) {
    try {
      await database.execute(sql);
    } catch {
      // Column/table already exists — ignore
    }
  }
  // Deduplicate legacy conversation_summaries (keep newest per conversation_id)
  // then enforce uniqueness durably via index for tables created without UNIQUE
  try {
    await database.execute(
      `DELETE FROM conversation_summaries WHERE id NOT IN (
        SELECT id FROM conversation_summaries
        GROUP BY conversation_id
        HAVING MAX(created_at)
      )`,
    );
    await database.execute(
      "CREATE UNIQUE INDEX IF NOT EXISTS idx_summaries_conversation_id ON conversation_summaries(conversation_id)",
    );
  } catch {
    // Table may not exist yet or no duplicates — ignore
  }
  // 首次创建 message_fts 后从 messages 回填
  try {
    const rows = (await database.select(
      "SELECT COUNT(*) as c FROM message_fts",
    )) as { c: number }[];
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
