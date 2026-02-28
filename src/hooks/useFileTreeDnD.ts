import { useCallback, useState } from "react";
import { invoke } from "@tauri-apps/api/core";

interface UseFileTreeDnDParams {
  workspaceRoot: string | null;
}

export function useFileTreeDnD({ workspaceRoot }: UseFileTreeDnDParams) {
  const [draggedPath, setDraggedPath] = useState<string | null>(null);
  const [dropTargetPath, setDropTargetPath] = useState<string | null>(null);

  const onDragStart = useCallback((e: React.DragEvent, path: string) => {
    e.dataTransfer.setData("text/plain", path);
    e.dataTransfer.effectAllowed = "move";
    setDraggedPath(path);
  }, []);

  const onDragEnd = useCallback(() => {
    setDraggedPath(null);
    setDropTargetPath(null);
  }, []);

  // Check if dropping `dragPath` into `targetDir` would create a circular reference
  const isDescendant = useCallback((dragPath: string, targetDir: string) => {
    return targetDir === dragPath || targetDir.startsWith(dragPath + "/");
  }, []);

  const onDragOver = useCallback(
    (e: React.DragEvent, targetPath: string, isDir: boolean) => {
      if (!isDir) return; // Only directories are drop targets
      const dragged = e.dataTransfer.types.includes("text/plain") ? draggedPath : null;
      if (dragged && isDescendant(dragged, targetPath)) return;
      if (dragged === targetPath) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
      setDropTargetPath(targetPath);
    },
    [draggedPath, isDescendant],
  );

  const onDragLeave = useCallback(
    (e: React.DragEvent, targetPath: string) => {
      if (dropTargetPath === targetPath) {
        const related = e.relatedTarget as Node | null;
        const current = e.currentTarget as Node;
        if (!related || !current.contains(related)) {
          setDropTargetPath(null);
        }
      }
    },
    [dropTargetPath],
  );

  const onDrop = useCallback(
    (e: React.DragEvent, targetDirPath: string) => {
      e.preventDefault();
      const fromPath = e.dataTransfer.getData("text/plain");
      if (!fromPath || !workspaceRoot) return;

      if (isDescendant(fromPath, targetDirPath)) return;

      const fileName = fromPath.split("/").pop() ?? fromPath;
      const toPath = targetDirPath ? `${targetDirPath}/${fileName}` : fileName;

      if (fromPath === toPath) return;

      invoke("move_file", { args: { workspaceRoot, fromPath, toPath } }).catch(
        () => {},
      );
      setDraggedPath(null);
      setDropTargetPath(null);
    },
    [workspaceRoot, isDescendant],
  );

  const onRootDragOver = useCallback(
    (e: React.DragEvent) => {
      const dragged = draggedPath;
      if (!dragged) return;
      // Only allow if item is not already at root level
      if (!dragged.includes("/")) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
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
      invoke("move_file", {
        args: { workspaceRoot, fromPath, toPath: fileName },
      }).catch(() => {});
      setDraggedPath(null);
      setDropTargetPath(null);
    },
    [workspaceRoot],
  );

  return {
    draggedPath,
    dropTargetPath,
    onDragStart,
    onDragEnd,
    onDragOver,
    onDragLeave,
    onDrop,
    onRootDragOver,
    onRootDrop,
  };
}
