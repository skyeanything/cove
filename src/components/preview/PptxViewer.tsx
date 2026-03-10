/**
 * PptxViewer — renders PPTX slides using pptx-viewer (pure JS, no binary dependency).
 *
 * All slides are rendered as SVG and displayed in a scrollable column.
 */
import { useEffect, useRef, useState } from "react";
import type { LoadedPresentation } from "pptx-viewer";
import { loadPresentation, renderSlideToElement } from "pptx-viewer";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";

function dataUrlToArrayBuffer(dataUrl: string): ArrayBuffer {
  const base64 = dataUrl.split(",")[1] ?? "";
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

interface PptxViewerProps {
  dataUrl: string;
  className?: string;
}

type Status = "loading" | "done" | "error";

export function PptxViewer({ dataUrl, className }: PptxViewerProps) {
  const { t } = useTranslation();
  const [status, setStatus] = useState<Status>("loading");
  const [error, setError] = useState<string>("");
  const [slideCount, setSlideCount] = useState(0);
  const slideRefs = useRef<(HTMLDivElement | null)[]>([]);
  const presentationRef = useRef<LoadedPresentation | null>(null);

  // Load and parse the PPTX file
  useEffect(() => {
    if (!dataUrl) return;

    setStatus("loading");
    setError("");
    setSlideCount(0);

    const buf = dataUrlToArrayBuffer(dataUrl);

    loadPresentation(buf)
      .then((pres) => {
        presentationRef.current?.cleanup();
        presentationRef.current = pres;
        setSlideCount(pres.slides.length);
        setStatus("done");
      })
      .catch((err: unknown) => {
        setError(String(err));
        setStatus("error");
      });

    return () => {
      presentationRef.current?.cleanup();
    };
  }, [dataUrl]);

  // Render each slide into its container div after DOM has updated
  useEffect(() => {
    if (status !== "done" || !presentationRef.current) return;
    const pres = presentationRef.current;
    pres.slides.forEach((_, i) => {
      const el = slideRefs.current[i];
      if (el) {
        // Clear previous content before re-rendering
        el.innerHTML = "";
        renderSlideToElement(pres, i, el);
      }
    });
  }, [status, slideCount]);

  if (status === "error") {
    return (
      <div className={cn("p-4 text-sm text-destructive", className)}>{error}</div>
    );
  }

  if (status === "loading") {
    return (
      <div className={cn("flex flex-1 flex-col items-center justify-center gap-3", className)}>
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
    );
  }

  return (
    <div className={cn("overflow-y-auto p-4 space-y-4", className)}>
      {Array.from({ length: slideCount }, (_, i) => (
        <div key={i}>
          <p className="mb-1 text-center text-xs text-muted-foreground">
            {i + 1} / {slideCount}
          </p>
          <div
            ref={(el) => {
              slideRefs.current[i] = el;
            }}
            className="w-full overflow-hidden rounded border [&>svg]:h-auto [&>svg]:w-full"
          />
        </div>
      ))}
    </div>
  );
}
