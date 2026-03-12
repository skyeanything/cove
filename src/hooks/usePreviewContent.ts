import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useFilePreviewStore } from "@/stores/filePreviewStore";
import { getPreviewKind } from "@/lib/preview-types";

export function isTextKind(k: string): k is "txt" | "md" | "code" | "csv" | "html" {
  return k === "txt" || k === "md" || k === "code" || k === "csv" || k === "html";
}

export function isDataUrlKind(k: string): k is "image" | "pdf" | "office" {
  return k === "image" || k === "pdf" || k === "office";
}

function isAbsolutePath(p: string): boolean {
  return p.startsWith("/");
}

async function loadAbsoluteAsText(path: string): Promise<string> {
  return invoke<string>("read_absolute_file", { args: { path } });
}

async function loadAbsoluteAsDataUrl(path: string): Promise<string> {
  const result = await invoke<{ dataUrl: string }>("read_absolute_file_as_data_url", {
    args: { path },
  });
  return result.dataUrl;
}

export function usePreviewContent(path: string | null, workspaceRoot: string | null) {
  const contentCache = useFilePreviewStore((s) => s.contentCache);
  const setContent = useFilePreviewStore((s) => s.setContent);
  const invalidate = useFilePreviewStore((s) => s.invalidate);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!path) {
      setError(null);
      return;
    }
    const abs = isAbsolutePath(path);
    if (!abs && !workspaceRoot) {
      setError(null);
      return;
    }
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
        msg = fe.message || fe.kind || "Failed to load";
      } else {
        msg = String(e);
      }
      console.error("[FilePreview] load failed:", path, e);
      setError(msg);
      invalidate(path);
    };

    if (isTextKind(kind)) {
      const promise = abs
        ? loadAbsoluteAsText(path)
        : invoke<string>("read_file_raw", { args: { workspaceRoot, path } });
      promise
        .then((text) => {
          setContent(path, { path, type: "text", text, mtime: Date.now() });
        })
        .catch(handleError)
        .finally(() => setLoading(false));
    } else if (isDataUrlKind(kind)) {
      const promise = abs
        ? loadAbsoluteAsDataUrl(path)
        : invoke<{ dataUrl: string }>("read_file_as_data_url", {
            args: { workspaceRoot, path },
          }).then((r) => r.dataUrl);
      promise
        .then((dataUrl) => {
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
