import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { matchesPinyinOrSubstring } from "@/lib/pinyin-filter";

export interface MentionFileEntry {
  name: string;
  path: string;
  isDir: boolean;
  /** Parent directory path (e.g. "src/components/"), empty for root-level entries */
  parentDir: string;
}

interface WalkFileEntry {
  name: string;
  path: string;
  isDir: boolean;
}

const MAX_RESULTS = 10;

/** Extensions commonly gitignored but cove can read (no leading dot, lowercase). */
const FORCE_INCLUDE_EXTS = [
  "docx", "xlsx", "pptx", "pdf",
  "doc", "xls", "ppt",
  "odt", "ods", "odp",
];

/** Filename patterns to exclude from @mention results (temp/lock files). */
const EXCLUDED_PATTERNS = [
  /^~\$/, // Word/Excel lock files
  /\.tmp$/i,
];

function isExcluded(name: string): boolean {
  return EXCLUDED_PATTERNS.some((p) => p.test(name));
}

/** Extract parent directory from a relative path. */
function extractParentDir(path: string): string {
  const lastSlash = path.lastIndexOf("/");
  if (lastSlash <= 0) return "";
  return path.slice(0, lastSlash + 1);
}

/**
 * Lists workspace files (recursively) for @mention autocomplete.
 * Uses walk_files for subdirectory traversal and pinyin matching
 * for Chinese filename search.
 */
export function useMentionFiles(
  workspacePath: string | null,
  query: string,
  enabled: boolean,
): MentionFileEntry[] {
  const [entries, setEntries] = useState<MentionFileEntry[]>([]);
  const cacheRef = useRef<{ path: string; items: MentionFileEntry[] } | null>(null);
  const prevPathRef = useRef<string | null>(null);

  // Synchronous cache invalidation — runs before effects
  if (workspacePath !== prevPathRef.current) {
    prevPathRef.current = workspacePath;
    cacheRef.current = null;
  }

  useEffect(() => {
    if (!enabled || !workspacePath) {
      setEntries([]);
      return;
    }

    let cancelled = false;

    const load = async () => {
      if (cacheRef.current?.path === workspacePath) {
        applyFilter(cacheRef.current.items);
        return;
      }

      setEntries([]);

      try {
        const raw = await invoke<WalkFileEntry[]>("walk_files", {
          args: {
            workspaceRoot: workspacePath,
            includeDirs: true,
            forceIncludeExts: FORCE_INCLUDE_EXTS,
          },
        });
        if (cancelled) return;

        const items: MentionFileEntry[] = raw
          .filter((e) => e.isDir || !isExcluded(e.name))
          .map((e) => ({
            name: e.name,
            path: e.path,
            isDir: e.isDir,
            parentDir: extractParentDir(e.path),
          }));
        cacheRef.current = { path: workspacePath, items };
        applyFilter(items);
      } catch {
        if (!cancelled) setEntries([]);
      }
    };

    function applyFilter(items: MentionFileEntry[]) {
      if (cancelled) return;
      if (!query) {
        setEntries(items.slice(0, MAX_RESULTS));
        return;
      }
      const filtered = items.filter(
        (f) =>
          matchesPinyinOrSubstring(f.name, query) ||
          matchesPinyinOrSubstring(f.path, query),
      );
      setEntries(filtered.slice(0, MAX_RESULTS));
    }

    load();
    return () => { cancelled = true; };
  }, [workspacePath, query, enabled]);

  return entries;
}
