/**
 * SOUL file service: reads SOUL.md and SOUL.private.md via Tauri commands.
 * SOUL content is injected into every system prompt as cove's identity.
 */

import { invoke } from "@tauri-apps/api/core";

export interface SoulContent {
  public: string;
  private: string;
}

/** Read both SOUL files. Returns empty strings if files are missing or on error. */
export async function readSoul(): Promise<SoulContent> {
  try {
    const [pub_, priv_] = await Promise.all([
      invoke<string>("read_soul", { fileName: "SOUL.md" }).catch(() => ""),
      invoke<string>("read_soul", { fileName: "SOUL.private.md" }).catch(
        () => "",
      ),
    ]);
    return { public: pub_, private: priv_ };
  } catch {
    return { public: "", private: "" };
  }
}

/** Write content to a SOUL file. */
export async function writeSoul(
  fileName: "SOUL.md" | "SOUL.private.md",
  content: string,
): Promise<void> {
  await invoke("write_soul", { fileName, content });
}

/** Snapshot current SOUL files. Returns the snapshot timestamp. */
export async function snapshotSoul(): Promise<string> {
  return invoke<string>("snapshot_soul");
}

/** Format SOUL content for system prompt injection. */
export function formatSoulPrompt(soul: SoulContent): string {
  const parts: string[] = [];
  if (soul.public) {
    parts.push(`[SOUL]\n${soul.public}`);
  }
  if (soul.private) {
    parts.push(`[SOUL:private]\n${soul.private}`);
  }
  return parts.join("\n\n");
}
