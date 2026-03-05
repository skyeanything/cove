import { getDb } from "../index";
import type { ConversationSummary } from "../types";

export interface SummarySearchResult {
  conversation_id: string;
  summary: string;
  keywords: string | null;
  created_at: string;
  rank: number;
}

/** Normalize query for FTS5 MATCH: escape quotes, collapse whitespace. */
function normalizeFtsQuery(query: string): string {
  const q = query.trim();
  if (!q) return "";
  return q.replace(/"/g, '""').split(/\s+/).filter(Boolean).join(" ");
}

export const summaryRepo = {
  async create(
    id: string,
    conversationId: string,
    summary: string,
    keywords?: string,
  ): Promise<void> {
    const db = await getDb();
    await db.execute(
      `INSERT OR REPLACE INTO conversation_summaries (id, conversation_id, summary, keywords)
       VALUES ($1, $2, $3, $4)`,
      [id, conversationId, summary, keywords ?? null],
    );
    // Sync FTS: delete stale entry then insert fresh
    await db.execute(
      "DELETE FROM conversation_summaries_fts WHERE conversation_id = $1",
      [conversationId],
    );
    await db.execute(
      `INSERT INTO conversation_summaries_fts (summary, keywords, conversation_id)
       VALUES ($1, $2, $3)`,
      [summary, keywords ?? "", conversationId],
    );
  },

  async getByConversation(
    conversationId: string,
  ): Promise<ConversationSummary | undefined> {
    const db = await getDb();
    const rows: ConversationSummary[] = await db.select(
      "SELECT * FROM conversation_summaries WHERE conversation_id = $1 LIMIT 1",
      [conversationId],
    );
    return rows[0];
  },

  async searchSummaries(
    query: string,
    limit = 5,
  ): Promise<SummarySearchResult[]> {
    const ftsQuery = normalizeFtsQuery(query);
    if (!ftsQuery) return [];
    const db = await getDb();
    try {
      return await db.select(
        `SELECT f.conversation_id, f.summary, f.keywords, f.rank,
                s.created_at
         FROM conversation_summaries_fts f
         JOIN conversation_summaries s ON s.conversation_id = f.conversation_id
         WHERE conversation_summaries_fts MATCH $1
         ORDER BY f.rank
         LIMIT $2`,
        [ftsQuery, limit],
      );
    } catch {
      return [];
    }
  },

  async searchMessages(
    query: string,
    conversationId?: string,
    limit = 20,
  ): Promise<{ conversation_id: string; message_id: string; body: string }[]> {
    const db = await getDb();
    if (conversationId) {
      return db.select(
        `SELECT conversation_id, message_id, body
         FROM message_fts
         WHERE message_fts MATCH $1 AND conversation_id = $2
         ORDER BY rank
         LIMIT $3`,
        [query, conversationId, limit],
      );
    }
    return db.select(
      `SELECT conversation_id, message_id, body
       FROM message_fts
       WHERE message_fts MATCH $1
       ORDER BY rank
       LIMIT $2`,
      [query, limit],
    );
  },

  async deleteByConversation(conversationId: string): Promise<void> {
    const db = await getDb();
    // Clean FTS first, then base table
    await db.execute(
      "DELETE FROM conversation_summaries_fts WHERE conversation_id = $1",
      [conversationId],
    );
    await db.execute(
      "DELETE FROM conversation_summaries WHERE conversation_id = $1",
      [conversationId],
    );
  },
};
