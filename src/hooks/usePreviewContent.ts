import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useFilePreviewStore } from "@/stores/filePreviewStore";
import { getPreviewKind } from "@/lib/preview-types";

export function isTextKind(k: string): k is "txt" | "md" | "code" {
  return k === "txt" || k === "md" || k === "code";
}

export function isDataUrlKind(k: string): k is "image" | "pdf" | "office" {
  return k === "image" || k === "pdf" || k === "office";
}

export function usePreviewContent(path: string | null, workspaceRoot: string | null) {
  const contentCache = useFilePreviewStore((s) => s.contentCache);
  const setContent = useFilePreviewStore((s) => s.setContent);
  const invalidate = useFilePreviewStore((s) => s.invalidate);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!path || !workspaceRoot) {
      setError(null);
      return;
    }
    /* 从 store 快照读取，避免把 contentCache 放进 deps 导致无限循环 */
    const cached = useFilePreviewStore.getState().contentCache[path];
    if (cached) {
      setLoading(false);
      setError(null);
      return;
    }
    const kind = getPreviewKind(path);
    setLoading(true);
    setError(null);

    const handleError = (e: unknown) => {
      let msg: string;
      if (typeof e === "string") {
        msg = e;
      } else if (e && typeof e === "object") {
        const fe = e as { kind?: string; message?: string };
        msg = fe.message || fe.kind || "读取失败";
      } else {
        msg = String(e);
      }
      console.error("[FilePreview] load failed:", path, e);
      setError(msg);
      invalidate(path);
    };

    if (isTextKind(kind)) {
      invoke<string>("read_file_raw", { args: { workspaceRoot, path } })
        .then((text) => {
          setContent(path, { path, type: "text", text, mtime: Date.now() });
        })
        .catch(handleError)
        .finally(() => setLoading(false));
    } else if (isDataUrlKind(kind)) {
      invoke<{ dataUrl: string }>("read_file_as_data_url", { args: { workspaceRoot, path } })
        .then(({ dataUrl }) => {
          setContent(path, { path, type: "dataUrl", dataUrl, mtime: Date.now() });
        })
        .catch(handleError)
        .finally(() => setLoading(false));
    } else {
      setLoading(false);
      setError(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path, workspaceRoot, setContent, invalidate]);

  return { cached: path ? contentCache[path] : null, loading, error };
}
