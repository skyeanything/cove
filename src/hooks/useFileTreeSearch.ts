import { useMemo, useState, useCallback } from "react";
import type { ListDirEntry } from "@/components/preview/FileTreeItem";

/**
 * Recursively filter entries by search query.
 * A directory is kept if its name matches OR any descendant matches.
 * A file is kept only if its name matches.
 */
function filterEntries(
  entries: ListDirEntry[],
  query: string,
  loadedChildren: Record<string, ListDirEntry[]>,
): ListDirEntry[] {
  if (!query) return entries;
  const q = query.toLowerCase();
  return entries.filter((entry) => {
    if (entry.name.toLowerCase().includes(q)) return true;
    if (entry.isDir) {
      const children = loadedChildren[entry.path];
      if (children && children.length > 0) {
        return filterEntries(children, query, loadedChildren).length > 0;
      }
    }
    return false;
  });
}

export function useFileTreeSearch(
  rootEntries: ListDirEntry[] | null,
  loadedChildren: Record<string, ListDirEntry[]>,
) {
  const [searchQuery, setSearchQuery] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);

  const filteredRootEntries = useMemo(() => {
    if (!rootEntries) return null;
    return filterEntries(rootEntries, searchQuery, loadedChildren);
  }, [rootEntries, searchQuery, loadedChildren]);

  const getFilteredChildren = useCallback(
    (dirPath: string): ListDirEntry[] | undefined => {
      const children = loadedChildren[dirPath];
      if (!children || !searchQuery) return children;
      return filterEntries(children, searchQuery, loadedChildren);
    },
    [loadedChildren, searchQuery],
  );

  const matchCount = useMemo(() => {
    if (!searchQuery || !rootEntries) return 0;
    function countMatches(entries: ListDirEntry[]): number {
      let count = 0;
      const q = searchQuery.toLowerCase();
      for (const entry of entries) {
        if (entry.name.toLowerCase().includes(q)) count++;
        if (entry.isDir) {
          const children = loadedChildren[entry.path];
          if (children) count += countMatches(children);
        }
      }
      return count;
    }
    return countMatches(rootEntries);
  }, [searchQuery, rootEntries, loadedChildren]);

  const openSearch = useCallback(() => setSearchOpen(true), []);
  const closeSearch = useCallback(() => {
    setSearchOpen(false);
    setSearchQuery("");
  }, []);

  return {
    searchQuery,
    setSearchQuery,
    searchOpen,
    openSearch,
    closeSearch,
    filteredRootEntries,
    getFilteredChildren,
    matchCount,
  };
}
