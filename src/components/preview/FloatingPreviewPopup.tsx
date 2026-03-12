import { useCallback, useMemo } from "react";
import { FloatingPreviewContext } from "@/hooks/useFloatingPreview";
import { openPreviewWindow } from "@/lib/preview-window";
import { useWorkspaceStore } from "@/stores/workspaceStore";

export function FloatingPreviewProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const workspaceRoot = useWorkspaceStore(
    (s) => s.activeWorkspace?.path ?? null,
  );

  const openPopup = useCallback(
    (path: string) => {
      openPreviewWindow(path, workspaceRoot);
    },
    [workspaceRoot],
  );

  const closePopup = useCallback(() => {
    // No-op: the independent window manages its own lifecycle
  }, []);

  const contextValue = useMemo(
    () => ({ path: null, openPopup, closePopup }),
    [openPopup, closePopup],
  );

  return (
    <FloatingPreviewContext value={contextValue}>
      {children}
    </FloatingPreviewContext>
  );
}
