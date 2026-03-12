import { useCallback, useState } from "react";
import { invoke } from "@tauri-apps/api/core";

export interface InsertTarget {
  path: string;
  position: "before" | "after";
}

interface UseFileTreeDnDParams {
  workspaceRoot: string | null;
  refreshDir?: (dirPath: string) => void;
  onReorder?: (draggedPath: string, insertTarget: InsertTarget) => void;
}

function getParent(path: string): string {
  return path.includes("/") ? path.replace(/\/[^/]+$/, "") : "";
}

export function useFileTreeDnD({ workspaceRoot, refreshDir, onReorder }: UseFileTreeDnDParams) {
  const [draggedPath, setDraggedPath] = useState<string | null>(null);
  const [dropTargetPath, setDropTargetPath] = useState<string | null>(null);
  const [insertTarget, setInsertTarget] = useState<InsertTarget | null>(null);

  const onDragStart = useCallback((e: React.DragEvent, path: string) => {
    e.dataTransfer.setData("text/plain", path);
    e.dataTransfer.effectAllowed = "move";
    setDraggedPath(path);
  }, []);

  const onDragEnd = useCallback(() => {
    setDraggedPath(null);
    setDropTargetPath(null);
    setInsertTarget(null);
  }, []);

  // Check if dropping `dragPath` into `targetDir` would create a circular reference
  const isDescendant = useCallback((dragPath: string, targetDir: string) => {
    return targetDir === dragPath || targetDir.startsWith(dragPath + "/");
  }, []);

  const onDragOver = useCallback(
    (e: React.DragEvent, targetPath: string, isDir: boolean) => {
      const dragged = e.dataTransfer.types.includes("text/plain") ? draggedPath : null;
      if (!dragged) return;
      if (dragged === targetPath) return;

      const draggedParent = getParent(dragged);
      const targetParent = isDir ? getParent(targetPath) : getParent(targetPath);
      const sameParent = draggedParent === targetParent;

      // For same-parent items, detect insert position via Y coordinate
      if (sameParent && dragged !== targetPath) {
        const rect = e.currentTarget.getBoundingClientRect();
        const yRatio = (e.clientY - rect.top) / rect.height;

        if (yRatio < 0.3) {
          e.preventDefault();
          e.dataTransfer.dropEffect = "move";
          setInsertTarget({ path: targetPath, position: "before" });
          setDropTargetPath(null);
          return;
        }
        if (yRatio > 0.7) {
          e.preventDefault();
          e.dataTransfer.dropEffect = "move";
          setInsertTarget({ path: targetPath, position: "after" });
          setDropTargetPath(null);
          return;
        }
      }

      // Cross-folder move: accept only directories as explicit targets;
      // for file targets the effective destination is the file's parent directory.
      const effectiveTarget = isDir ? targetPath : getParent(targetPath);

      // Prevent circular reference when dragging a folder into itself/descendant
      if (isDescendant(dragged, effectiveTarget)) return;
      if (dragged === effectiveTarget) return;

      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
      setInsertTarget(null);
      setDropTargetPath(effectiveTarget);
    },
    [draggedPath, isDescendant],
  );

  const onDragLeave = useCallback(
    (e: React.DragEvent, targetPath: string) => {
      const related = e.relatedTarget as Node | null;
      const current = e.currentTarget as Node;
      if (related && current.contains(related)) return;

      if (dropTargetPath === targetPath || dropTargetPath === getParent(targetPath)) {
        setDropTargetPath(null);
      }
      if (insertTarget?.path === targetPath) {
        setInsertTarget(null);
      }
    },
    [dropTargetPath, insertTarget],
  );

  const onDrop = useCallback(
    (e: React.DragEvent, targetPath: string, isDir: boolean) => {
      e.preventDefault();
      const fromPath = e.dataTransfer.getData("text/plain");
      if (!fromPath || !workspaceRoot) return;

      // Reorder within same parent
      const draggedParent = getParent(fromPath);
      const targetParent = getParent(targetPath);
      if (draggedParent === targetParent && insertTarget) {
        onReorder?.(fromPath, insertTarget);
        setDraggedPath(null);
        setDropTargetPath(null);
        setInsertTarget(null);
        return;
      }

      // Cross-folder move
      const targetDirPath = isDir ? targetPath : getParent(targetPath);
      if (isDescendant(fromPath, targetDirPath)) return;

      const fileName = fromPath.split("/").pop() ?? fromPath;
      const toPath = targetDirPath ? `${targetDirPath}/${fileName}` : fileName;
      if (fromPath === toPath) return;

      const srcParent = getParent(fromPath);
      invoke("move_file", { args: { workspaceRoot, fromPath, toPath } })
        .then(() => {
          refreshDir?.(srcParent);
          refreshDir?.(targetDirPath);
        })
        .catch(() => {});

      setDraggedPath(null);
      setDropTargetPath(null);
      setInsertTarget(null);
    },
    [workspaceRoot, isDescendant, refreshDir, onReorder, insertTarget],
  );

  const onRootDragOver = useCallback(
    (e: React.DragEvent) => {
      const dragged = draggedPath;
      if (!dragged) return;
      if (!dragged.includes("/")) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
      setInsertTarget(null);
      setDropTargetPath("");
    },
    [draggedPath],
  );

  const onRootDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      const fromPath = e.dataTransfer.getData("text/plain");
      if (!fromPath || !workspaceRoot) return;
      const fileName = fromPath.split("/").pop() ?? fromPath;
      if (fromPath === fileName) return;
      const srcParent = getParent(fromPath);
      invoke("move_file", {
        args: { workspaceRoot, fromPath, toPath: fileName },
      })
        .then(() => {
          refreshDir?.(srcParent);
          refreshDir?.("");
        })
        .catch(() => {});
      setDraggedPath(null);
      setDropTargetPath(null);
      setInsertTarget(null);
    },
    [workspaceRoot, refreshDir],
  );

  return {
    draggedPath,
    dropTargetPath,
    insertTarget,
    onDragStart,
    onDragEnd,
    onDragOver,
    onDragLeave,
    onDrop,
    onRootDragOver,
    onRootDrop,
  };
}
