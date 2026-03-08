// FILE_SIZE_EXCEPTION: FileTreePanel handles complex workspace file tree logic (navigation, search, context menus, drag-drop); scheduled for modular refactor.
import { useCallback, useEffect, useMemo, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { useTranslation } from "react-i18next";
import { useWorkspaceStore } from "@/stores/workspaceStore";
import { useFilePreviewStore, dirOfPath } from "@/stores/filePreviewStore";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import {
  Plus,
  FolderPlus,
  FileText,
  FolderOpen,
  ChevronDown,
  ChevronRight,
  Search,
  Copy,
  FileUp,
  Link,
  Trash2,
} from "lucide-react";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import { useDataStore } from "@/stores/dataStore";
import { useChatStore } from "@/stores/chatStore";
import { useLayoutStore } from "@/stores/layoutStore";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import type { Workspace } from "@/db/types";
import { useFileTreeDialogs } from "@/hooks/useFileTreeDialogs";
import { useFileTreeDnD } from "@/hooks/useFileTreeDnD";
import { useFileClipboard } from "@/hooks/useFileClipboard";
import { FileTreeItem } from "./FileTreeItem";
import { FileTreeDialogs } from "./FileTreeDialogs";
import { FileTreeSearch } from "./FileTreeSearch";
import type { ListDirEntry } from "./FileTreeItem";

async function listDir(
  workspaceRoot: string,
  path: string,
  includeHidden: boolean,
): Promise<ListDirEntry[]> {
  return invoke<ListDirEntry[]>("list_dir", {
    args: { workspaceRoot, path: path || "", includeHidden },
  });
}

function toAbsolutePath(workspaceRoot: string, path: string): string {
  if (!path) return workspaceRoot;
  return `${workspaceRoot}/${path}`.replace(/\/+/g, "/");
}

/** Recursively filter entries by query (name match). */
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

// ── Per-workspace root node ─────────────────────────────────────

function WorkspaceRootNode({
  workspace,
  selectedEntries,
  onSelectFile,
  onRemove,
  searchQuery,
  onMatchCount,
}: {
  workspace: Workspace;
  selectedEntries: string[];
  onSelectFile: (e: React.MouseEvent, path: string, isDir: boolean, name: string) => void;
  onRemove: () => void;
  searchQuery: string;
  onMatchCount: (id: string, count: number) => void;
}) {
  const { t } = useTranslation();
  const workspaceRoot = workspace.path;
  const fileTreeShowHidden = useLayoutStore((s) => s.fileTreeShowHidden);
  const selectedPath = useFilePreviewStore((s) => s.selectedPath);
  const lastOpenedDirPath = useFilePreviewStore((s) => s.lastOpenedDirPath);
  const pendingExpandPath = useFilePreviewStore((s) => s.pendingExpandPath);
  const setPendingExpandPath = useFilePreviewStore((s) => s.setPendingExpandPath);
  const activeWorkspaceId = useWorkspaceStore((s) => s.activeWorkspace?.id);

  const [expanded, setExpanded] = useState(true);
  const [rootEntries, setRootEntries] = useState<ListDirEntry[] | null>(null);
  const [rootLoaded, setRootLoaded] = useState(false);
  const [expandedDirs, setExpandedDirs] = useState<Set<string>>(new Set());
  const [loadedChildren, setLoadedChildren] = useState<Record<string, ListDirEntry[]>>({});
  const [editingPath, setEditingPath] = useState<string | null>(null);

  /** Immediately refresh a directory listing after a mutation */
  const refreshDir = useCallback((dirPath: string) => {
    const showHidden = useLayoutStore.getState().fileTreeShowHidden;
    listDir(workspaceRoot, dirPath, showHidden)
      .then((entries) => {
        if (dirPath === "") setRootEntries(entries);
        else setLoadedChildren((prev) => ({ ...prev, [dirPath]: entries }));
      })
      .catch(() => {});
  }, [workspaceRoot]);

  const dialogs = useFileTreeDialogs({
    workspaceRoot,
    selectedPath,
    setSelected: (p: string | null) => useFilePreviewStore.getState().setSelected(p),
    setExpandedDirs,
    refreshDir,
    t,
  });
  const dnd = useFileTreeDnD({ workspaceRoot, refreshDir });
  const clipboard = useFileClipboard(workspaceRoot, refreshDir);

  const loadRoot = useCallback(() => {
    setRootLoaded(true);
    listDir(workspaceRoot, "", fileTreeShowHidden)
      .then(setRootEntries)
      .catch(() => setRootEntries([]));
  }, [workspaceRoot, fileTreeShowHidden]);

  useEffect(() => {
    setRootEntries(null);
    setRootLoaded(false);
    setExpandedDirs(new Set());
    setLoadedChildren({});
  }, [workspaceRoot, fileTreeShowHidden]);

  useEffect(() => {
    if (workspaceRoot && !rootLoaded) loadRoot();
  }, [workspaceRoot, rootLoaded, loadRoot]);

  useEffect(() => {
    const toLoad = [...expandedDirs].filter((p) => loadedChildren[p] === undefined);
    toLoad.forEach((dirPath) => {
      listDir(workspaceRoot, dirPath, fileTreeShowHidden)
        .then((entries) => setLoadedChildren((prev) => ({ ...prev, [dirPath]: entries })))
        .catch(() => setLoadedChildren((prev) => ({ ...prev, [dirPath]: [] })));
    });
  }, [workspaceRoot, expandedDirs, fileTreeShowHidden]);

  useEffect(() => {
    if (activeWorkspaceId !== workspace.id) return;
    const focusDir = selectedPath ? dirOfPath(selectedPath) : lastOpenedDirPath;
    if (!focusDir) return;
    setExpandedDirs((prev) => {
      const next = new Set(prev);
      const parts = focusDir.split("/").filter(Boolean);
      for (let i = 0; i < parts.length; i++) next.add(parts.slice(0, i + 1).join("/"));
      return next;
    });
  }, [selectedPath, lastOpenedDirPath, activeWorkspaceId, workspace.id]);

  useEffect(() => {
    if (!pendingExpandPath || activeWorkspaceId !== workspace.id) return;
    setExpandedDirs((prev) => {
      const next = new Set(prev);
      const parts = pendingExpandPath.split("/").filter(Boolean);
      for (let i = 0; i < parts.length; i++) next.add(parts.slice(0, i + 1).join("/"));
      return next;
    });
    setPendingExpandPath(null);
  }, [pendingExpandPath, setPendingExpandPath, activeWorkspaceId, workspace.id]);

  useEffect(() => {
    const unlistenPromise = listen<{ path: string; kind: string }>(
      "workspace-file-changed",
      (event) => {
        const { path, kind } = event.payload ?? {};
        if (!path || !["create", "remove", "rename"].includes(kind)) return;
        const activeWsPath = useWorkspaceStore.getState().activeWorkspace?.path ?? null;
        if (activeWsPath !== workspaceRoot) return;
        const parent = path.includes("/") ? path.replace(/\/[^/]+$/, "") : "";
        const showHidden = useLayoutStore.getState().fileTreeShowHidden;
        if (kind === "remove") {
          setExpandedDirs((prev) => {
            const next = new Set(prev);
            next.delete(path);
            return next;
          });
        }
        const updateParent = (entries: ListDirEntry[]) => {
          if (parent === "") setRootEntries(entries);
          else setLoadedChildren((prev) => ({ ...prev, [parent]: entries }));
        };
        listDir(workspaceRoot, parent, showHidden)
          .then(updateParent)
          .catch(() => updateParent([]));
      },
    );
    return () => { unlistenPromise.then((u) => u()); };
  }, [workspaceRoot]);

  const onToggleExpand = useCallback((path: string) => {
    setExpandedDirs((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  }, []);

  // Wrap onSelectFile to also record which workspace root owns this selection
  const handleLocalSelectFile = useCallback(
    (e: React.MouseEvent, path: string, isDir: boolean, name: string) => {
      useFilePreviewStore.getState().setSelectedWorkspaceRoot(workspaceRoot);
      onSelectFile(e, path, isDir, name);
    },
    [onSelectFile, workspaceRoot],
  );

  const onLoadChildren = useCallback((_path: string, _entries: ListDirEntry[]) => {
    // no-op: children are loaded via expandedDirs effect
  }, []);

  const copyToClipboard = useCallback((text: string) => {
    void navigator.clipboard.writeText(text);
  }, []);

  const onRename = useCallback((path: string) => setEditingPath(path), []);
  const onRevealInFinder = useCallback(
    (path: string) => { invoke("reveal_in_finder", { args: { workspaceRoot, path } }).catch(() => {}); },
    [workspaceRoot],
  );
  const onCopyRelativePath = useCallback((path: string) => copyToClipboard(path || workspace.name), [copyToClipboard, workspace.name]);
  const onCopyAbsolutePath = useCallback(
    (path: string) => { copyToClipboard(toAbsolutePath(workspaceRoot, path)); },
    [workspaceRoot, copyToClipboard],
  );
  const onRenameSubmit = useCallback(
    (path: string, newName: string) => {
      const currentName = path.split("/").pop() ?? path;
      if (newName === currentName) { setEditingPath(null); return; }
      const parent = path.includes("/") ? path.replace(/\/[^/]+$/, "") : "";
      const toPath = parent ? `${parent}/${newName}` : newName;
      invoke("move_file", { args: { workspaceRoot, fromPath: path, toPath } })
        .then(() => refreshDir(parent))
        .finally(() => setEditingPath(null));
    },
    [workspaceRoot],
  );
  const onRenameCancel = useCallback(() => setEditingPath(null), []);

  // Filtered entries for search
  const filteredRootEntries = useMemo(() => {
    if (!rootEntries) return null;
    return filterEntries(rootEntries, searchQuery, loadedChildren);
  }, [rootEntries, searchQuery, loadedChildren]);

  const filteredLoadedChildren = useMemo(() => {
    if (!searchQuery) return loadedChildren;
    const result: Record<string, ListDirEntry[]> = {};
    for (const key of Object.keys(loadedChildren)) {
      result[key] = filterEntries(loadedChildren[key] ?? [], searchQuery, loadedChildren);
    }
    return result;
  }, [loadedChildren, searchQuery]);

  const matchCount = useMemo(() => {
    if (!searchQuery || !rootEntries) return 0;
    const q = searchQuery.toLowerCase();
    function count(entries: ListDirEntry[]): number {
      let n = 0;
      for (const e of entries) {
        if (e.name.toLowerCase().includes(q)) n++;
        if (e.isDir) {
          const ch = loadedChildren[e.path];
          if (ch) n += count(ch);
        }
      }
      return n;
    }
    return count(rootEntries);
  }, [searchQuery, rootEntries, loadedChildren]);

  useEffect(() => {
    onMatchCount(workspace.id, matchCount);
  }, [matchCount, workspace.id, onMatchCount]);

  const sharedItemProps = {
    workspaceRoot,
    selectedPath,
    selectedEntries,
    expandedDirs,
    loadedChildren: filteredLoadedChildren,
    editingPath,
    clipboardSourcePath: clipboard.sourcePath,
    clipboardMode: clipboard.mode,
    onToggleExpand,
    onSelectFile: handleLocalSelectFile,
    onLoadChildren,
    onNewFolder: dialogs.onNewFolder,
    onNewMarkdown: dialogs.onNewMarkdown,
    onCopy: clipboard.onCopy,
    onCut: clipboard.onCut,
    onPaste: clipboard.onPaste,
    onRename,
    onRevealInFinder,
    onCopyRelativePath,
    onCopyAbsolutePath,
    onDelete: dialogs.onDelete,
    onRenameSubmit,
    onRenameCancel,
    draggedPath: dnd.draggedPath,
    dropTargetPath: dnd.dropTargetPath,
    onDnDStart: dnd.onDragStart,
    onDnDEnd: dnd.onDragEnd,
    onDnDOver: dnd.onDragOver,
    onDnDLeave: dnd.onDragLeave,
    onDnDDrop: dnd.onDrop,
  };

  return (
    <div
      tabIndex={-1}
      onKeyDown={(e) => {
        if (!selectedPath) return;
        if ((e.metaKey || e.ctrlKey) && e.key === "c") {
          e.preventDefault();
          clipboard.onCopy(selectedPath);
        } else if ((e.metaKey || e.ctrlKey) && e.key === "x") {
          e.preventDefault();
          clipboard.onCut(selectedPath);
        } else if ((e.metaKey || e.ctrlKey) && e.key === "v" && clipboard.sourcePath) {
          e.preventDefault();
          void clipboard.onPaste(useFilePreviewStore.getState().lastOpenedDirPath ?? "");
        }
      }}
    >
      {/* Root folder row — same visual pattern as child items */}
      <ContextMenu>
        <ContextMenuTrigger asChild>
          <button
            type="button"
            onClick={(e) => {
              setExpanded((v) => !v);
              handleLocalSelectFile(e, workspaceRoot, true, workspace.name);
            }}
            className={`flex w-full items-center gap-1.5 rounded-[2px] px-3 py-1 text-left text-[13px] ${
              selectedEntries.includes(workspaceRoot)
                ? "bg-background-tertiary text-foreground"
                : "text-foreground-secondary hover:bg-background-tertiary hover:text-foreground"
            }`}
          >
            <span className="flex w-4 shrink-0 items-center justify-center">
              {expanded
                ? <ChevronDown className="size-3.5 text-muted-foreground" strokeWidth={1.5} />
                : <ChevronRight className="size-3.5 text-muted-foreground" strokeWidth={1.5} />
              }
            </span>
            <FolderOpen className="size-4 shrink-0 text-foreground-secondary" strokeWidth={1.5} />
            <span className="min-w-0 truncate">{workspace.name}</span>
          </button>
        </ContextMenuTrigger>
        <ContextMenuContent className="w-48 rounded-lg border border-border shadow-lg">
          <ContextMenuItem className="gap-2 text-[13px]" onClick={() => dialogs.onNewFolder("")}>
            <FolderPlus className="size-4" strokeWidth={1.5} />
            {t("explorer.newFolder")}
          </ContextMenuItem>
          <ContextMenuItem className="gap-2 text-[13px]" onClick={() => dialogs.onNewMarkdown("")}>
            <FileText className="size-4" strokeWidth={1.5} />
            {t("explorer.newMarkdown")}
          </ContextMenuItem>
          <ContextMenuSeparator />
          <ContextMenuItem className="gap-2 text-[13px]" onClick={() => onRevealInFinder("")}>
            <FileUp className="size-4" strokeWidth={1.5} />
            {t("explorer.revealInFinder")}
          </ContextMenuItem>
          <ContextMenuSeparator />
          <ContextMenuItem className="gap-2 text-[13px]" onClick={() => onCopyRelativePath("")}>
            <Copy className="size-4" strokeWidth={1.5} />
            {t("explorer.copyRelativePath")}
          </ContextMenuItem>
          <ContextMenuItem className="gap-2 text-[13px]" onClick={() => onCopyAbsolutePath("")}>
            <Link className="size-4" strokeWidth={1.5} />
            {t("explorer.copyAbsolutePath")}
          </ContextMenuItem>
          <ContextMenuSeparator />
          <ContextMenuItem
            variant="destructive"
            className="gap-2 text-[13px]"
            onClick={onRemove}
          >
            <Trash2 className="size-4" strokeWidth={1.5} />
            {t("workspace.remove", "Remove")}
          </ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>

      {/* File tree */}
      {expanded && (
        <div
          className="ml-[18px] pb-1"
          onDragOver={dnd.onRootDragOver}
          onDrop={dnd.onRootDrop}
        >
          {filteredRootEntries === null ? (
            <div className="py-2 text-center text-[13px] text-muted-foreground">{t("preview.loading")}</div>
          ) : filteredRootEntries.length === 0 ? (
            <div className="py-2 pl-14 text-[13px] text-muted-foreground">{t("preview.emptyDir")}</div>
          ) : (
            filteredRootEntries.map((entry) => (
              <FileTreeItem key={entry.path} entry={entry} {...sharedItemProps} />
            ))
          )}
        </div>
      )}

      {/* File operation dialogs */}
      <FileTreeDialogs
        deleteTarget={dialogs.deleteTarget}
        setDeleteTarget={dialogs.setDeleteTarget}
        handleConfirmDelete={dialogs.handleConfirmDelete}
        newFolderParentPath={dialogs.newFolderParentPath}
        newFolderName={dialogs.newFolderName}
        setNewFolderName={dialogs.setNewFolderName}
        newFolderError={dialogs.newFolderError}
        setNewFolderError={dialogs.setNewFolderError}
        handleNewFolderConfirm={dialogs.handleNewFolderConfirm}
        handleNewFolderCancel={dialogs.handleNewFolderCancel}
        newMarkdownParentPath={dialogs.newMarkdownParentPath}
        newMarkdownName={dialogs.newMarkdownName}
        setNewMarkdownName={dialogs.setNewMarkdownName}
        newMarkdownError={dialogs.newMarkdownError}
        setNewMarkdownError={dialogs.setNewMarkdownError}
        handleNewMarkdownConfirm={dialogs.handleNewMarkdownConfirm}
        handleNewMarkdownCancel={dialogs.handleNewMarkdownCancel}
        t={t}
      />
    </div>
  );
}

// ── FileTreePanel ───────────────────────────────────────────────

export function FileTreePanel() {
  const { t } = useTranslation();
  const workspaces = useWorkspaceStore((s) => s.workspaces);
  const addWorkspace = useWorkspaceStore((s) => s.add);
  const removeWorkspace = useWorkspaceStore((s) => s.remove);
  const selectWorkspace = useWorkspaceStore((s) => s.select);
  const setActiveConversation = useDataStore((s) => s.setActiveConversation);
  const setSelected = useFilePreviewStore((s) => s.setSelected);
  const toggleSelected = useFilePreviewStore((s) => s.toggleSelected);
  const selectedEntries = useFilePreviewStore((s) => s.selectedEntries);

  const [removeTarget, setRemoveTarget] = useState<Workspace | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [matchCounts, setMatchCounts] = useState<Record<string, number>>({});

  const totalMatchCount = useMemo(
    () => Object.values(matchCounts).reduce((s, n) => s + n, 0),
    [matchCounts],
  );

  const handleMatchCount = useCallback((id: string, count: number) => {
    setMatchCounts((prev) => prev[id] === count ? prev : { ...prev, [id]: count });
  }, []);

  const selectedEntryPaths = useMemo(
    () => selectedEntries.map((e) => e.path),
    [selectedEntries],
  );

  const realWorkspaces = workspaces.filter((w) => !w.is_default);

  const handleAddWorkspace = async () => {
    try {
      const selected = await openDialog({ directory: true, multiple: false });
      if (typeof selected === "string" && selected) {
        const ws = await addWorkspace(selected);
        setActiveConversation(null);
        useChatStore.getState().reset();
        await selectWorkspace(ws.id, null);
      }
    } catch {
      // cancelled
    }
  };

  const handleSelectFile = useCallback(
    (e: React.MouseEvent, path: string, isDir: boolean, name: string) => {
      if (e.metaKey || e.ctrlKey) {
        toggleSelected(path, isDir, name);
      } else {
        setSelected(path, isDir, name);
      }
    },
    [setSelected, toggleSelected],
  );

  const handleCloseSearch = useCallback(() => {
    setSearchOpen(false);
    setSearchQuery("");
  }, []);

  return (
    <>
      <div className="file-preview-tree flex h-full min-h-0 flex-col overflow-hidden bg-background">
        {/* Header */}
        <div className="flex h-[46px] shrink-0 items-center justify-between border-b border-border bg-background px-3">
          <span className="text-[13px] font-semibold text-foreground">
            {t("sidebar.workspace", "Workspace")}
          </span>
          <div className="flex items-center gap-0.5">
            <button
              type="button"
              onClick={() => setSearchOpen((v) => !v)}
              className="rounded-md p-1 text-foreground-secondary transition-colors hover:bg-background-tertiary hover:text-foreground"
              title={t("explorer.search", "Search files")}
            >
              <Search className="size-3.5" strokeWidth={1.5} />
            </button>
            <button
              type="button"
              onClick={handleAddWorkspace}
              className="rounded-md p-1 text-foreground-secondary transition-colors hover:bg-background-tertiary hover:text-foreground"
              title={t("workspace.addFolder", "Add workspace")}
            >
              <Plus className="size-3.5" strokeWidth={1.5} />
            </button>
          </div>
        </div>

        {/* Search bar (below header) */}
        <FileTreeSearch
          searchOpen={searchOpen}
          searchQuery={searchQuery}
          setSearchQuery={setSearchQuery}
          closeSearch={handleCloseSearch}
          matchCount={totalMatchCount}
        />

        <ScrollArea className="min-h-0 flex-1">
          {realWorkspaces.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-3 p-6 text-center">
              <p className="text-[13px] text-foreground-tertiary">
                {t("workspace.noWorkspaces", "No workspaces added")}
              </p>
              <button
                type="button"
                onClick={handleAddWorkspace}
                className="flex items-center gap-2 rounded-lg px-3 py-2 text-[13px] text-foreground-secondary hover:bg-background-tertiary hover:text-foreground"
              >
                <FolderPlus className="size-4" strokeWidth={1.5} />
                {t("workspace.addFolder", "Add workspace folder")}
              </button>
            </div>
          ) : (
            <div className="pt-1 pb-2">
              {realWorkspaces.map((ws) => (
                <WorkspaceRootNode
                  key={ws.id}
                  workspace={ws}
                  selectedEntries={selectedEntryPaths}
                  onSelectFile={handleSelectFile}
                  onRemove={() => setRemoveTarget(ws)}
                  searchQuery={searchQuery}
                  onMatchCount={handleMatchCount}
                />
              ))}
            </div>
          )}
        </ScrollArea>
      </div>

      {/* Remove workspace confirmation */}
      <AlertDialog open={!!removeTarget} onOpenChange={(o) => { if (!o) setRemoveTarget(null); }}>
        <AlertDialogContent size="sm">
          <AlertDialogHeader>
            <AlertDialogTitle>{t("workspace.removeTitle", "Remove workspace")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t(
                "workspace.removeDescription",
                "Remove \"{{name}}\" from workspace list? Associated chat history will also be deleted. The folder itself is not affected.",
                { name: removeTarget?.name ?? "" },
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel", "Cancel")}</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={async () => {
                if (removeTarget) {
                  await removeWorkspace(removeTarget.id);
                  setActiveConversation(null);
                  useChatStore.getState().reset();
                  await useDataStore.getState().loadConversations();
                  setRemoveTarget(null);
                }
              }}
            >
              {t("workspace.remove", "Remove")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
