import { useCallback, useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import {
  ChevronRight,
  ChevronDown,
  Folder,
  FolderOpen,
  FolderPlus,
  Pencil,
  FileUp,
  Copy,
  Link,
  Trash2,
  Scissors,
  Clipboard,
} from "lucide-react";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { cn } from "@/lib/utils";
import { getFileIcon } from "@/lib/file-tree-icons";

export interface ListDirEntry {
  name: string;
  path: string;
  isDir: boolean;
  mtimeSecs: number;
}

export function FileTreeItem({
  entry,
  workspaceRoot,
  selectedPath,
  expandedDirs,
  loadedChildren,
  editingPath,
  clipboardSourcePath,
  clipboardMode,
  onToggleExpand,
  onSelectFile,
  onLoadChildren,
  onNewFolder,
  onCopy,
  onCut,
  onPaste,
  onRename,
  onRevealInFinder,
  onCopyRelativePath,
  onCopyAbsolutePath,
  onDelete,
  onRenameSubmit,
  onRenameCancel,
  draggedPath,
  dropTargetPath,
  onDnDStart,
  onDnDEnd,
  onDnDOver,
  onDnDLeave,
  onDnDDrop,
}: {
  entry: ListDirEntry;
  workspaceRoot: string;
  selectedPath: string | null;
  expandedDirs: Set<string>;
  loadedChildren: Record<string, ListDirEntry[]>;
  editingPath: string | null;
  clipboardSourcePath?: string | null;
  clipboardMode?: "copy" | "cut" | null;
  onToggleExpand: (path: string) => void;
  onSelectFile: (path: string) => void;
  onLoadChildren: (path: string, entries: ListDirEntry[]) => void;
  onNewFolder: (parentPath: string) => void;
  onCopy?: (path: string) => void;
  onCut?: (path: string) => void;
  onPaste?: (targetDirPath: string) => void;
  onRename: (path: string) => void;
  onRevealInFinder: (path: string) => void;
  onCopyRelativePath: (path: string) => void;
  onCopyAbsolutePath: (path: string) => void;
  onDelete: (path: string, name: string) => void;
  onRenameSubmit: (path: string, newName: string) => void;
  onRenameCancel: () => void;
  draggedPath?: string | null;
  dropTargetPath?: string | null;
  onDnDStart?: (e: React.DragEvent, path: string) => void;
  onDnDEnd?: () => void;
  onDnDOver?: (e: React.DragEvent, path: string, isDir: boolean) => void;
  onDnDLeave?: (e: React.DragEvent, path: string) => void;
  onDnDDrop?: (e: React.DragEvent, path: string) => void;
}) {
  const { t } = useTranslation();
  const isDir = entry.isDir;
  const path = entry.path;
  const isSelected = selectedPath === path;
  const isExpanded = expandedDirs.has(path);
  const isDragged = draggedPath === path;
  const isDropTarget = dropTargetPath === path && isDir;
  const children = loadedChildren[path];
  const isEditing = editingPath === path;
  const isCut = clipboardMode === "cut" && clipboardSourcePath === path;
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

  // Suppress unused param - onLoadChildren kept for API compatibility
  void onLoadChildren;
  // Suppress unused param - workspaceRoot kept for API compatibility
  void workspaceRoot;

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
            draggable
            onDragStart={(e) => onDnDStart?.(e, path)}
            onDragEnd={onDnDEnd}
            onDragOver={(e) => onDnDOver?.(e, path, isDir)}
            onDragLeave={(e) => onDnDLeave?.(e, path)}
            onDrop={(e) => { if (isDir) onDnDDrop?.(e, path); }}
            className={cn(
              "relative flex w-full items-center gap-1.5 rounded-[2px] mx-1 px-2 py-1 text-left text-[13px]",
              isSelected ? "font-medium text-foreground" : "text-foreground-secondary hover:bg-background-tertiary hover:text-foreground",
              isDragged && "opacity-40",
              isDropTarget && "ring-1 ring-accent/50 bg-accent/5",
              isCut && "opacity-50",
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
          <ContextMenuItem className="gap-2 text-[13px]" onClick={() => onCopy?.(path)}>
            <Copy className="size-4" strokeWidth={1.5} />
            {t("explorer.copy")}
          </ContextMenuItem>
          <ContextMenuItem className="gap-2 text-[13px]" onClick={() => onCut?.(path)}>
            <Scissors className="size-4" strokeWidth={1.5} />
            {t("explorer.cut")}
          </ContextMenuItem>
          {clipboardSourcePath && isDir && (
            <ContextMenuItem className="gap-2 text-[13px]" onClick={() => onPaste?.(path)}>
              <Clipboard className="size-4" strokeWidth={1.5} />
              {t("explorer.paste")}
            </ContextMenuItem>
          )}
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
              clipboardSourcePath={clipboardSourcePath}
              clipboardMode={clipboardMode}
              onToggleExpand={onToggleExpand}
              onSelectFile={onSelectFile}
              onLoadChildren={onLoadChildren}
              onNewFolder={onNewFolder}
              onCopy={onCopy}
              onCut={onCut}
              onPaste={onPaste}
              onRename={onRename}
              onRevealInFinder={onRevealInFinder}
              onCopyRelativePath={onCopyRelativePath}
              onCopyAbsolutePath={onCopyAbsolutePath}
              onDelete={onDelete}
              onRenameSubmit={onRenameSubmit}
              onRenameCancel={onRenameCancel}
              draggedPath={draggedPath}
              dropTargetPath={dropTargetPath}
              onDnDStart={onDnDStart}
              onDnDEnd={onDnDEnd}
              onDnDOver={onDnDOver}
              onDnDLeave={onDnDLeave}
              onDnDDrop={onDnDDrop}
            />
          ))}
        </div>
      )}
    </div>
  );
}
