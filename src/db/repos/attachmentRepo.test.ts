import { describe, it, expect, vi, beforeEach } from "vitest";
import { createMockDb, mockGetDb, type MockDatabase, makeAttachment } from "@/test-utils";

let db: MockDatabase;
let attachmentRepo: (typeof import("@/db/repos/attachmentRepo"))["attachmentRepo"];

beforeEach(async () => {
  vi.resetModules();
  db = createMockDb();
  mockGetDb(db);
  const mod = await import("@/db/repos/attachmentRepo");
  attachmentRepo = mod.attachmentRepo;
});

describe("attachmentRepo", () => {
  describe("getById", () => {
    it("returns attachment when found", async () => {
      const att = makeAttachment();
      db.select.mockResolvedValueOnce([att]);
      const result = await attachmentRepo.getById("attach-1");
      expect(db.select).toHaveBeenCalledWith("SELECT * FROM attachments WHERE id = $1", ["attach-1"]);
      expect(result).toEqual(att);
    });

    it("returns undefined when not found", async () => {
      db.select.mockResolvedValueOnce([]);
      const result = await attachmentRepo.getById("missing");
      expect(result).toBeUndefined();
    });
  });

  describe("getByMessage", () => {
    it("returns all attachments for a message", async () => {
      const rows = [
        makeAttachment({ id: "a-1", message_id: "msg-1" }),
        makeAttachment({ id: "a-2", message_id: "msg-1" }),
      ];
      db.select.mockResolvedValueOnce(rows);
      const result = await attachmentRepo.getByMessage("msg-1");
      expect(db.select).toHaveBeenCalledWith(
        "SELECT * FROM attachments WHERE message_id = $1",
        ["msg-1"],
      );
      expect(result).toEqual(rows);
    });

    it("returns empty array when no attachments", async () => {
      db.select.mockResolvedValueOnce([]);
      const result = await attachmentRepo.getByMessage("msg-empty");
      expect(result).toEqual([]);
    });
  });

  describe("create", () => {
    it("inserts attachment with 8 parameters", async () => {
      const att = makeAttachment({ id: "a-1", name: "photo.jpg" });
      const { created_at: _, ...input } = att;
      await attachmentRepo.create(input);
      expect(db.execute).toHaveBeenCalledWith(
        expect.stringContaining("INSERT INTO attachments"),
        [att.id, att.message_id, att.type, att.name, att.path, att.mime_type, att.size, att.content],
      );
    });
  });

  describe("delete", () => {
    it("deletes attachment by id", async () => {
      await attachmentRepo.delete("a-1");
      expect(db.execute).toHaveBeenCalledWith("DELETE FROM attachments WHERE id = $1", ["a-1"]);
    });
  });

  describe("deleteByMessage", () => {
    it("deletes all attachments for a message", async () => {
      await attachmentRepo.deleteByMessage("msg-1");
      expect(db.execute).toHaveBeenCalledWith(
        "DELETE FROM attachments WHERE message_id = $1",
        ["msg-1"],
      );
    });
  });
});
