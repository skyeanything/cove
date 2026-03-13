import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { listen } from "@tauri-apps/api/event";
import { ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FloatingPreviewContent } from "./FloatingPreviewContent";
import { getFileIcon } from "@/lib/file-tree-icons";
import { useOpenExternally } from "./PreviewFileHeader";

function basename(p: string): string {
  const segments = p.replace(/\/+$/, "").split("/");
  return segments[segments.length - 1] || p;
}

function getInitialParams() {
  const params = new URLSearchParams(window.location.search);
  return {
    path: params.get("path"),
    workspace: params.get("workspace"),
  };
}

export function PreviewWindow() {
  const { t } = useTranslation();
  const initial = getInitialParams();
  const [path, setPath] = useState<string | null>(initial.path);
  const [workspace, setWorkspace] = useState<string | null>(initial.workspace);

  // Listen for navigation events from the main window
  useEffect(() => {
    const unlistenPromise = listen<{ path: string; workspaceRoot: string | null }>(
      "preview-navigate",
      (event) => {
        const { path: newPath, workspaceRoot } = event.payload;
        if (newPath) setPath(newPath);
        if (workspaceRoot !== undefined) setWorkspace(workspaceRoot);
      },
    );
    return () => {
      unlistenPromise.then((u) => u());
    };
  }, []);

  const openExternally = useOpenExternally(workspace, path);

  if (!path) {
    return (
      <div className="flex h-screen items-center justify-center bg-background text-sm text-muted-foreground">
        {t("preview.selectFile")}
      </div>
    );
  }

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-background">
      {/* macOS overlay zone (~28px) intercepts all mouse events, so only a
          drag spacer lives here — no interactive elements */}
      <div data-tauri-drag-region className="h-7 shrink-0" />
      {/* Toolbar below the overlay: filename area is draggable, button is not */}
      <div className="flex h-8 shrink-0 items-center gap-2 border-b border-border px-3">
        <div
          data-tauri-drag-region
          className="flex min-w-0 flex-1 items-center gap-1.5 self-stretch"
        >
          {getFileIcon(path, "size-4 shrink-0 text-foreground-secondary", 1.5)}
          <span
            className="min-w-0 truncate text-sm font-medium text-foreground"
            title={path}
          >
            {basename(path)}
          </span>
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="h-6 px-2 text-xs text-foreground-secondary"
          onClick={() => openExternally()}
        >
          <ExternalLink className="mr-1 size-3.5" strokeWidth={1.5} />
          {t("preview.openDefault")}
        </Button>
      </div>

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <FloatingPreviewContent path={path} workspaceRoot={workspace} />
      </div>
    </div>
  );
}
