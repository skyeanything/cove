import { useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useFileClipboardStore } from "@/stores/fileClipboardStore";

export function useFileClipboard(workspaceRoot: string | null) {
  const sourcePath = useFileClipboardStore((s) => s.sourcePath);
  const mode = useFileClipboardStore((s) => s.mode);
  const setClipboard = useFileClipboardStore((s) => s.set);
  const clearClipboard = useFileClipboardStore((s) => s.clear);

  const onCopy = useCallback((path: string) => {
    setClipboard(path, "copy");
  }, [setClipboard]);

  const onCut = useCallback((path: string) => {
    setClipboard(path, "cut");
  }, [setClipboard]);

  const onPaste = useCallback(
    async (targetDirPath: string) => {
      if (!sourcePath || !mode || !workspaceRoot) return;
      const fileName = sourcePath.split("/").pop() ?? sourcePath;
      const buildDestPath = (name: string) =>
        targetDirPath ? `${targetDirPath}/${name}` : name;

      let destName = fileName;
      let toPath = buildDestPath(destName);

      if (mode === "copy") {
        const ext = fileName.includes(".") ? `.${fileName.split(".").pop()}` : "";
        const base = ext ? fileName.slice(0, -ext.length) : fileName;
        const srcParent = sourcePath.includes("/")
          ? sourcePath.replace(/\/[^/]+$/, "")
          : "";
        if (srcParent === targetDirPath) {
          destName = `${base} (copy)${ext}`;
          toPath = buildDestPath(destName);
        }
      }

      try {
        if (mode === "copy") {
          await invoke("copy_entry", { args: { workspaceRoot, fromPath: sourcePath, toPath } });
        } else {
          await invoke("move_file", { args: { workspaceRoot, fromPath: sourcePath, toPath } });
          clearClipboard();
        }
      } catch {
        if (mode === "copy") {
          const ext = fileName.includes(".") ? `.${fileName.split(".").pop()}` : "";
          const base = ext ? fileName.slice(0, -ext.length) : fileName;
          const fallbackPath = buildDestPath(`${base} (copy)${ext}`);
          try {
            await invoke("copy_entry", { args: { workspaceRoot, fromPath: sourcePath, toPath: fallbackPath } });
          } catch { /* silently fail */ }
        }
      }
    },
    [sourcePath, mode, workspaceRoot, clearClipboard],
  );

  return { sourcePath, mode, onCopy, onCut, onPaste };
}
