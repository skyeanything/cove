import { invoke } from "@tauri-apps/api/core";
import type { SelectedEntry } from "@/stores/filePreviewStore";

/** Max chars for inline file content; beyond this we truncate + hint to use `read` tool */
const INLINE_THRESHOLD = 8_000;
/** Max lines to read from a file via read_file */
const READ_LIMIT = 500;

interface ListDirEntry {
  name: string;
  path: string;
  isDir: boolean;
  size?: number;
}

/**
 * Build a context text block from the currently selected workspace entries.
 * - Files: read content, inline if small, truncate + hint if large
 * - Dirs: list immediate children (name + type)
 * Returns empty string if no entries or workspaceRoot is missing.
 */
export async function buildFileContextBlock(
  selectedEntries: SelectedEntry[],
  workspaceRoot: string,
): Promise<string> {
  if (selectedEntries.length === 0 || !workspaceRoot) return "";

  const blocks: string[] = [];

  await Promise.all(
    selectedEntries.map(async (entry) => {
      // Root entries use workspaceRoot (absolute path) as their path identifier;
      // normalize to "" for Tauri commands that expect relative paths.
      const normalizedEntry = entry.path === workspaceRoot
        ? { ...entry, path: "" }
        : entry;
      try {
        if (normalizedEntry.isDir) {
          const block = await buildDirBlock(normalizedEntry, workspaceRoot);
          if (block) blocks.push(block);
        } else {
          const block = await buildFileBlock(normalizedEntry, workspaceRoot);
          if (block) blocks.push(block);
        }
      } catch {
        // Skip entries that fail to read (deleted, permission, binary, etc.)
        blocks.push(`[Context: ${entry.name} at ${entry.path || "/"} -- unable to read]`);
      }
    }),
  );

  if (blocks.length === 0) return "";
  return "\n\n---\n[Workspace Context]\n" + blocks.join("\n\n");
}

async function buildFileBlock(
  entry: SelectedEntry,
  workspaceRoot: string,
): Promise<string> {
  const content = await invoke<string>("read_file", {
    args: { workspaceRoot, path: entry.path, offset: 0, limit: READ_LIMIT },
  });

  const pathLabel = entry.path || entry.name;
  if (content.length <= INLINE_THRESHOLD) {
    return `[File: ${entry.name} at ${pathLabel}]\n\`\`\`\n${content}\n\`\`\``;
  }

  const truncated = content.slice(0, INLINE_THRESHOLD);
  return (
    `[File: ${entry.name} at ${pathLabel} (truncated, ${content.length} chars)]\n` +
    `\`\`\`\n${truncated}\n\`\`\`\n` +
    `Full content available via \`read\` tool at: ${pathLabel}`
  );
}

async function buildDirBlock(
  entry: SelectedEntry,
  workspaceRoot: string,
): Promise<string> {
  const entries = await invoke<ListDirEntry[]>("list_dir", {
    args: { workspaceRoot, path: entry.path || "", includeHidden: false },
  });

  const pathLabel = entry.path || entry.name;
  const listing = entries
    .map((e) => `  ${e.isDir ? "[dir]" : "[file]"} ${e.name}`)
    .join("\n");
  return `[Directory: ${entry.name} at ${pathLabel}]\n${listing || "  (empty)"}`;
}
