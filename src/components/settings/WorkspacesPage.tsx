import { useState, useCallback, useRef, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { open } from "@tauri-apps/plugin-dialog";
import { Star, Trash2, Folder, Plus } from "lucide-react";
import { useWorkspaceStore } from "@/stores/workspaceStore";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
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

/** Inline-editable name field for a workspace */
function EditableName({
  workspace,
  onCommit,
}: {
  workspace: Workspace;
  onCommit: (id: string, name: string) => void;
}) {
  const { t } = useTranslation();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(workspace.name);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [editing]);

  const commit = useCallback(() => {
    const trimmed = draft.trim();
    if (trimmed && trimmed !== workspace.name) {
      onCommit(workspace.id, trimmed);
    } else {
      setDraft(workspace.name);
    }
    setEditing(false);
  }, [draft, workspace.id, workspace.name, onCommit]);

  const cancel = useCallback(() => {
    setDraft(workspace.name);
    setEditing(false);
  }, [workspace.name]);

  if (editing) {
    return (
      <Input
        ref={inputRef}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") commit();
          if (e.key === "Escape") cancel();
        }}
        className="h-6 px-1 py-0 text-sm"
      />
    );
  }

  return (
    <button
      type="button"
      onClick={() => setEditing(true)}
      title={t("workspace.renameWorkspace")}
      className="cursor-pointer truncate text-left text-sm font-medium text-foreground hover:underline"
    >
      {workspace.name}
    </button>
  );
}

/** A single workspace row in the list */
function WorkspaceRow({
  workspace,
  onRename,
  onSetDefault,
  onDelete,
}: {
  workspace: Workspace;
  onRename: (id: string, name: string) => void;
  onSetDefault: (id: string) => void;
  onDelete: (ws: Workspace) => void;
}) {
  const { t } = useTranslation();
  const isDefault = workspace.is_default === 1;

  return (
    <div className="group flex items-center gap-3 border-b border-border px-4 py-3 last:border-b-0">
      <Folder className="size-4 shrink-0 text-foreground-secondary" strokeWidth={1.5} />

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <EditableName workspace={workspace} onCommit={onRename} />
          {isDefault && (
            <span className="rounded-md bg-background-tertiary px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground">
              {t("workspace.default")}
            </span>
          )}
        </div>
        <p className="mt-0.5 truncate font-mono text-xs text-muted-foreground">
          {workspace.path}
        </p>
      </div>

      <div className="flex shrink-0 items-center gap-1">
        {!isDefault && (
          <button
            type="button"
            onClick={() => onSetDefault(workspace.id)}
            title={t("workspace.setDefault")}
            className={cn(
              "cursor-pointer rounded-md p-1 text-foreground-secondary opacity-0 transition-opacity duration-150",
              "hover:bg-background-tertiary hover:text-foreground",
              "group-hover:opacity-100",
            )}
          >
            <Star className="size-4" strokeWidth={1.5} />
          </button>
        )}
        {!isDefault && (
          <button
            type="button"
            onClick={() => onDelete(workspace)}
            title={t("workspace.removeButtonTitle")}
            className={cn(
              "cursor-pointer rounded-md p-1 text-foreground-secondary opacity-0 transition-opacity duration-150",
              "hover:bg-background-tertiary hover:text-destructive",
              "group-hover:opacity-100",
            )}
          >
            <Trash2 className="size-4" strokeWidth={1.5} />
          </button>
        )}
      </div>
    </div>
  );
}

export function WorkspacesPage() {
  const { t } = useTranslation();
  const workspaces = useWorkspaceStore((s) => s.workspaces);
  const add = useWorkspaceStore((s) => s.add);
  const remove = useWorkspaceStore((s) => s.remove);
  const rename = useWorkspaceStore((s) => s.rename);
  const setDefault = useWorkspaceStore((s) => s.setDefault);

  const [deleteTarget, setDeleteTarget] = useState<Workspace | null>(null);

  const handleAdd = useCallback(async () => {
    const selected = await open({ directory: true, multiple: false });
    if (typeof selected === "string") {
      await add(selected);
    }
  }, [add]);

  const handleDelete = useCallback(async () => {
    if (!deleteTarget) return;
    await remove(deleteTarget.id);
    setDeleteTarget(null);
  }, [deleteTarget, remove]);

  return (
    <div className="flex flex-1 flex-col overflow-auto">
      <div className="space-y-4 p-5">
        {/* Description + add button */}
        <div className="flex items-start justify-between gap-4">
          <p className="text-sm text-muted-foreground">
            {t("workspace.settingsDescription")}
          </p>
          <Button
            variant="outline"
            size="sm"
            className="shrink-0 gap-1.5"
            onClick={handleAdd}
          >
            <Plus className="size-4" strokeWidth={1.5} />
            {t("workspace.addWorkspace")}
          </Button>
        </div>

        {/* Workspace list */}
        <div className="rounded-xl border border-border">
          {workspaces.length === 0 ? (
            <div className="flex items-center justify-center px-4 py-8 text-sm text-muted-foreground">
              {t("workspace.addWorkspace")}
            </div>
          ) : (
            <ScrollArea className="max-h-[400px]">
              {workspaces.map((ws) => (
                <WorkspaceRow
                  key={ws.id}
                  workspace={ws}
                  onRename={rename}
                  onSetDefault={setDefault}
                  onDelete={setDeleteTarget}
                />
              ))}
            </ScrollArea>
          )}
        </div>
      </div>

      {/* Delete confirmation dialog */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("workspace.removeTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("workspace.removeDescription", { name: deleteTarget?.name })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("workspace.cancel")}</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete}>
              {t("workspace.remove")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
