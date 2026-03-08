import { useCallback, useState } from "react";
import { invoke } from "@tauri-apps/api/core";

/** Extract a human-readable message from a Tauri FsError or unknown error */
function extractErrorMessage(err: unknown): string {
  if (typeof err === "string") return err;
  if (typeof err === "object" && err !== null) {
    const e = err as Record<string, unknown>;
    if (typeof e.message === "string") return e.message;
    if (typeof e.kind === "string") return String(e.kind);
  }
  return String(err);
}

/** Translation function shape from react-i18next */
type TranslateFn = (key: string, options?: Record<string, string>) => string;

interface UseFileTreeDialogsParams {
  workspaceRoot: string | null;
  selectedPath: string | null;
  setSelected: (path: string | null) => void;
  setExpandedDirs: React.Dispatch<React.SetStateAction<Set<string>>>;
  /** Called after mutation to immediately refresh the affected directory */
  refreshDir: (dirPath: string) => void;
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
  refreshDir,
  t,
}: UseFileTreeDialogsParams) {
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget | null>(null);

  // ── New Folder ────────────────────────────────────────────────────────────
  const [newFolderParentPath, setNewFolderParentPath] = useState<string | null>(null);
  const [newFolderName, setNewFolderName] = useState("");
  const [newFolderError, setNewFolderError] = useState<string | null>(null);

  // ── New Markdown ──────────────────────────────────────────────────────────
  const [newMarkdownParentPath, setNewMarkdownParentPath] = useState<string | null>(null);
  const [newMarkdownName, setNewMarkdownName] = useState("");
  const [newMarkdownError, setNewMarkdownError] = useState<string | null>(null);

  const onDelete = useCallback(
    (path: string, name: string) => setDeleteTarget({ path, name }),
    [],
  );

  const handleConfirmDelete = useCallback(() => {
    if (!deleteTarget || !workspaceRoot) return;
    invoke("remove_entry", { args: { workspaceRoot, path: deleteTarget.path } })
      .then(() => {
        const parent = deleteTarget.path.includes("/")
          ? deleteTarget.path.replace(/\/[^/]+$/, "")
          : "";
        refreshDir(parent);
      })
      .finally(() => {
        setDeleteTarget(null);
        if (selectedPath === deleteTarget.path) setSelected(null);
      });
  }, [deleteTarget, workspaceRoot, selectedPath, setSelected, refreshDir]);

  // ── New Folder handlers ───────────────────────────────────────────────────
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
        refreshDir(parentPath);
      })
      .catch((err: unknown) => {
        const msg = extractErrorMessage(err);
        const isAlreadyExists = /already exists|已存在/i.test(msg);
        setNewFolderError(isAlreadyExists ? t("explorer.folderAlreadyExists") : msg);
      });
  }, [workspaceRoot, newFolderParentPath, newFolderName, t, setExpandedDirs, refreshDir]);

  const handleNewFolderCancel = useCallback(() => {
    setNewFolderParentPath(null);
    setNewFolderName("");
    setNewFolderError(null);
  }, []);

  // ── New Markdown handlers ─────────────────────────────────────────────────
  const onNewMarkdown = useCallback((parentPath: string) => {
    setNewMarkdownParentPath(parentPath);
    setNewMarkdownName("");
    setNewMarkdownError(null);
  }, []);

  const handleNewMarkdownConfirm = useCallback(() => {
    let name = newMarkdownName.trim();
    if (!name || !workspaceRoot || newMarkdownParentPath === null) return;
    // Auto-append .md if not present
    if (!name.toLowerCase().endsWith(".md")) name = `${name}.md`;
    setNewMarkdownError(null);
    const parentPath = newMarkdownParentPath;
    invoke("create_file", { args: { workspaceRoot, path: parentPath, name } })
      .then(() => {
        setNewMarkdownParentPath(null);
        setNewMarkdownName("");
        setNewMarkdownError(null);
        if (parentPath) {
          setExpandedDirs((prev) => new Set([...prev, parentPath]));
        }
        refreshDir(parentPath);
        // Select the newly created file for editing
        const newPath = parentPath ? `${parentPath}/${name}` : name;
        setSelected(newPath);
      })
      .catch((err: unknown) => {
        const msg = extractErrorMessage(err);
        const isAlreadyExists = /already exists|已存在/i.test(msg);
        setNewMarkdownError(isAlreadyExists ? t("explorer.fileAlreadyExists") : msg);
      });
  }, [workspaceRoot, newMarkdownParentPath, newMarkdownName, t, setExpandedDirs, refreshDir, setSelected]);

  const handleNewMarkdownCancel = useCallback(() => {
    setNewMarkdownParentPath(null);
    setNewMarkdownName("");
    setNewMarkdownError(null);
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
    newMarkdownParentPath,
    newMarkdownName,
    setNewMarkdownName,
    newMarkdownError,
    setNewMarkdownError,
    onNewMarkdown,
    handleNewMarkdownConfirm,
    handleNewMarkdownCancel,
  };
}
