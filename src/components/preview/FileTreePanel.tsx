import { useCallback, useEffect, useRef, useState } from "react";
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
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  ChevronRight,
  ChevronDown,
  Folder,
  FolderOpen,
  File,
  FileCode,
  FileText,
  FileSpreadsheet,
  FileImage,
  FileVideoCamera,
  FileMusic,
  FileArchive,
  FileBraces,
  Eye,
  EyeOff,
  RefreshCw,
  Copy,
  FolderPlus,
  Pencil,
  FileUp,
  Link,
  Trash2,
  type LucideIcon,
} from "lucide-react";
import { useLayoutStore } from "@/stores/layoutStore";
import { cn } from "@/lib/utils";

/** 按扩展名映射到 Lucide 文件图标，统一使用 foreground-secondary 风格 */
const FILE_ICON_MAP: Record<string, LucideIcon> = {
  // 代码
  js: FileCode,
  jsx: FileCode,
  ts: FileCode,
  tsx: FileCode,
  mjs: FileCode,
  cjs: FileCode,
  py: FileCode,
  rb: FileCode,
  go: FileCode,
  rs: FileCode,
  java: FileCode,
  kt: FileCode,
  c: FileCode,
  cpp: FileCode,
  h: FileCode,
  hpp: FileCode,
  vue: FileCode,
  svelte: FileCode,
  swift: FileCode,
  sh: FileCode,
  bash: FileCode,
  zsh: FileCode,
  // 文档
  txt: FileText,
  md: FileText,
  mdx: FileText,
  doc: FileText,
  docx: FileText,
  rtf: FileText,
  pdf: FileText,
  // 表格
  xls: FileSpreadsheet,
  xlsx: FileSpreadsheet,
  csv: FileSpreadsheet,
  // 图片
  png: FileImage,
  jpg: FileImage,
  jpeg: FileImage,
  gif: FileImage,
  webp: FileImage,
  svg: FileImage,
  ico: FileImage,
  bmp: FileImage,
  // 视频 / 音频
  mp4: FileVideoCamera,
  webm: FileVideoCamera,
  mov: FileVideoCamera,
  mkv: FileVideoCamera,
  mp3: FileMusic,
  wav: FileMusic,
  ogg: FileMusic,
  m4a: FileMusic,
  // 压缩包
  zip: FileArchive,
  tar: FileArchive,
  gz: FileArchive,
  "7z": FileArchive,
  rar: FileArchive,
  // 数据 / 配置
  json: FileBraces,
  yaml: FileBraces,
  yml: FileBraces,
};

function getFileIcon(path: string, className: string, strokeWidth: number): React.ReactNode {
  const ext = path.split(".").pop()?.toLowerCase() ?? "";
  const Icon = FILE_ICON_MAP[ext] ?? File;
  return <Icon className={className} strokeWidth={strokeWidth} />;
}

export interface ListDirEntry {
  name: string;
  path: string;
  isDir: boolean;
  mtimeSecs: number;
}

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

function FileTreeItem({
  entry,
  workspaceRoot,
  selectedPath,
  expandedDirs,
  loadedChildren,
  editingPath,
  onToggleExpand,
  onSelectFile,
  onLoadChildren,
  onNewFolder,
  onRename,
  onRevealInFinder,
  onCopyRelativePath,
  onCopyAbsolutePath,
  onDelete,
  onRenameSubmit,
  onRenameCancel,
}: {
  entry: ListDirEntry;
  workspaceRoot: string;
  selectedPath: string | null;
  expandedDirs: Set<string>;
  loadedChildren: Record<string, ListDirEntry[]>;
  editingPath: string | null;
  onToggleExpand: (path: string) => void;
  onSelectFile: (path: string) => void;
  onLoadChildren: (path: string, entries: ListDirEntry[]) => void;
  onNewFolder: (parentPath: string) => void;
  onRename: (path: string) => void;
  onRevealInFinder: (path: string) => void;
  onCopyRelativePath: (path: string) => void;
  onCopyAbsolutePath: (path: string) => void;
  onDelete: (path: string, name: string) => void;
  onRenameSubmit: (path: string, newName: string) => void;
  onRenameCancel: () => void;
}) {
  const { t } = useTranslation();
  const isDir = entry.isDir;
  const path = entry.path;
  const isSelected = selectedPath === path;
  const isExpanded = expandedDirs.has(path);
  const children = loadedChildren[path];
  const isEditing = editingPath === path;
  const inputRef = useRef<HTMLInputElement>(null);

  const handleClick = useCallback(() => {
    if (isEditing) return;
    if (isDir) {
      onToggleExpand(path);
    } else {
      onSelectFile(path);
    }
  }, [isDir, isEditing, path, onToggleExpand, onSelectFile]);

  const handleExpandClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      if (!isDir) return;
      onToggleExpand(path);
    },
    [isDir, path, onToggleExpand],
  );

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);

  const parentPath = path.includes("/") ? path.replace(/\/[^/]+$/, "") : "";

  const rowContent = (
    <>
      <span
        className="flex w-4 shrink-0 items-center justify-center"
        onClick={handleExpandClick}
        onKeyDown={(e) => e.key === "Enter" && handleExpandClick(e as unknown as React.MouseEvent)}
      >
        {isDir ? (
          isExpanded ? (
            <ChevronDown className="size-3.5 text-muted-foreground" strokeWidth={1.5} />
          ) : (
            <ChevronRight className="size-3.5 text-muted-foreground" strokeWidth={1.5} />
          )
        ) : (
          <span className="w-3.5" />
        )}
      </span>
      <span className="flex shrink-0 items-center justify-center">
        {isDir ? (
          isExpanded ? (
            <FolderOpen className="size-4 text-foreground-secondary" strokeWidth={1.5} />
          ) : (
            <Folder className="size-4 text-foreground-secondary" strokeWidth={1.5} />
          )
        ) : (
          getFileIcon(path, "size-4 text-foreground-secondary", 1.5)
        )}
      </span>
      {isEditing ? (
        <input
          ref={inputRef}
          type="text"
          defaultValue={entry.name}
          className="min-w-0 flex-1 truncate rounded border border-border bg-background px-1 py-0 text-[13px] outline-none focus:ring-1 focus:ring-accent"
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              const v = (e.target as HTMLInputElement).value.trim();
              if (v) onRenameSubmit(path, v);
            } else if (e.key === "Escape") {
              onRenameCancel();
            }
          }}
          onBlur={(e) => {
            const v = e.target.value.trim();
            if (v) onRenameSubmit(path, v);
            else onRenameCancel();
          }}
          onClick={(e) => e.stopPropagation()}
        />
      ) : (
        <span className="min-w-0 truncate">{entry.name}</span>
      )}
    </>
  );

  return (
    <div className="select-none relative">
      {isSelected && (
        <div
          className="absolute left-1 right-1 top-0 bottom-0 rounded-[2px] bg-background-tertiary pointer-events-none -z-[1]"
          aria-hidden
        />
      )}
      <ContextMenu>
        <ContextMenuTrigger asChild>
          <button
            type="button"
            onClick={handleClick}
            className={cn(
              "relative flex w-full items-center gap-1.5 rounded-[2px] mx-1 px-2 py-1 text-left text-[13px]",
              isSelected ? "font-medium text-foreground" : "text-foreground-secondary hover:bg-background-tertiary hover:text-foreground",
            )}
          >
            {rowContent}
          </button>
        </ContextMenuTrigger>
        <ContextMenuContent className="w-48 rounded-lg border border-border shadow-lg">
          <ContextMenuItem className="gap-2 text-[13px]" onClick={() => onNewFolder(isDir ? path : parentPath)}>
            <FolderPlus className="size-4" strokeWidth={1.5} />
            {t("explorer.newFolder")}
          </ContextMenuItem>
          <ContextMenuSeparator />
          <ContextMenuItem className="gap-2 text-[13px]" onClick={() => onRename(path)}>
            <Pencil className="size-4" strokeWidth={1.5} />
            {t("explorer.rename")}
          </ContextMenuItem>
          <ContextMenuItem className="gap-2 text-[13px]" onClick={() => onRevealInFinder(path)}>
            <FileUp className="size-4" strokeWidth={1.5} />
            {t("explorer.revealInFinder")}
          </ContextMenuItem>
          <ContextMenuSeparator />
          <ContextMenuItem className="gap-2 text-[13px]" onClick={() => onCopyRelativePath(path)}>
            <Copy className="size-4" strokeWidth={1.5} />
            {t("explorer.copyRelativePath")}
          </ContextMenuItem>
          <ContextMenuItem className="gap-2 text-[13px]" onClick={() => onCopyAbsolutePath(path)}>
            <Link className="size-4" strokeWidth={1.5} />
            {t("explorer.copyAbsolutePath")}
          </ContextMenuItem>
          <ContextMenuSeparator />
          <ContextMenuItem
            variant="destructive"
            className="gap-2 text-[13px]"
            onClick={() => onDelete(path, entry.name)}
          >
            <Trash2 className="size-4" strokeWidth={1.5} />
            {t("explorer.delete")}
          </ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>
      {isDir && isExpanded && children !== undefined && (
        <div className="ml-4 pl-1">
          {children.map((child) => (
            <FileTreeItem
              key={child.path}
              entry={child}
              workspaceRoot={workspaceRoot}
              selectedPath={selectedPath}
              expandedDirs={expandedDirs}
              loadedChildren={loadedChildren}
              editingPath={editingPath}
              onToggleExpand={onToggleExpand}
              onSelectFile={onSelectFile}
              onLoadChildren={onLoadChildren}
              onNewFolder={onNewFolder}
              onRename={onRename}
              onRevealInFinder={onRevealInFinder}
              onCopyRelativePath={onCopyRelativePath}
              onCopyAbsolutePath={onCopyAbsolutePath}
              onDelete={onDelete}
              onRenameSubmit={onRenameSubmit}
              onRenameCancel={onRenameCancel}
            />
          ))}
        </div>
      )}
    </div>
  );
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
  const [deleteTarget, setDeleteTarget] = useState<{ path: string; name: string } | null>(null);
  const [newFolderParentPath, setNewFolderParentPath] = useState<string | null>(null);
  const [newFolderName, setNewFolderName] = useState("");
  const [newFolderError, setNewFolderError] = useState<string | null>(null);

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

  // 根据当前选中或「上次打开的目录」保持该目录及其祖先展开，便于删除/刷新后仍定位到原目录
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

  // 静默刷新：批量拉取后一次性更新，避免多次 setState 导致整棵树闪
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

  // 实时更新文件树：create/remove/rename 时静默重拉受影响目录并一次性更新，不先清缓存避免闪烁
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

  const onNewFolder = useCallback((parentPath: string) => {
    setNewFolderParentPath(parentPath);
    setNewFolderName("");
    setNewFolderError(null);
  }, []);
  const handleNewFolderConfirm = useCallback(() => {
    const name = newFolderName.trim();
    if (!name || !workspaceRoot || newFolderParentPath === null) return;
    setNewFolderError(null);
    const parentPath = newFolderParentPath;
    invoke("create_dir", { args: { workspaceRoot, path: parentPath, name } })
      .then(() => {
        setNewFolderParentPath(null);
        setNewFolderName("");
        setNewFolderError(null);
        if (parentPath) {
          setExpandedDirs((prev) => new Set([...prev, parentPath]));
        }
      })
      .catch((err: unknown) => {
        const msg = typeof err === "object" && err != null && "message" in err ? String((err as { message: string }).message) : String(err);
        const isAlreadyExists = /already exists|已存在/i.test(msg);
        setNewFolderError(isAlreadyExists ? t("explorer.folderAlreadyExists") : msg);
      });
  }, [workspaceRoot, newFolderParentPath, newFolderName, t]);
  const handleNewFolderCancel = useCallback(() => {
    setNewFolderParentPath(null);
    setNewFolderName("");
    setNewFolderError(null);
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
  const onDelete = useCallback((path: string, name: string) => setDeleteTarget({ path, name }), []);
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
  const handleConfirmDelete = useCallback(() => {
    if (!deleteTarget || !workspaceRoot) return;
    invoke("remove_entry", { args: { workspaceRoot, path: deleteTarget.path } }).finally(() => {
      setDeleteTarget(null);
      if (selectedPath === deleteTarget.path) setSelected(null);
    });
  }, [deleteTarget, workspaceRoot, selectedPath, setSelected]);

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
                onNewFolder={onNewFolder}
                onRename={onRename}
                onRevealInFinder={onRevealInFinder}
                onCopyRelativePath={onCopyRelativePath}
                onCopyAbsolutePath={onCopyAbsolutePath}
                onDelete={onDelete}
                onRenameSubmit={onRenameSubmit}
                onRenameCancel={onRenameCancel}
              />
            ))
              )}
            </div>
          </ContextMenuTrigger>
          <ContextMenuContent className="w-48 rounded-lg border border-border shadow-lg">
            <ContextMenuItem className="gap-2 text-[13px]" onClick={() => onNewFolder("")}>
              <FolderPlus className="size-4" strokeWidth={1.5} />
              {t("explorer.newFolder")}
            </ContextMenuItem>
          </ContextMenuContent>
        </ContextMenu>
      </ScrollArea>

      <AlertDialog open={!!deleteTarget} onOpenChange={(v) => { if (!v) setDeleteTarget(null); }}>
        <AlertDialogContent size="sm">
          <AlertDialogHeader>
            <AlertDialogTitle>{t("explorer.deleteConfirmTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("explorer.deleteConfirmDescription", { name: deleteTarget?.name ?? "" })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("workspace.cancel")}</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={handleConfirmDelete}>
              {t("explorer.delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={newFolderParentPath !== null} onOpenChange={(open) => { if (!open) handleNewFolderCancel(); }}>
        <DialogContent className="sm:max-w-xs rounded" hideOverlay>
          <DialogHeader>
            <DialogTitle>{t("explorer.newFolder")}</DialogTitle>
          </DialogHeader>
          <Input
            value={newFolderName}
            onChange={(e) => {
              setNewFolderName(e.target.value);
              setNewFolderError(null);
            }}
            placeholder={t("explorer.newFolder")}
            className="rounded shadow-none focus-visible:ring-0 focus-visible:ring-offset-0"
            onKeyDown={(e) => {
              if (e.key === "Enter") handleNewFolderConfirm();
              if (e.key === "Escape") handleNewFolderCancel();
            }}
          />
          {newFolderError && (
            <p className="text-[12px] -mt-2 -mb-2 text-destructive">{newFolderError}</p>
          )}
          <DialogFooter>
            <Button variant="outline" className="rounded" onClick={handleNewFolderCancel}>
              {t("workspace.cancel")}
            </Button>
            <Button variant="brand" className="rounded" onClick={handleNewFolderConfirm} disabled={!newFolderName.trim()}>
              {t("explorer.create")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
