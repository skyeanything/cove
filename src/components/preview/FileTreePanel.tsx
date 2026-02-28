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
} from "lucide-react";
import { useLayoutStore } from "@/stores/layoutStore";
import { useFileTreeDialogs } from "@/hooks/useFileTreeDialogs";
import { FileTreeItem } from "./FileTreeItem";
import { FileTreeDialogs } from "./FileTreeDialogs";
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
  const workspaceRoot = activeWorkspace?.path ?? null;
  const selectedPath = useFilePreviewStore((s) => s.selectedPath);
  const lastOpenedDirPath = useFilePreviewStore((s) => s.lastOpenedDirPath);
  const setSelected = useFilePreviewStore((s) => s.setSelected);
  const fileTreeShowHidden = useLayoutStore((s) => s.fileTreeShowHidden);
  const setFileTreeShowHidden = useLayoutStore((s) => s.setFileTreeShowHidden);

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

  if (!workspaceRoot) {
    return (
      <div className="flex h-full flex-col overflow-hidden bg-background">
        <div className="flex flex-1 items-center justify-center p-4 text-center text-sm text-muted-foreground">
          {t("preview.selectWorkspace")}
        </div>
      </div>
    );
  }

  return (
    <div className="file-preview-tree flex h-full min-h-0 flex-col overflow-hidden bg-background">
      <div className="flex h-10 shrink-0 items-center justify-between gap-2 border-b border-border bg-background px-3">
        <span className="text-[12px] font-medium uppercase tracking-wider text-foreground-secondary">
          {t("preview.explorer")}
        </span>
        <div className="flex items-center gap-0.5">
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
      <ScrollArea className="min-h-0 flex-1">
        <ContextMenu>
          <ContextMenuTrigger asChild>
            <div className="min-h-full px-3 pt-3 pb-2">
              {rootEntries === null ? (
                <div className="py-2 text-center text-[13px] text-muted-foreground">{t("preview.loading")}</div>
              ) : rootEntries.length === 0 ? (
                <div className="py-2 text-center text-[13px] text-muted-foreground">{t("preview.emptyDir")}</div>
              ) : (
                rootEntries.map((entry) => (
              <FileTreeItem
                key={entry.path}
                entry={entry}
                workspaceRoot={workspaceRoot}
                selectedPath={selectedPath}
                expandedDirs={expandedDirs}
                loadedChildren={loadedChildren}
                editingPath={editingPath}
                onToggleExpand={onToggleExpand}
                onSelectFile={setSelected}
                onLoadChildren={onLoadChildren}
                onNewFolder={dialogs.onNewFolder}
                onRename={onRename}
                onRevealInFinder={onRevealInFinder}
                onCopyRelativePath={onCopyRelativePath}
                onCopyAbsolutePath={onCopyAbsolutePath}
                onDelete={dialogs.onDelete}
                onRenameSubmit={onRenameSubmit}
                onRenameCancel={onRenameCancel}
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
  );
}
