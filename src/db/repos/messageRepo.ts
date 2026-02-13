import { getDb } from "../index";
import type { Message } from "../types";

export const messageRepo = {
  async getByConversation(conversationId: string, limit = 100, offset = 0): Promise<Message[]> {
    const db = await getDb();
    return db.select(
      "SELECT * FROM messages WHERE conversation_id = $1 ORDER BY created_at ASC LIMIT $2 OFFSET $3",
      [conversationId, limit, offset],
    );
  },

  async getById(id: string): Promise<Message | undefined> {
    const db = await getDb();
    const rows: Message[] = await db.select("SELECT * FROM messages WHERE id = $1", [id]);
    return rows[0];
  },

  async create(msg: Omit<Message, "created_at">): Promise<void> {
    const db = await getDb();
    await db.execute(
      `INSERT INTO messages (id, conversation_id, role, content, reasoning, parts, model, tokens_input, tokens_output, parent_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [msg.id, msg.conversation_id, msg.role, msg.content ?? null, msg.reasoning ?? null, msg.parts ?? null, msg.model ?? null, msg.tokens_input ?? null, msg.tokens_output ?? null, msg.parent_id ?? null],
    );
    await this.insertFts(db, msg.conversation_id, msg.id, (msg.content ?? "") + " " + (msg.reasoning ?? ""));
  },

  async update(id: string, data: Partial<Message>): Promise<void> {
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
      `UPDATE messages SET ${fields.join(", ")} WHERE id = $${idx}`,
      values,
    );
  },

  async delete(id: string): Promise<void> {
    const db = await getDb();
    await db.execute("DELETE FROM message_fts WHERE message_id = $1", [id]);
    await db.execute("DELETE FROM messages WHERE id = $1", [id]);
  },

  async deleteByConversation(conversationId: string): Promise<void> {
    const db = await getDb();
    await db.execute("DELETE FROM message_fts WHERE conversation_id = $1", [conversationId]);
    await db.execute("DELETE FROM messages WHERE conversation_id = $1", [conversationId]);
  },

  async deleteAfter(conversationId: string, createdAt: string): Promise<void> {
    const db = await getDb();
    await db.execute(
      "DELETE FROM message_fts WHERE message_id IN (SELECT id FROM messages WHERE conversation_id = $1 AND created_at >= $2)",
      [conversationId, createdAt],
    );
    await db.execute(
      "DELETE FROM messages WHERE conversation_id = $1 AND created_at >= $2",
      [conversationId, createdAt],
    );
  },

  async count(conversationId: string): Promise<number> {
    const db = await getDb();
    const rows: { count: number }[] = await db.select(
      "SELECT COUNT(*) as count FROM messages WHERE conversation_id = $1",
      [conversationId],
    );
    return rows[0]?.count ?? 0;
  },

  /** 全文搜索：使用 FTS5 索引，返回会话 id 及片段（用于 ⌘⇧F） */
  async searchContent(query: string): Promise<{ conversationId: string; snippet: string }[]> {
    const q = query.trim();
    if (!q) return [];
    const db = await getDb();
    const ftsQuery = q.replace(/"/g, '""').split(/\s+/).filter(Boolean).join(" ");
    if (!ftsQuery) return [];
    try {
      const rows = (await db.select(
        `SELECT conversation_id, snippet(message_fts, 1, '', '', '…', 64) as snippet
         FROM message_fts WHERE body MATCH $1 LIMIT 50`,
        [ftsQuery],
      )) as { conversation_id: string; snippet: string }[];
      return rows.map((r: { conversation_id: string; snippet: string }) => ({
        conversationId: r.conversation_id,
        snippet: (r.snippet || "").trim().slice(0, 120) + (r.snippet && r.snippet.length > 120 ? "…" : ""),
      }));
    } catch {
      return [];
    }
  },

  async insertFts(
    db: Awaited<ReturnType<typeof getDb>>,
    conversationId: string,
    messageId: string,
    body: string,
  ): Promise<void> {
    try {
      await db.execute(
        "INSERT INTO message_fts(conversation_id, message_id, body) VALUES ($1, $2, $3)",
        [conversationId, messageId, body.trim().slice(0, 10000)],
      );
    } catch {
      // FTS 不可用时忽略
    }
  },
};
