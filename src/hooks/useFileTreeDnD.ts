import { useCallback, useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWebview } from "@tauri-apps/api/webview";

interface UseFileTreeDnDParams {
  workspaceRoot: string | null;
  containerRef: React.RefObject<HTMLElement | null>;
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

/**
 * Walk up the DOM from `el` to find the nearest ancestor (or self) with
 * a `data-tree-path` attribute. Returns the path and isDir flag, or null.
 */
function findTreeTarget(el: Element | null): { path: string; isDir: boolean } | null {
  let cur = el;
  while (cur) {
    if (cur instanceof HTMLElement && cur.hasAttribute("data-tree-path")) {
      const path = cur.getAttribute("data-tree-path") ?? "";
      const isDir = cur.getAttribute("data-tree-is-dir") === "true";
      return { path, isDir };
    }
    if (cur instanceof HTMLElement && cur.hasAttribute("data-tree-root")) {
      return { path: "", isDir: true };
    }
    cur = cur.parentElement;
  }
  return null;
}

/** Copy a single external file into the workspace, with fallback on conflict. */
async function copyExternalFile(
  workspaceRoot: string,
  externalPath: string,
  targetDirPath: string,
): Promise<void> {
  const fileName = basename(externalPath);
  const destPath = targetDirPath ? `${targetDirPath}/${fileName}` : fileName;

  try {
    await invoke("copy_external_file", {
      args: { workspaceRoot, externalPath, destPath },
    });
  } catch {
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

export function useFileTreeDnD({ workspaceRoot, containerRef }: UseFileTreeDnDParams) {
  const [draggedPath, setDraggedPath] = useState<string | null>(null);
  const [dropTargetPath, setDropTargetPath] = useState<string | null>(null);
  const [isExternalDragOver, setIsExternalDragOver] = useState(false);

  // Keep refs for values needed inside the Tauri event callback
  const workspaceRootRef = useRef(workspaceRoot);
  useEffect(() => {
    workspaceRootRef.current = workspaceRoot;
  }, [workspaceRoot]);

  // --- Tauri native drag-drop (external files from OS) ---
  useEffect(() => {
    const unlisten = getCurrentWebview().onDragDropEvent((event) => {
      const wsRoot = workspaceRootRef.current;

      if (event.payload.type === "enter") {
        setIsExternalDragOver(true);
      } else if (event.payload.type === "over") {
        const pos = event.payload.position;
        const ratio = window.devicePixelRatio || 1;
        const cssX = pos.x / ratio;
        const cssY = pos.y / ratio;
        const el = document.elementFromPoint(cssX, cssY);
        const target = findTreeTarget(el);

        if (target) {
          // Only highlight directories as drop targets
          if (target.isDir) {
            setDropTargetPath(target.path);
          } else {
            // For files, use the parent directory
            const parentPath = target.path.includes("/")
              ? target.path.replace(/\/[^/]+$/, "")
              : "";
            setDropTargetPath(parentPath);
          }
        } else {
          setDropTargetPath(null);
        }
      } else if (event.payload.type === "drop") {
        if (!wsRoot) {
          setIsExternalDragOver(false);
          setDropTargetPath(null);
          return;
        }

        const paths = event.payload.paths;
        // Determine target directory from current dropTargetPath
        const pos = event.payload.position;
        const ratio = window.devicePixelRatio || 1;
        const el = document.elementFromPoint(pos.x / ratio, pos.y / ratio);
        const target = findTreeTarget(el);
        let targetDir = "";
        if (target) {
          targetDir = target.isDir
            ? target.path
            : target.path.includes("/")
              ? target.path.replace(/\/[^/]+$/, "")
              : "";
        }

        for (const externalPath of paths) {
          void copyExternalFile(wsRoot, externalPath, targetDir);
        }

        setIsExternalDragOver(false);
        setDropTargetPath(null);
      } else if (event.payload.type === "leave") {
        setIsExternalDragOver(false);
        setDropTargetPath(null);
      }
    });

    return () => {
      void unlisten.then((fn) => fn());
    };
  }, []);

  // --- Internal HTML5 DnD (tree rearrangement) ---
  const onDragStart = useCallback((e: React.DragEvent, path: string) => {
    e.dataTransfer.setData("text/plain", path);
    e.dataTransfer.effectAllowed = "move";
    setDraggedPath(path);
  }, []);

  const onDragEnd = useCallback(() => {
    setDraggedPath(null);
    setDropTargetPath(null);
  }, []);

  const isDescendant = useCallback((dragPath: string, targetDir: string) => {
    return targetDir === dragPath || targetDir.startsWith(dragPath + "/");
  }, []);

  const onDragOver = useCallback(
    (e: React.DragEvent, targetPath: string, isDir: boolean) => {
      if (!isDir) return;
      const dragged = e.dataTransfer.types.includes("text/plain") ? draggedPath : null;
      if (!dragged) return;
      if (isDescendant(dragged, targetPath)) return;
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

  // Suppress unused ref - containerRef is kept for future hit-testing scoping
  void containerRef;

  return {
    draggedPath,
    dropTargetPath,
    isExternalDragOver,
    onDragStart,
    onDragEnd,
    onDragOver,
    onDragLeave,
    onDrop,
    onRootDragOver,
    onRootDrop,
  };
}
