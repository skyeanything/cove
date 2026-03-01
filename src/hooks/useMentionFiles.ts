import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";

export interface MentionFileEntry {
  name: string;
  path: string;
  isDir: boolean;
}

interface ListDirEntry {
  name: string;
  path: string;
  isDir: boolean;
  mtimeSecs: number;
}

const MAX_RESULTS = 10;

/**
 * Lists workspace files for @mention autocomplete.
 * Fetches the root directory listing on first enable, caches it,
 * and filters by query.
 */
export function useMentionFiles(
  workspacePath: string | null,
  query: string,
  enabled: boolean,
): MentionFileEntry[] {
  const [entries, setEntries] = useState<MentionFileEntry[]>([]);
  const cacheRef = useRef<{ path: string; items: MentionFileEntry[] } | null>(null);

  useEffect(() => {
    if (!enabled || !workspacePath) {
      setEntries([]);
      return;
    }

    let cancelled = false;

    const load = async () => {
      // Use cache if workspace hasn't changed
      if (cacheRef.current?.path === workspacePath) {
        applyFilter(cacheRef.current.items);
        return;
      }

      try {
        const raw = await invoke<ListDirEntry[]>("list_dir", {
          args: { workspaceRoot: workspacePath, path: "", includeHidden: false },
        });
        if (cancelled) return;

        const items: MentionFileEntry[] = raw.map((e) => ({
          name: e.name,
          path: e.path,
          isDir: e.isDir,
        }));
        cacheRef.current = { path: workspacePath, items };
        applyFilter(items);
      } catch {
        if (!cancelled) setEntries([]);
      }
    };

    function applyFilter(items: MentionFileEntry[]) {
      if (cancelled) return;
      const q = query.toLowerCase();
      const filtered = q
        ? items.filter((f) => f.name.toLowerCase().includes(q))
        : items;
      setEntries(filtered.slice(0, MAX_RESULTS));
    }

    load();
    return () => { cancelled = true; };
  }, [workspacePath, query, enabled]);

  return entries;
}
