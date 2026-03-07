import { useCallback } from "react";
import { openPath } from "@tauri-apps/plugin-opener";
import { invoke } from "@tauri-apps/api/core";
import { useFilePreviewStore } from "@/stores/filePreviewStore";
import { useLayoutStore } from "@/stores/layoutStore";
import { useWorkspaceStore } from "@/stores/workspaceStore";
import { getPreviewKind } from "@/lib/preview-types";

/**
 * Shared hook for opening file preview panel or system default app.
 *
 * Relative paths are kept relative and routed through workspace-gated Tauri
 * commands (read_file_raw, open_with_app) which enforce ensure_inside_workspace
 * on the Rust side. Only already-absolute paths (e.g. from attachments) bypass
 * the workspace gate — this matches the existing behavior in usePreviewContent
 * and useOpenExternally.
 */
export function useOpenFilePreview() {
  const setSelected = useFilePreviewStore((s) => s.setSelected);
  const setFilePanelOpen = useLayoutStore((s) => s.setFilePanelOpen);
  const setFilePreviewOpen = useLayoutStore((s) => s.setFilePreviewOpen);
  const workspaceRoot = useWorkspaceStore((s) => s.activeWorkspace?.path ?? null);

  const openPreview = useCallback(
    (path: string) => {
      setSelected(path);
      const state = useLayoutStore.getState();
      if (!state.filePreviewOpen) setFilePreviewOpen(true);
      if (!state.filePanelOpen) setFilePanelOpen(true);
    },
    [setSelected, setFilePanelOpen, setFilePreviewOpen],
  );

  const openExternal = useCallback(
    (path: string) => {
      if (path.startsWith("/")) {
        // Already absolute — open directly (same as useOpenExternally)
        openPath(path).catch((e) => console.error("openPath failed:", e));
      } else if (workspaceRoot) {
        // Relative — route through Rust workspace gate
        invoke("open_with_app", {
          args: { workspaceRoot, path, openWith: null },
        }).catch((e) => console.error("open_with_app failed:", e));
      }
    },
    [workspaceRoot],
  );

  const open = useCallback(
    (path: string) => {
      const kind = getPreviewKind(path);
      if (kind === "unsupported") {
        openExternal(path);
      } else {
        openPreview(path);
      }
    },
    [openPreview, openExternal],
  );

  return { openPreview, openExternal, open };
}
