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

/** Binary extensions to exclude from @mention — everything else is allowed. */
const BINARY_EXTS = new Set([
  // Compiled / object
  "exe", "dll", "so", "dylib", "o", "obj", "a", "lib", "class", "pyc", "pyo",
  "wasm",
  // Archives
  "zip", "tar", "gz", "bz2", "xz", "7z", "rar", "tgz", "zst",
  // Media (non-image binary)
  "mp3", "mp4", "avi", "mov", "mkv", "flac", "wav", "ogg", "m4a", "wmv",
  // Fonts
  "ttf", "otf", "woff", "woff2", "eot",
  // Database / binary data
  "db", "sqlite", "sqlite3", "mdb",
  // Disk images / packages
  "dmg", "iso", "pkg", "deb", "rpm", "msi", "apk", "ipa",
  // Other binary
  "bin", "dat", "pdb", "DS_Store",
]);

/** Filename patterns to exclude (temp/lock files). */
const EXCLUDED_PATTERNS = [
  /^~\$/, // Word/Excel lock files
  /\.tmp$/i,
];

function isMentionable(name: string, isDir: boolean): boolean {
  if (isDir) return true;
  if (EXCLUDED_PATTERNS.some((p) => p.test(name))) return false;
  const dot = name.lastIndexOf(".");
  if (dot === -1) return true; // Extensionless files (LICENSE, Makefile, etc.) are readable
  const ext = name.slice(dot + 1).toLowerCase();
  return !BINARY_EXTS.has(ext);
}

/** Extract parent directory from a relative path. */
function extractParentDir(path: string): string {
  const lastSlash = path.lastIndexOf("/");
  if (lastSlash <= 0) return "";
  return path.slice(0, lastSlash + 1);
}

/**
 * Lists workspace files (recursively) for @mention autocomplete.
 * Filters to cove-readable file types and excludes temp/lock files.
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
          args: { workspaceRoot: workspacePath, includeDirs: true },
        });
        if (cancelled) return;

        const items: MentionFileEntry[] = raw
          .filter((e) => isMentionable(e.name, e.isDir))
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
