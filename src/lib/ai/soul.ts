/**
 * SOUL file service: reads SOUL.md and private/ files via Tauri commands.
 * SOUL content is injected into every system prompt as cove's identity.
 */

import { invoke } from "@tauri-apps/api/core";

export interface SoulPrivateFile {
  name: string;
  content: string;
}

export interface SoulContent {
  public: string;
  private: SoulPrivateFile[];
}

/** Read SOUL.md + all private/ files. Returns empty values on error. */
export async function readSoul(): Promise<SoulContent> {
  try {
    const [pub_, priv_] = await Promise.all([
      invoke<string>("read_soul", { fileName: "SOUL.md" }).catch(() => ""),
      invoke<[string, string][]>("read_soul_private").catch(
        () => [] as [string, string][],
      ),
    ]);
    return {
      public: pub_,
      private: priv_.map(([name, content]) => ({ name, content })),
    };
  } catch {
    return { public: "", private: [] };
  }
}

/** Write SOUL.md content. */
export async function writeSoul(content: string): Promise<void> {
  await invoke("write_soul", { fileName: "SOUL.md", content });
}

/** Write a file to soul/private/. */
export async function writeSoulPrivate(
  fileName: string,
  content: string,
): Promise<void> {
  await invoke("write_soul_private", { fileName, content });
}

/** Delete a file from soul/private/. */
export async function deleteSoulPrivate(fileName: string): Promise<void> {
  await invoke("delete_soul_private", { fileName });
}

/** Snapshot current SOUL files. Returns the snapshot timestamp. */
export async function snapshotSoul(): Promise<string> {
  return invoke<string>("snapshot_soul");
}

/** Find a specific file in private files by name. */
export function findPrivateFile(
  files: SoulPrivateFile[],
  name: string,
): SoulPrivateFile | undefined {
  return files.find((f) => f.name === name);
}

/** Format SOUL content for system prompt injection. */
export function formatSoulPrompt(soul: SoulContent): string {
  const parts: string[] = [];
  if (soul.public) {
    parts.push(`[SOUL]\n${soul.public}`);
  }
  for (const file of soul.private) {
    if (file.content.trim()) {
      parts.push(`[SOUL:private:${file.name}]\n${file.content}`);
    }
  }
  return parts.join("\n\n");
}
