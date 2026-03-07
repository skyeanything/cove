import { useCallback, useState } from "react";
import { invoke } from "@tauri-apps/api/core";

interface UseFileTreeDnDParams {
  workspaceRoot: string | null;
}

/** Check if types list indicates an external file drop (from Finder / file manager). */
function isExternalFileDrop(types: DOMStringList | readonly string[]): boolean {
  // External file drops include "Files" in types. Internal DnD uses "text/plain".
  // When both are present, "Files" without an internal draggedPath means external.
  return Array.from(types).includes("Files");
}

/** Extract the basename from a path, handling both POSIX and Windows separators. */
function basename(filePath: string): string {
  const lastSep = Math.max(filePath.lastIndexOf("/"), filePath.lastIndexOf("\\"));
  return lastSep >= 0 ? filePath.slice(lastSep + 1) : filePath;
}

/** Extract a (copy) fallback name: `foo.txt` -> `foo (copy).txt` */
function fallbackName(name: string): string {
  const dotIdx = name.lastIndexOf(".");
  const hasExt = dotIdx > 0;
  const base = hasExt ? name.slice(0, dotIdx) : name;
  const ext = hasExt ? name.slice(dotIdx) : "";
  return `${base} (copy)${ext}`;
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

  // Handle external file drops (files dragged from Finder / system file manager)
  const onExternalDrop = useCallback(
    async (e: React.DragEvent, targetDirPath: string) => {
      if (!workspaceRoot) return;
      if (e.dataTransfer.files.length === 0) return;

      e.preventDefault();

      for (const file of Array.from(e.dataTransfer.files)) {
        // In Tauri/Electron webviews, File objects from native drops expose a `path` property
        const externalPath = (file as File & { path?: string }).path;
        if (!externalPath) continue;

        const fileName = basename(externalPath) || file.name;
        const destPath = targetDirPath ? `${targetDirPath}/${fileName}` : fileName;

        try {
          await invoke("copy_external_file", {
            args: { workspaceRoot, externalPath, destPath },
          });
        } catch {
          // If destination exists, try with (copy) suffix
          const altName = fallbackName(fileName);
          const altPath = targetDirPath ? `${targetDirPath}/${altName}` : altName;
          try {
            await invoke("copy_external_file", {
              args: { workspaceRoot, externalPath, destPath: altPath },
            });
          } catch {
            /* silently fail on second attempt */
          }
        }
      }

      setDraggedPath(null);
      setDropTargetPath(null);
    },
    [workspaceRoot],
  );

  const onDragOver = useCallback(
    (e: React.DragEvent, targetPath: string, isDir: boolean) => {
      if (!isDir) return; // Only directories are drop targets

      // Allow external file drops
      if (isExternalFileDrop(e.dataTransfer.types) && !draggedPath) {
        e.preventDefault();
        e.dataTransfer.dropEffect = "copy";
        setDropTargetPath(targetPath);
        return;
      }

      // Internal drag
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
      // Check external files first (when there is no active internal drag)
      if (
        isExternalFileDrop(e.dataTransfer.types) &&
        !draggedPath &&
        e.dataTransfer.files.length > 0
      ) {
        void onExternalDrop(e, targetDirPath);
        return;
      }

      // Existing internal DnD logic
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
    [workspaceRoot, draggedPath, isDescendant, onExternalDrop],
  );

  const onRootDragOver = useCallback(
    (e: React.DragEvent) => {
      // Allow external file drops to root
      if (isExternalFileDrop(e.dataTransfer.types) && !draggedPath) {
        e.preventDefault();
        e.dataTransfer.dropEffect = "copy";
        setDropTargetPath("");
        return;
      }

      // Internal drag
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
      // Check external files first
      if (
        isExternalFileDrop(e.dataTransfer.types) &&
        !draggedPath &&
        e.dataTransfer.files.length > 0
      ) {
        void onExternalDrop(e, "");
        return;
      }

      // Existing internal logic
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
    [workspaceRoot, draggedPath, onExternalDrop],
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
