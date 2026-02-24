import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Box, FolderOpen, Plus, Trash2, Check } from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
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
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { useWorkspaceStore } from "@/stores/workspaceStore";
import { useDataStore } from "@/stores/dataStore";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import type { Workspace } from "@/db/types";

export function WorkspacePopover({
  trigger,
}: {
  trigger?: React.ReactElement;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Workspace | null>(null);

  const workspaces = useWorkspaceStore((s) => s.workspaces);
  const activeWorkspace = useWorkspaceStore((s) => s.activeWorkspace);
  const select = useWorkspaceStore((s) => s.select);
  const add = useWorkspaceStore((s) => s.add);
  const remove = useWorkspaceStore((s) => s.remove);
  const activeConversationId = useDataStore((s) => s.activeConversationId);

  const handleAddDirectory = async () => {
    const selected = await openDialog({ directory: true, multiple: false });
    if (selected) {
      const ws = await add(selected);
      await select(ws.id, activeConversationId);
      setOpen(false);
    }
  };

  const handleSelect = async (id: string) => {
    await select(id, activeConversationId);
    setOpen(false);
  };

  const handleConfirmDelete = async () => {
    if (deleteTarget) {
      await remove(deleteTarget.id);
      setDeleteTarget(null);
    }
  };

  // 无自定义 trigger 时使用；当前 ChatInput 传入自定义 trigger，图标大小在 ChatInput 里改
  const defaultTrigger = (
    <button
      type="button"
      className="shrink-0 cursor-pointer rounded p-0.5 text-muted-foreground/70 hover:bg-background-tertiary hover:text-foreground"
      title={t("chat.workspace")}
    >
      <Box className="size-4" strokeWidth={1.5} />
    </button>
  );

  return (
    <>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          {trigger ?? defaultTrigger}
        </PopoverTrigger>
        <PopoverContent
          align="start"
          side="top"
          className="w-[440px] rounded-xl border border-border bg-popover p-0 shadow-lg"
        >
          {/* Header */}
          <div className="flex items-center justify-between px-2 py-3">
            <h3 className="text-sm font-semibold">{t("workspace.title")}</h3>
          </div>

          <p className="px-4 pb-3 text-[13px] text-muted-foreground">
            {t("workspace.description")}
          </p>

          {/* Workspace list */}
          <ScrollArea className="max-h-[280px]">
            <div className="px-2 pb-1">
              {workspaces.map((ws) => {
                const isActive = activeWorkspace?.id === ws.id;
                return (
                  <div
                    key={ws.id}
                    role="button"
                    tabIndex={0}
                    onClick={() => handleSelect(ws.id)}
                    onKeyDown={(e) => { if (e.key === "Enter") handleSelect(ws.id); }}
                    className={cn(
                      "group flex w-full cursor-pointer items-center gap-3 rounded-lg px-3 py-2 transition-colors",
                      isActive
                        ? "bg-brand/10"
                        : "hover:bg-accent/30",
                    )}
                  >
                    <FolderOpen
                      className={cn(
                        "size-5 shrink-0",
                        isActive ? "text-brand" : "text-muted-foreground",
                      )}
                      strokeWidth={2.2}
                    />
                    <div className="min-w-0 flex-1 overflow-hidden">
                      <div className={cn(
                        "truncate text-[13px]",
                        isActive && "font-medium text-foreground",
                      )}>
                        {ws.is_default ? t("workspace.default") : ws.name}
                      </div>
                      <div className="truncate text-[11px] text-muted-foreground">
                        {ws.path}
                      </div>
                    </div>

                    {/* Right side icons */}
                    <div className="flex shrink-0 items-center gap-0.5">
                      {isActive && (
                        <div className="rounded p-1">
                          <Check className="size-3.5 text-brand" strokeWidth={2} />
                        </div>
                      )}
                      {!ws.is_default && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setDeleteTarget(ws);
                          }}
                          className="rounded p-1 text-muted-foreground opacity-0 transition-opacity hover:bg-destructive/10 hover:text-destructive group-hover:opacity-100"
                          title={t("workspace.removeButtonTitle")}
                        >
                          <Trash2 className="size-3.5" strokeWidth={1.5} />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </ScrollArea>

          {/* Add directory button */}
          <div className="border-t border-border px-2 py-2">
            <button
              type="button"
              onClick={handleAddDirectory}
              className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-[13px] text-muted-foreground transition-colors hover:bg-accent/30 hover:text-foreground"
            >
              <Plus className="size-5 shrink-0" strokeWidth={1.5} />
              <span>{t("workspace.selectDirectory")}</span>
            </button>
          </div>
        </PopoverContent>
      </Popover>

      {/* Delete confirmation dialog */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(v) => { if (!v) setDeleteTarget(null); }}>
        <AlertDialogContent size="sm">
          <AlertDialogHeader>
            <AlertDialogTitle>{t("workspace.removeTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("workspace.removeDescription", { name: deleteTarget?.name ?? "" })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("workspace.cancel")}</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={handleConfirmDelete}>
              {t("workspace.remove")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
