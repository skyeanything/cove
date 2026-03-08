import { invoke } from "@tauri-apps/api/core";
import type { SelectedEntry } from "@/stores/filePreviewStore";
import { useWorkspaceStore } from "@/stores/workspaceStore";

/** Max chars for inline file content; beyond this we truncate + hint to use `read` tool */
const INLINE_THRESHOLD = 8_000;
/** Max lines to read from a file via read_file */
const READ_LIMIT = 500;
/** Office file extensions handled by read_office_text instead of read_file */
const OFFICE_EXTENSIONS = new Set(["docx", "xlsx", "pptx", "pdf"]);

interface ListDirEntry {
  name: string;
  path: string;
  isDir: boolean;
  size?: number;
}

interface ReadOfficeTextResult {
  content: string;
  fileType: string;
  truncated: boolean;
  warnings: string[];
}

function getExt(filePath: string): string {
  const dot = filePath.lastIndexOf(".");
  return dot !== -1 ? filePath.slice(dot + 1).toLowerCase() : "";
}

/**
 * For absolute entry paths, find the most specific registered workspace that contains it.
 * For relative paths, use selectedWorkspaceRoot (the workspace where the user selected files)
 * if available, otherwise fall back to the active workspace.
 */
function resolveWorkspaceRoot(
  entryPath: string,
  fallback: string,
  selectedWorkspaceRoot?: string,
): string {
  if (!entryPath.startsWith("/")) return selectedWorkspaceRoot ?? fallback;
  const { workspaces } = useWorkspaceStore.getState();
  let bestLen = -1;
  let best = selectedWorkspaceRoot ?? fallback;
  for (const ws of workspaces) {
    const normalized = ws.path.endsWith("/") ? ws.path : ws.path + "/";
    if ((entryPath === ws.path || entryPath.startsWith(normalized)) && ws.path.length > bestLen) {
      bestLen = ws.path.length;
      best = ws.path;
    }
  }
  return best;
}

/**
 * Build a context text block from the currently selected workspace entries.
 * - Files: read content, inline if small, truncate + hint if large
 * - Office files (docx/xlsx/pptx/pdf): parsed via read_office_text
 * - Dirs: list immediate children (name + type)
 * Returns empty string if no entries or workspaceRoot is missing.
 *
 * @param selectedWorkspaceRoot - The workspace root that owns the selected entries.
 *   Used to resolve relative paths (e.g. when selected files are from a non-active workspace).
 *   Falls back to workspaceRoot (active workspace) if not provided.
 */
export async function buildFileContextBlock(
  selectedEntries: SelectedEntry[],
  workspaceRoot: string,
  selectedWorkspaceRoot?: string,
): Promise<string> {
  if (selectedEntries.length === 0 || (!workspaceRoot && !selectedWorkspaceRoot)) return "";
  const effectiveRoot = workspaceRoot || selectedWorkspaceRoot!;

  const blocks: string[] = [];

  await Promise.all(
    selectedEntries.map(async (entry) => {
      const wsRoot = resolveWorkspaceRoot(entry.path, effectiveRoot, selectedWorkspaceRoot);
      // Root workspace entry uses wsRoot as its path; normalize to "" for Tauri commands.
      const normalizedPath = entry.path === wsRoot ? "" : entry.path;
      const normalizedEntry = { ...entry, path: normalizedPath };
      try {
        if (normalizedEntry.isDir) {
          const block = await buildDirBlock(normalizedEntry, wsRoot);
          if (block) blocks.push(block);
        } else {
          const block = await buildFileBlock(normalizedEntry, wsRoot);
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
  const pathLabel = entry.path || entry.name;
  const ext = getExt(pathLabel);

  if (OFFICE_EXTENSIONS.has(ext)) {
    const result = await invoke<ReadOfficeTextResult>("read_office_text", {
      args: { workspaceRoot, path: entry.path, maxChars: INLINE_THRESHOLD },
    });
    const suffix = result.truncated
      ? "\n[content truncated — use `parse_document` tool for full text]"
      : "";
    return `[File: ${entry.name} at ${pathLabel} (${result.fileType})]\n\`\`\`\n${result.content}${suffix}\n\`\`\``;
  }

  const content = await invoke<string>("read_file", {
    args: { workspaceRoot, path: entry.path, offset: 0, limit: READ_LIMIT },
  });

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
