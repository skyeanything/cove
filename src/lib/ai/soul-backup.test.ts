import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}));

vi.mock("@tauri-apps/plugin-dialog", () => ({
  save: vi.fn(),
  open: vi.fn(),
}));

import { invoke } from "@tauri-apps/api/core";
import { save, open } from "@tauri-apps/plugin-dialog";
import { exportSoul, importSoul, getSoulHealth } from "./soul-backup";

describe("soul-backup", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("exportSoul", () => {
    it("returns null when user cancels save dialog", async () => {
      vi.mocked(save).mockResolvedValue(null);
      const result = await exportSoul();
      expect(result).toBeNull();
      expect(invoke).not.toHaveBeenCalled();
    });

    it("calls export_soul with dest path and summaries", async () => {
      vi.mocked(save).mockResolvedValue("/tmp/backup.zip");
      vi.mocked(invoke).mockResolvedValue({
        path: "/tmp/backup.zip",
        file_count: 3,
        includes_summaries: true,
        size_bytes: 1024,
      });

      const result = await exportSoul('["summary"]');
      expect(save).toHaveBeenCalledWith(
        expect.objectContaining({
          filters: [{ name: "ZIP Archive", extensions: ["zip"] }],
        }),
      );
      expect(invoke).toHaveBeenCalledWith("export_soul", {
        destPath: "/tmp/backup.zip",
        summariesJson: '["summary"]',
      });
      expect(result?.file_count).toBe(3);
    });

    it("passes null when no summaries provided", async () => {
      vi.mocked(save).mockResolvedValue("/tmp/backup.zip");
      vi.mocked(invoke).mockResolvedValue({
        path: "/tmp/backup.zip",
        file_count: 1,
        includes_summaries: false,
        size_bytes: 512,
      });

      await exportSoul();
      expect(invoke).toHaveBeenCalledWith("export_soul", {
        destPath: "/tmp/backup.zip",
        summariesJson: null,
      });
    });
  });

  describe("importSoul", () => {
    it("returns null when user cancels open dialog", async () => {
      vi.mocked(open).mockResolvedValue(null);
      const result = await importSoul();
      expect(result).toBeNull();
      expect(invoke).not.toHaveBeenCalled();
    });

    it("calls import_soul with source path", async () => {
      vi.mocked(open).mockResolvedValue("/tmp/backup.zip");
      vi.mocked(invoke).mockResolvedValue({
        files_restored: 2,
        summaries_json: null,
        backup_created: true,
      });

      const result = await importSoul();
      expect(invoke).toHaveBeenCalledWith("import_soul", {
        sourcePath: "/tmp/backup.zip",
      });
      expect(result?.files_restored).toBe(2);
      expect(result?.backup_created).toBe(true);
    });
  });

  describe("getSoulHealth", () => {
    it("invokes soul_health command", async () => {
      const health = {
        soul_exists: true,
        soul_readable: true,
        private_file_count: 2,
        snapshot_count: 5,
        format_version: 1,
        last_meditation: "2026-03-01T00:00:00Z",
        has_corruption: false,
        corruption_detail: null,
      };
      vi.mocked(invoke).mockResolvedValue(health);

      const result = await getSoulHealth();
      expect(invoke).toHaveBeenCalledWith("soul_health");
      expect(result).toEqual(health);
    });
  });
});
