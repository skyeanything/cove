import { useCallback, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { InsertTarget } from "./useFileTreeDnD";

export interface OrderedEntry {
  name: string;
  path: string;
  isDir: boolean;
  mtimeSecs: number;
}

// folderRelPath → ordered list of entry names
type FolderOrder = Record<string, string[]>;

function getParent(path: string): string {
  return path.includes("/") ? path.replace(/\/[^/]+$/, "") : "";
}

function getBaseName(path: string): string {
  return path.includes("/") ? (path.split("/").pop() ?? path) : path;
}

export function useFileOrder(workspaceRoot: string | null) {
  const [order, setOrder] = useState<FolderOrder>({});
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const orderRef = useRef<FolderOrder>({});

  const loadOrder = useCallback(async () => {
    if (!workspaceRoot) return;
    try {
      const raw = await invoke<string>("read_file_order", { workspaceRoot });
      const parsed: FolderOrder = JSON.parse(raw);
      setOrder(parsed);
      orderRef.current = parsed;
    } catch {
      setOrder({});
      orderRef.current = {};
    }
  }, [workspaceRoot]);

  const scheduleSave = useCallback(() => {
    if (!workspaceRoot) return;
    if (saveTimerRef.current !== null) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      const content = JSON.stringify(orderRef.current);
      invoke("save_file_order", { workspaceRoot, content }).catch(() => {});
      saveTimerRef.current = null;
    }, 300);
  }, [workspaceRoot]);

  // Apply saved order to a list of directory entries.
  // Entries not in the saved list are appended at the end (e.g., newly created files).
  const applyOrder = useCallback(
    (entries: OrderedEntry[], folderRelPath: string): OrderedEntry[] => {
      const savedNames = orderRef.current[folderRelPath];
      if (!savedNames || savedNames.length === 0) return entries;

      const nameToEntry = new Map(entries.map((e) => [e.name, e]));
      const ordered: OrderedEntry[] = [];

      for (const name of savedNames) {
        const entry = nameToEntry.get(name);
        if (entry) ordered.push(entry);
      }

      // Append entries not yet in the saved order
      const savedSet = new Set(savedNames);
      for (const entry of entries) {
        if (!savedSet.has(entry.name)) ordered.push(entry);
      }

      return ordered;
    },
    [],
  );

  // Reorder: move draggedPath to just after afterName (null = move to front).
  const reorder = useCallback(
    (insertTarget: InsertTarget, draggedPath: string) => {
      const folderRelPath = getParent(draggedPath);
      const draggedName = getBaseName(draggedPath);
      const targetName = getBaseName(insertTarget.path);

      setOrder((prev) => {
        // Build current list from saved order or derive from the caller's rendered order
        const current = prev[folderRelPath] ? [...prev[folderRelPath]] : [];

        // Ensure both names are present; if order was empty, nothing to do
        const dragIdx = current.indexOf(draggedName);
        if (dragIdx !== -1) current.splice(dragIdx, 1);

        const targetIdx = current.indexOf(targetName);
        const insertIdx =
          insertTarget.position === "after"
            ? targetIdx === -1
              ? current.length
              : targetIdx + 1
            : targetIdx === -1
              ? 0
              : targetIdx;

        current.splice(insertIdx, 0, draggedName);

        const next = { ...prev, [folderRelPath]: current };
        orderRef.current = next;
        return next;
      });

      scheduleSave();
    },
    [scheduleSave],
  );

  // Called when a directory's children are first loaded so the order map can
  // include all current names (prevents unknown entries from always appending).
  const initFolderOrder = useCallback(
    (folderRelPath: string, entries: OrderedEntry[]) => {
      setOrder((prev) => {
        if (prev[folderRelPath]) return prev; // already seeded, keep existing order
        const names = entries.map((e) => e.name);
        const next = { ...prev, [folderRelPath]: names };
        orderRef.current = next;
        return next;
      });
    },
    [],
  );

  return { order, loadOrder, applyOrder, reorder, initFolderOrder };
}
