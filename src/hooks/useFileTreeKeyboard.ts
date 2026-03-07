import { useCallback, useMemo } from "react";
import type { ListDirEntry } from "@/components/preview/FileTreeItem";

/** Check if the event target is an editable element (input, textarea, contenteditable). */
export function isEditableTarget(e: { target: EventTarget | null }): boolean {
  const { target } = e;
  if (
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement
  ) {
    return true;
  }
  if (target instanceof HTMLElement && target.isContentEditable) {
    return true;
  }
  return false;
}

interface UseFileTreeKeyboardParams {
  rootEntries: ListDirEntry[] | null;
  expandedDirs: Set<string>;
  loadedChildren: Record<string, ListDirEntry[]>;
  focusedPath: string | null;
  setFocusedPath: (path: string | null) => void;
  onToggleExpand: (path: string) => void;
  onSelectFile: (path: string) => void;
  onRename: (path: string) => void;
  onDelete: (path: string, name: string) => void;
}

/**
 * Compute flat list of visible entries (respecting expanded/collapsed state).
 */
export function flattenVisible(
  entries: ListDirEntry[],
  expandedDirs: Set<string>,
  loadedChildren: Record<string, ListDirEntry[]>,
): ListDirEntry[] {
  const result: ListDirEntry[] = [];
  for (const entry of entries) {
    result.push(entry);
    if (entry.isDir && expandedDirs.has(entry.path)) {
      const children = loadedChildren[entry.path];
      if (children) {
        result.push(...flattenVisible(children, expandedDirs, loadedChildren));
      }
    }
  }
  return result;
}

export function useFileTreeKeyboard({
  rootEntries,
  expandedDirs,
  loadedChildren,
  focusedPath,
  setFocusedPath,
  onToggleExpand,
  onSelectFile,
  onRename,
  onDelete,
}: UseFileTreeKeyboardParams) {
  const flatList = useMemo(
    () =>
      rootEntries
        ? flattenVisible(rootEntries, expandedDirs, loadedChildren)
        : [],
    [rootEntries, expandedDirs, loadedChildren],
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      // Don't hijack keys when focus is inside an editable element (rename, search, etc.)
      if (isEditableTarget(e)) return;

      // Don't handle if modifier keys are pressed (let existing Cmd+C/X/V work)
      if (e.metaKey || e.ctrlKey || e.altKey) return;

      const currentIndex = focusedPath
        ? flatList.findIndex((entry) => entry.path === focusedPath)
        : -1;
      const currentEntry =
        currentIndex >= 0 ? flatList[currentIndex] : null;

      switch (e.key) {
        case "ArrowDown": {
          e.preventDefault();
          const nextIndex = currentIndex + 1;
          if (nextIndex < flatList.length) {
            const next = flatList[nextIndex];
            if (next) setFocusedPath(next.path);
          }
          break;
        }
        case "ArrowUp": {
          e.preventDefault();
          const prevIndex = currentIndex <= 0 ? 0 : currentIndex - 1;
          const prev = flatList[prevIndex];
          if (prev) setFocusedPath(prev.path);
          break;
        }
        case "ArrowRight": {
          e.preventDefault();
          if (!currentEntry) break;
          if (
            currentEntry.isDir &&
            !expandedDirs.has(currentEntry.path)
          ) {
            onToggleExpand(currentEntry.path);
          } else {
            // Move to next (first child if dir expanded, or next sibling)
            const nextIndex = currentIndex + 1;
            if (nextIndex < flatList.length) {
              const next = flatList[nextIndex];
              if (next) setFocusedPath(next.path);
            }
          }
          break;
        }
        case "ArrowLeft": {
          e.preventDefault();
          if (!currentEntry) break;
          if (
            currentEntry.isDir &&
            expandedDirs.has(currentEntry.path)
          ) {
            onToggleExpand(currentEntry.path); // collapse
          } else {
            // Move to parent directory
            const parentPath = currentEntry.path.includes("/")
              ? currentEntry.path.replace(/\/[^/]+$/, "")
              : null;
            if (parentPath) setFocusedPath(parentPath);
          }
          break;
        }
        case "Enter": {
          e.preventDefault();
          if (!currentEntry) break;
          if (currentEntry.isDir) {
            onToggleExpand(currentEntry.path);
          } else {
            onSelectFile(currentEntry.path);
          }
          break;
        }
        case "F2": {
          e.preventDefault();
          if (currentEntry) onRename(currentEntry.path);
          break;
        }
        case "Delete":
        case "Backspace": {
          e.preventDefault();
          if (currentEntry) onDelete(currentEntry.path, currentEntry.name);
          break;
        }
        default:
          return; // Don't prevent default for other keys
      }
    },
    [
      flatList,
      focusedPath,
      expandedDirs,
      setFocusedPath,
      onToggleExpand,
      onSelectFile,
      onRename,
      onDelete,
    ],
  );

  return { flatList, handleKeyDown };
}
