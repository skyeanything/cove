import { getDb } from "../index";
import type { Attachment } from "../types";

export const attachmentRepo = {
  async getById(id: string): Promise<Attachment | undefined> {
    const db = await getDb();
    const rows: Attachment[] = await db.select("SELECT * FROM attachments WHERE id = $1", [id]);
    return rows[0];
  },

  async getByMessage(messageId: string): Promise<Attachment[]> {
    const db = await getDb();
    return db.select("SELECT * FROM attachments WHERE message_id = $1", [messageId]);
  },

  async create(attachment: Omit<Attachment, "created_at">): Promise<void> {
    const db = await getDb();
    await db.execute(
      `INSERT INTO attachments (id, message_id, type, name, path, mime_type, size, content)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [attachment.id, attachment.message_id, attachment.type, attachment.name, attachment.path, attachment.mime_type, attachment.size, attachment.content],
    );
  },

  async delete(id: string): Promise<void> {
    const db = await getDb();
    await db.execute("DELETE FROM attachments WHERE id = $1", [id]);
  },

  async deleteByMessage(messageId: string): Promise<void> {
    const db = await getDb();
    await db.execute("DELETE FROM attachments WHERE message_id = $1", [messageId]);
  },
};
