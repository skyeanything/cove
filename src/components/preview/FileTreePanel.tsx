// FILE_SIZE_EXCEPTION: FileTreePanel handles complex workspace file tree logic (navigation, search, context menus, drag-drop); scheduled for modular refactor.
import { useCallback, useEffect, useState } from "react";
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
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import {
  Eye,
  EyeOff,
  RefreshCw,
  FolderPlus,
  FolderOpen,
  Search,
  Clipboard,
  ChevronDown,
  ChevronLeft,
  Check,
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
import { useFileTreeSearch } from "@/hooks/useFileTreeSearch";
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
  const entries = await invoke<ListDirEntry[]>("list_dir", {
    args: { workspaceRoot, path: path || "", includeHidden },
  });
  return entries;
}

/** 工作区根 + 相对路径 => 绝对路径 */
function toAbsolutePath(workspaceRoot: string, path: string): string {
  if (!path) return workspaceRoot;
  return `${workspaceRoot}/${path}`.replace(/\/+/g, "/");
}

export function FileTreePanel() {
  const { t } = useTranslation();
  const activeWorkspace = useWorkspaceStore((s) => s.activeWorkspace);
  const workspaces = useWorkspaceStore((s) => s.workspaces);
  const selectWorkspace = useWorkspaceStore((s) => s.select);
  const addWorkspace = useWorkspaceStore((s) => s.add);
  const removeWorkspace = useWorkspaceStore((s) => s.remove);
  const workspaceRoot = activeWorkspace?.path ?? null;
  const selectedPath = useFilePreviewStore((s) => s.selectedPath);
  const lastOpenedDirPath = useFilePreviewStore((s) => s.lastOpenedDirPath);
  const setSelected = useFilePreviewStore((s) => s.setSelected);
  const pendingExpandPath = useFilePreviewStore((s) => s.pendingExpandPath);
  const setPendingExpandPath = useFilePreviewStore((s) => s.setPendingExpandPath);
  const fileTreeShowHidden = useLayoutStore((s) => s.fileTreeShowHidden);
  const setFileTreeShowHidden = useLayoutStore((s) => s.setFileTreeShowHidden);
  const workspaceSelectorOpen = useLayoutStore((s) => s.workspaceSelectorOpen);
  const setWorkspaceSelectorOpen = useLayoutStore((s) => s.setWorkspaceSelectorOpen);
  const setActiveConversation = useDataStore((s) => s.setActiveConversation);

  const [wsDropdownOpen, setWsDropdownOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Workspace | null>(null);

  const [rootEntries, setRootEntries] = useState<ListDirEntry[] | null>(null);
  const [rootLoaded, setRootLoaded] = useState(false);
  const [expandedDirs, setExpandedDirs] = useState<Set<string>>(new Set());
  const [loadedChildren, setLoadedChildren] = useState<Record<string, ListDirEntry[]>>({});
  const [editingPath, setEditingPath] = useState<string | null>(null);

  const dialogs = useFileTreeDialogs({
    workspaceRoot,
    selectedPath,
    setSelected,
    setExpandedDirs,
    t,
  });

  const dnd = useFileTreeDnD({ workspaceRoot });
  const search = useFileTreeSearch(rootEntries, loadedChildren);
  const clipboard = useFileClipboard(workspaceRoot);

  const loadRoot = useCallback(() => {
    if (!workspaceRoot) return;
    setRootLoaded(true);
    listDir(workspaceRoot, "", fileTreeShowHidden).then(setRootEntries).catch(() => setRootEntries([]));
  }, [workspaceRoot, fileTreeShowHidden]);

  // workspaceRoot 或 showHidden 变化时重置并重新加载
  useEffect(() => {
    setRootEntries(null);
    setRootLoaded(false);
    setExpandedDirs(new Set());
    setLoadedChildren({});
  }, [workspaceRoot, fileTreeShowHidden]);

  useEffect(() => {
    if (workspaceRoot && !rootLoaded) loadRoot();
  }, [workspaceRoot, rootLoaded, loadRoot]);

  // 展开目录时懒加载子项
  useEffect(() => {
    if (!workspaceRoot) return;
    const toLoad = [...expandedDirs].filter((p) => loadedChildren[p] === undefined);
    toLoad.forEach((dirPath) => {
      listDir(workspaceRoot, dirPath, fileTreeShowHidden).then((entries) => {
        setLoadedChildren((prev) => ({ ...prev, [dirPath]: entries }));
      }).catch(() => {
        setLoadedChildren((prev) => ({ ...prev, [dirPath]: [] }));
      });
    });
  }, [workspaceRoot, expandedDirs, fileTreeShowHidden]);

  // 根据当前选中或「上次打开的目录」保持该目录及其祖先展开
  useEffect(() => {
    const focusDir = selectedPath ? dirOfPath(selectedPath) : lastOpenedDirPath;
    if (!focusDir) return;
    setExpandedDirs((prev) => {
      const next = new Set(prev);
      const parts = focusDir.split("/").filter(Boolean);
      for (let i = 0; i < parts.length; i++) next.add(parts.slice(0, i + 1).join("/"));
      return next;
    });
  }, [selectedPath, lastOpenedDirPath]);

  // Handle breadcrumb navigation: expand ancestors of pending path
  useEffect(() => {
    if (!pendingExpandPath) return;
    setExpandedDirs((prev) => {
      const next = new Set(prev);
      const parts = pendingExpandPath.split("/").filter(Boolean);
      for (let i = 0; i < parts.length; i++) {
        next.add(parts.slice(0, i + 1).join("/"));
      }
      return next;
    });
    setPendingExpandPath(null);
  }, [pendingExpandPath, setPendingExpandPath]);

  // 静默刷新：批量拉取后一次性更新
  const handleRefresh = useCallback(() => {
    if (!workspaceRoot) return;
    const dirs = [...expandedDirs];
    Promise.all([
      listDir(workspaceRoot, "", fileTreeShowHidden).catch(() => []),
      ...dirs.map((dirPath) =>
        listDir(workspaceRoot, dirPath, fileTreeShowHidden).catch(() => []),
      ),
    ]).then(([rootList, ...dirLists]) => {
      setRootEntries(rootList);
      setLoadedChildren((prev) => {
        const next = { ...prev };
        dirs.forEach((dirPath, i) => {
          next[dirPath] = dirLists[i] ?? [];
        });
        return next;
      });
    });
  }, [workspaceRoot, fileTreeShowHidden, expandedDirs]);

  // 实时更新文件树：create/remove/rename 时静默重拉受影响目录
  useEffect(() => {
    const unlistenPromise = listen<{ path: string; kind: string }>(
      "workspace-file-changed",
      (event) => {
        const { path, kind } = event.payload ?? {};
        if (!path || !["create", "remove", "rename"].includes(kind)) return;
        const workspaceRootNow = useWorkspaceStore.getState().activeWorkspace?.path ?? null;
        if (!workspaceRootNow) return;
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
          if (parent === "") {
            setRootEntries(entries);
          } else {
            setLoadedChildren((prev) => ({ ...prev, [parent]: entries }));
          }
        };

        listDir(workspaceRootNow, parent, showHidden)
          .then(updateParent)
          .catch(() => updateParent([]));
      },
    );
    return () => {
      unlistenPromise.then((u) => u());
    };
  }, []);

  const onToggleExpand = useCallback((path: string) => {
    setExpandedDirs((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  }, []);

  const onLoadChildren = useCallback((path: string, entries: ListDirEntry[]) => {
    setLoadedChildren((prev) => ({ ...prev, [path]: entries }));
  }, []);

  const copyToClipboard = useCallback((text: string) => {
    void navigator.clipboard.writeText(text);
  }, []);

  const onRename = useCallback((path: string) => setEditingPath(path), []);
  const onRevealInFinder = useCallback(
    (path: string) => {
      if (!workspaceRoot) return;
      invoke("reveal_in_finder", { args: { workspaceRoot, path } }).catch(() => {});
    },
    [workspaceRoot],
  );
  const onCopyRelativePath = useCallback((path: string) => copyToClipboard(path), [copyToClipboard]);
  const onCopyAbsolutePath = useCallback(
    (path: string) => {
      if (!workspaceRoot) return;
      copyToClipboard(toAbsolutePath(workspaceRoot, path));
    },
    [workspaceRoot, copyToClipboard],
  );
  const onRenameSubmit = useCallback(
    (path: string, newName: string) => {
      const currentName = path.split("/").pop() ?? path;
      if (!workspaceRoot || newName === currentName) {
        setEditingPath(null);
        return;
      }
      const parent = path.includes("/") ? path.replace(/\/[^/]+$/, "") : "";
      const toPath = parent ? `${parent}/${newName}` : newName;
      invoke("move_file", { args: { workspaceRoot, fromPath: path, toPath } }).finally(() => setEditingPath(null));
    },
    [workspaceRoot],
  );
  const onRenameCancel = useCallback(() => setEditingPath(null), []);

  const needSelector = workspaceSelectorOpen || !workspaceRoot;

  const handleAddWorkspace = async () => {
    try {
      const selected = await openDialog({ directory: true, multiple: false });
      if (typeof selected === "string" && selected) {
        const ws = await addWorkspace(selected);
        setActiveConversation(null);
        useChatStore.getState().reset();
        await selectWorkspace(ws.id, null);
        setWorkspaceSelectorOpen(false);
      }
    } catch {
      // cancelled
    }
  };

  if (needSelector) {
    return (
      <>
        <div className="flex h-full flex-col overflow-hidden bg-background">
          <div className="flex h-8 shrink-0 items-center border-b border-border px-3">
            <span className="text-[12px] font-medium text-foreground-secondary">
              {t("workspace.selectWorkspace", "选择工作区")}
            </span>
          </div>
          <ScrollArea className="min-h-0 flex-1">
            <div className="p-2 space-y-0.5">
              {workspaces.map((ws) => (
                <div key={ws.id} className="group flex items-center gap-1">
                  <button
                    type="button"
                    onClick={async () => {
                      setActiveConversation(null);
                      useChatStore.getState().reset();
                      await selectWorkspace(ws.id, null);
                      setWorkspaceSelectorOpen(false);
                    }}
                    className="flex flex-1 items-center gap-2.5 rounded-lg px-3 py-2 text-[13px] text-foreground hover:bg-accent"
                  >
                    <FolderOpen className="size-4 shrink-0 text-muted-foreground" strokeWidth={1.5} />
                    <span className="truncate">{ws.name}</span>
                    {ws.is_default === 1 && (
                      <span className="ml-auto shrink-0 text-[11px] text-muted-foreground">
                        {t("workspace.default", "默认")}
                      </span>
                    )}
                  </button>
                  {ws.is_default !== 1 && (
                    <button
                      type="button"
                      onClick={() => setDeleteTarget(ws)}
                      className="mr-1 hidden rounded p-1 text-muted-foreground hover:text-destructive group-hover:block"
                      title={t("workspace.delete", "删除工作区")}
                    >
                      <Trash2 className="size-3.5" strokeWidth={1.5} />
                    </button>
                  )}
                </div>
              ))}
            </div>
            <div className="mx-3 my-1 border-t border-border" />
            <button
              type="button"
              onClick={handleAddWorkspace}
              className="flex w-full items-center gap-2.5 px-5 py-2 text-[13px] text-muted-foreground hover:bg-accent hover:text-foreground"
            >
              <FolderPlus className="size-4 shrink-0" strokeWidth={1.5} />
              {t("workspace.addFolder", "添加工作区文件夹")}
            </button>
          </ScrollArea>
        </div>

        {/* Delete confirmation dialog */}
        <AlertDialog open={!!deleteTarget} onOpenChange={(o) => { if (!o) setDeleteTarget(null); }}>
          <AlertDialogContent size="sm">
            <AlertDialogHeader>
              <AlertDialogTitle>{t("workspace.deleteTitle", "删除工作区")}</AlertDialogTitle>
              <AlertDialogDescription>
                {t("workspace.deleteDesc", "删除工作区「{{name}}」后，相关的历史会话记录也会被删除，此操作不可撤销。", { name: deleteTarget?.name ?? "" })}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>{t("common.cancel", "取消")}</AlertDialogCancel>
              <AlertDialogAction
                variant="destructive"
                onClick={async () => {
                  if (deleteTarget) {
                    await removeWorkspace(deleteTarget.id);
                    setActiveConversation(null);
                    useChatStore.getState().reset();
                    await useDataStore.getState().loadConversations();
                    setDeleteTarget(null);
                  }
                }}
              >
                {t("common.delete", "删除")}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </>
    );
  }

  return (
    <>
    <div
      className="file-preview-tree flex h-full min-h-0 flex-col overflow-hidden bg-background"
      tabIndex={-1}
      onKeyDown={(e) => {
        if ((e.metaKey || e.ctrlKey) && e.key === "f") {
          e.preventDefault();
          search.openSearch();
          return;
        }
        if (!selectedPath) return;
        if ((e.metaKey || e.ctrlKey) && e.key === "c") {
          e.preventDefault();
          clipboard.onCopy(selectedPath);
        } else if ((e.metaKey || e.ctrlKey) && e.key === "x") {
          e.preventDefault();
          clipboard.onCut(selectedPath);
        } else if ((e.metaKey || e.ctrlKey) && e.key === "v" && clipboard.sourcePath) {
          e.preventDefault();
          const pasteTarget = lastOpenedDirPath ?? "";
          void clipboard.onPaste(pasteTarget);
        }
      }}
    >
      <div
        className="relative flex h-8 shrink-0 items-center justify-between gap-2 border-b border-border bg-background px-3"
      >
        {/* 返回按钮 + 工作区选择器 */}
        <div className="flex min-w-0 items-center gap-0.5">
          <button
            type="button"
            onClick={() => setWorkspaceSelectorOpen(true)}
            className="shrink-0 rounded p-0.5 text-muted-foreground hover:bg-background-tertiary hover:text-foreground"
            title={t("workspace.backToList", "返回工作区列表")}
          >
            <ChevronLeft className="size-3.5" strokeWidth={1.5} />
          </button>
          <button
            type="button"
            onClick={() => setWsDropdownOpen((o) => !o)}
            className="flex min-w-0 items-center gap-1 rounded px-1 py-0.5 hover:bg-background-tertiary"
            title={t("workspace.switchWorkspace", "切换工作区")}
          >
            <span className="max-w-[120px] truncate text-[12px] font-medium text-foreground-secondary">
              {activeWorkspace?.name ?? t("preview.explorer")}
            </span>
            <ChevronDown className="size-3 shrink-0 text-muted-foreground" strokeWidth={1.5} />
          </button>
        </div>

        {/* 工作区下拉菜单 */}
        {wsDropdownOpen && (
          <>
            {/* 点击外部关闭 */}
            <div
              className="fixed inset-0 z-40"
              onClick={() => setWsDropdownOpen(false)}
            />
            <div className="absolute left-2 top-10 z-50 min-w-[200px] rounded-lg border border-border bg-popover py-1 shadow-lg">
              {workspaces.map((ws) => {
                const isActive = activeWorkspace?.id === ws.id;
                return (
                  <div key={ws.id} className="group flex items-center">
                    <button
                      type="button"
                      onClick={async () => {
                        setActiveConversation(null);
                        useChatStore.getState().reset();
                        await selectWorkspace(ws.id, null);
                        setWsDropdownOpen(false);
                      }}
                      className="flex flex-1 items-center gap-2 px-3 py-2 text-[13px] hover:bg-accent"
                    >
                      {isActive ? (
                        <Check className="size-3.5 text-brand" strokeWidth={2} />
                      ) : (
                        <span className="size-3.5" />
                      )}
                      <span className="flex-1 truncate text-left">{ws.name}</span>
                    </button>
                    {!ws.is_default && (
                      <button
                        type="button"
                        onClick={() => {
                          setDeleteTarget(ws);
                          setWsDropdownOpen(false);
                        }}
                        className="mr-2 hidden rounded p-1 text-muted-foreground hover:text-destructive group-hover:block"
                        title={t("workspace.delete", "删除")}
                      >
                        <Trash2 className="size-3.5" strokeWidth={1.5} />
                      </button>
                    )}
                  </div>
                );
              })}
              <div className="mx-2 my-1 border-t border-border" />
              <button
                type="button"
                onClick={async () => {
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
                  setWsDropdownOpen(false);
                }}
                className="flex w-full items-center gap-2 px-3 py-2 text-[13px] text-muted-foreground hover:bg-accent hover:text-foreground"
              >
                <FolderPlus className="size-3.5" strokeWidth={1.5} />
                {t("workspace.addFolder", "添加工作区文件夹")}
              </button>
            </div>
          </>
        )}

        <div className="flex items-center gap-0.5">
          <button
            type="button"
            onClick={search.openSearch}
            className="rounded p-1.5 text-muted-foreground hover:bg-background-tertiary hover:text-foreground"
            title={t("preview.searchFiles")}
          >
            <Search className="size-3.5" strokeWidth={1.5} />
          </button>
          <button
            type="button"
            onClick={() => setFileTreeShowHidden(!fileTreeShowHidden)}
            className="rounded p-1.5 text-muted-foreground hover:bg-background-tertiary hover:text-foreground"
            title={fileTreeShowHidden ? t("preview.hideHidden") : t("preview.showHidden")}
          >
            {fileTreeShowHidden ? (
              <Eye className="size-3.5" strokeWidth={1.5} />
            ) : (
              <EyeOff className="size-3.5" strokeWidth={1.5} />
            )}
          </button>
          <button
            type="button"
            onClick={handleRefresh}
            className="rounded p-1.5 text-muted-foreground hover:bg-background-tertiary hover:text-foreground"
            title={t("preview.refreshDir")}
          >
            <RefreshCw className="size-3.5" strokeWidth={1.5} />
          </button>
        </div>
      </div>
      <FileTreeSearch
        searchOpen={search.searchOpen}
        searchQuery={search.searchQuery}
        setSearchQuery={search.setSearchQuery}
        closeSearch={search.closeSearch}
        matchCount={search.matchCount}
      />
      <ScrollArea className="min-h-0 flex-1">
        <ContextMenu>
          <ContextMenuTrigger asChild>
            <div
              className="min-h-full px-3 pt-3 pb-2"
              onDragOver={dnd.onRootDragOver}
              onDrop={dnd.onRootDrop}
            >
              {search.filteredRootEntries === null ? (
                <div className="py-2 text-center text-[13px] text-muted-foreground">{t("preview.loading")}</div>
              ) : search.filteredRootEntries.length === 0 ? (
                <div className="py-2 text-center text-[13px] text-muted-foreground">{t("preview.emptyDir")}</div>
              ) : (
                search.filteredRootEntries.map((entry) => (
                  <FileTreeItem
                    key={entry.path}
                    entry={entry}
                    workspaceRoot={workspaceRoot}
                    selectedPath={selectedPath}
                    expandedDirs={expandedDirs}
                    loadedChildren={loadedChildren}
                    editingPath={editingPath}
                    clipboardSourcePath={clipboard.sourcePath}
                    clipboardMode={clipboard.mode}
                    onToggleExpand={onToggleExpand}
                    onSelectFile={setSelected}
                    onLoadChildren={onLoadChildren}
                    onNewFolder={dialogs.onNewFolder}
                    onCopy={clipboard.onCopy}
                    onCut={clipboard.onCut}
                    onPaste={clipboard.onPaste}
                    onRename={onRename}
                    onRevealInFinder={onRevealInFinder}
                    onCopyRelativePath={onCopyRelativePath}
                    onCopyAbsolutePath={onCopyAbsolutePath}
                    onDelete={dialogs.onDelete}
                    onRenameSubmit={onRenameSubmit}
                    onRenameCancel={onRenameCancel}
                    draggedPath={dnd.draggedPath}
                    dropTargetPath={dnd.dropTargetPath}
                    onDnDStart={dnd.onDragStart}
                    onDnDEnd={dnd.onDragEnd}
                    onDnDOver={dnd.onDragOver}
                    onDnDLeave={dnd.onDragLeave}
                    onDnDDrop={dnd.onDrop}
                  />
                ))
              )}
            </div>
          </ContextMenuTrigger>
          <ContextMenuContent className="w-48 rounded-lg border border-border shadow-lg">
            <ContextMenuItem className="gap-2 text-[13px]" onClick={() => dialogs.onNewFolder("")}>
              <FolderPlus className="size-4" strokeWidth={1.5} />
              {t("explorer.newFolder")}
            </ContextMenuItem>
            {clipboard.sourcePath && (
              <ContextMenuItem className="gap-2 text-[13px]" onClick={() => void clipboard.onPaste("")}>
                <Clipboard className="size-4" strokeWidth={1.5} />
                {t("explorer.paste")}
              </ContextMenuItem>
            )}
          </ContextMenuContent>
        </ContextMenu>
      </ScrollArea>

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
        t={t}
      />
    </div>

    {/* Workspace delete confirmation dialog (also used from header dropdown) */}
    <AlertDialog open={!!deleteTarget} onOpenChange={(o) => { if (!o) setDeleteTarget(null); }}>
      <AlertDialogContent size="sm">
        <AlertDialogHeader>
          <AlertDialogTitle>{t("workspace.deleteTitle", "删除工作区")}</AlertDialogTitle>
          <AlertDialogDescription>
            {t("workspace.deleteDesc", "删除工作区「{{name}}」后，相关的历史会话记录也会被删除，此操作不可撤销。", { name: deleteTarget?.name ?? "" })}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{t("common.cancel", "取消")}</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            onClick={async () => {
              if (deleteTarget) {
                await removeWorkspace(deleteTarget.id);
                setActiveConversation(null);
                useChatStore.getState().reset();
                await useDataStore.getState().loadConversations();
                setDeleteTarget(null);
              }
            }}
          >
            {t("common.delete", "删除")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
    </>
  );
}
