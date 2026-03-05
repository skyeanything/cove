/**
 * SOUL backup IPC wrappers: export, import, and health check.
 * Uses tauri-plugin-dialog for native file dialogs.
 */

import { invoke } from "@tauri-apps/api/core";
import { save, open } from "@tauri-apps/plugin-dialog";

export interface SoulExportResult {
  path: string;
  file_count: number;
  includes_summaries: boolean;
  size_bytes: number;
}

export interface SoulImportResult {
  files_restored: number;
  summaries_json: string | null;
  backup_created: boolean;
}

export interface SoulHealth {
  soul_exists: boolean;
  soul_readable: boolean;
  private_file_count: number;
  snapshot_count: number;
  format_version: number | null;
  last_meditation: string | null;
  has_corruption: boolean;
  corruption_detail: string | null;
}

/** Show save dialog and export SOUL to zip. Returns null if user cancels. */
export async function exportSoul(
  summariesJson?: string,
): Promise<SoulExportResult | null> {
  const date = new Date().toISOString().slice(0, 10);
  const destPath = await save({
    defaultPath: `cove-soul-${date}.zip`,
    filters: [{ name: "ZIP Archive", extensions: ["zip"] }],
  });
  if (!destPath) return null;
  return invoke<SoulExportResult>("export_soul", {
    destPath,
    summariesJson: summariesJson ?? null,
  });
}

/** Show open dialog and import SOUL from zip. Returns null if user cancels. */
export async function importSoul(): Promise<SoulImportResult | null> {
  const sourcePath = await open({
    filters: [{ name: "ZIP Archive", extensions: ["zip"] }],
    multiple: false,
  });
  if (!sourcePath) return null;
  return invoke<SoulImportResult>("import_soul", { sourcePath });
}

/** Get current SOUL health status. */
export async function getSoulHealth(): Promise<SoulHealth> {
  return invoke<SoulHealth>("soul_health");
}
