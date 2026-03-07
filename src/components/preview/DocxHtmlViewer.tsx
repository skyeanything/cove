/**
 * DocxHtmlViewer — renders DOCX documents using docx-preview-sync (pure JS, no binary dependency).
 *
 * Cache strategy:
 *   L1 in-memory (module Map): zero-latency within the same session.
 */
import { useEffect, useRef, useState } from "react";
import { renderAsync } from "docx-preview-sync";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";

// ── L1 in-memory cache ─────────────────────────────────────────────────────
const memCache = new Map<string, ArrayBuffer>();

function cacheKey(dataUrl: string): string {
  return `${dataUrl.length}:${dataUrl.slice(0, 64)}`;
}

function dataUrlToArrayBuffer(dataUrl: string): ArrayBuffer {
  const base64 = dataUrl.split(",")[1] ?? "";
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

interface DocxHtmlViewerProps {
  dataUrl: string;
  className?: string;
}

type Status = "idle" | "rendering" | "done" | "error";

export function DocxHtmlViewer({ dataUrl, className }: DocxHtmlViewerProps) {
  const { t } = useTranslation();
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string>("");
  const containerRef = useRef<HTMLDivElement>(null);
  const styleRef = useRef<HTMLDivElement>(null);
  const pendingRef = useRef<string>("");

  useEffect(() => {
    if (!dataUrl) return;

    pendingRef.current = dataUrl;
    setStatus("rendering");
    setError("");

    const key = cacheKey(dataUrl);
    let buf = memCache.get(key);
    if (!buf) {
      buf = dataUrlToArrayBuffer(dataUrl);
      memCache.set(key, buf);
    }

    const container = containerRef.current;
    if (!container) return;

    renderAsync(buf, container, styleRef.current ?? undefined, {
      inWrapper: false,
      ignoreHeight: true,
      ignoreWidth: true,
    })
      .then(() => {
        if (pendingRef.current !== dataUrl) return;
        setStatus("done");
      })
      .catch((err: unknown) => {
        if (pendingRef.current !== dataUrl) return;
        setError(String(err));
        setStatus("error");
      });
  }, [dataUrl]);

  return (
    <div className={cn("relative min-h-0 flex-1 overflow-y-auto bg-white", className)}>
      <div ref={styleRef} />
      {status === "error" ? (
        <div className="p-4 text-sm text-destructive">{error}</div>
      ) : (
        <>
          {status !== "done" && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-white">
              <svg
                className="size-8 animate-spin text-muted-foreground/50"
                viewBox="0 0 24 24"
                fill="none"
              >
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="3"
                />
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"
                />
              </svg>
              <p className="text-sm text-muted-foreground">{t("preview.loading")}</p>
            </div>
          )}
          {/* Container must always be in the DOM for renderAsync to write into */}
          <div
            ref={containerRef}
            className="p-2"
            style={{ visibility: status === "done" ? "visible" : "hidden" }}
          />
        </>
      )}
    </div>
  );
}
