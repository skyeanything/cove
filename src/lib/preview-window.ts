import { WebviewWindow } from "@tauri-apps/api/webviewWindow";
import { emit } from "@tauri-apps/api/event";
import { getPreviewKind } from "@/lib/preview-types";
import type { PreviewKind } from "@/lib/preview-types";

const PREVIEW_LABEL = "file-preview";

function getSizeForKind(kind: PreviewKind): { width: number; height: number } {
  switch (kind) {
    case "pdf":
    case "office":
      return { width: 800, height: 650 };
    case "image":
      return { width: 680, height: 560 };
    case "csv":
    case "html":
      return { width: 800, height: 560 };
    default:
      return { width: 720, height: 520 };
  }
}

function basename(p: string): string {
  const segments = p.replace(/\/+$/, "").split("/");
  return segments[segments.length - 1] || p;
}

export async function openPreviewWindow(
  path: string,
  workspaceRoot: string | null,
) {
  const kind = getPreviewKind(path);
  const existing = await WebviewWindow.getByLabel(PREVIEW_LABEL);

  if (existing) {
    // Update existing window with new path
    await emit("preview-navigate", { path, workspaceRoot });
    await existing.setTitle(basename(path));
    await existing.setFocus();
    return;
  }

  const { width, height } = getSizeForKind(kind);
  const params = new URLSearchParams({ window: "preview", path });
  if (workspaceRoot) params.set("workspace", workspaceRoot);

  new WebviewWindow(PREVIEW_LABEL, {
    url: `${window.location.origin}?${params.toString()}`,
    title: basename(path),
    width,
    height,
    center: true,
    resizable: true,
    titleBarStyle: "overlay",
    hiddenTitle: true,
    minWidth: 400,
    minHeight: 300,
  });
}
