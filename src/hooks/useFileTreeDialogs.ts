import { useCallback, useState } from "react";
import { invoke } from "@tauri-apps/api/core";

/** Translation function shape from react-i18next */
type TranslateFn = (key: string, options?: Record<string, string>) => string;

interface UseFileTreeDialogsParams {
  workspaceRoot: string | null;
  selectedPath: string | null;
  setSelected: (path: string | null) => void;
  setExpandedDirs: React.Dispatch<React.SetStateAction<Set<string>>>;
  t: TranslateFn;
}

export interface DeleteTarget {
  path: string;
  name: string;
}

export function useFileTreeDialogs({
  workspaceRoot,
  selectedPath,
  setSelected,
  setExpandedDirs,
  t,
}: UseFileTreeDialogsParams) {
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget | null>(null);
  const [newFolderParentPath, setNewFolderParentPath] = useState<string | null>(null);
  const [newFolderName, setNewFolderName] = useState("");
  const [newFolderError, setNewFolderError] = useState<string | null>(null);

  const onDelete = useCallback(
    (path: string, name: string) => setDeleteTarget({ path, name }),
    [],
  );

  const handleConfirmDelete = useCallback(() => {
    if (!deleteTarget || !workspaceRoot) return;
    invoke("remove_entry", { args: { workspaceRoot, path: deleteTarget.path } }).finally(() => {
      setDeleteTarget(null);
      if (selectedPath === deleteTarget.path) setSelected(null);
    });
  }, [deleteTarget, workspaceRoot, selectedPath, setSelected]);

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
        const msg =
          typeof err === "object" && err != null && "message" in err
            ? String((err as { message: string }).message)
            : String(err);
        const isAlreadyExists = /already exists|已存在/i.test(msg);
        setNewFolderError(isAlreadyExists ? t("explorer.folderAlreadyExists") : msg);
      });
  }, [workspaceRoot, newFolderParentPath, newFolderName, t, setExpandedDirs]);

  const handleNewFolderCancel = useCallback(() => {
    setNewFolderParentPath(null);
    setNewFolderName("");
    setNewFolderError(null);
  }, []);

  return {
    deleteTarget,
    setDeleteTarget,
    newFolderParentPath,
    newFolderName,
    setNewFolderName,
    newFolderError,
    setNewFolderError,
    onDelete,
    handleConfirmDelete,
    onNewFolder,
    handleNewFolderConfirm,
    handleNewFolderCancel,
  };
}
