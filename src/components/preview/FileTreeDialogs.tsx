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
import type { DeleteTarget } from "@/hooks/useFileTreeDialogs";

interface FileTreeDialogsProps {
  deleteTarget: DeleteTarget | null;
  setDeleteTarget: (target: DeleteTarget | null) => void;
  handleConfirmDelete: () => void;
  newFolderParentPath: string | null;
  newFolderName: string;
  setNewFolderName: (name: string) => void;
  newFolderError: string | null;
  setNewFolderError: (error: string | null) => void;
  handleNewFolderConfirm: () => void;
  handleNewFolderCancel: () => void;
  t: (key: string, options?: Record<string, string>) => string;
}

export function FileTreeDialogs({
  deleteTarget,
  setDeleteTarget,
  handleConfirmDelete,
  newFolderParentPath,
  newFolderName,
  setNewFolderName,
  newFolderError,
  setNewFolderError,
  handleNewFolderConfirm,
  handleNewFolderCancel,
  t,
}: FileTreeDialogsProps) {
  return (
    <>
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
    </>
  );
}
