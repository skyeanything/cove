import { useEffect, useRef, useState } from "react";
import * as pdfjsLib from "pdfjs-dist";
import type { PDFDocumentProxy } from "pdfjs-dist";
import { ChevronLeft, ChevronRight, Minus, Plus, Maximize } from "lucide-react";
import { cn } from "@/lib/utils";
import { PdfPage } from "./PdfPage";

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  "pdfjs-dist/build/pdf.worker.min.mjs",
  import.meta.url,
).toString();

interface PdfViewerProps {
  dataUrl: string;
  className?: string;
}

export function PdfViewer({ dataUrl, className }: PdfViewerProps) {
  const [pdfDoc, setPdfDoc] = useState<PDFDocumentProxy | null>(null);
  const [pageCount, setPageCount] = useState(0);
  const [error, setError] = useState("");
  const [containerWidth, setContainerWidth] = useState(0);
  const [scale, setScale] = useState(1.0);
  const [pageInput, setPageInput] = useState("1");
  const containerRef = useRef<HTMLDivElement>(null);
  const pageRefs = useRef<Map<number, HTMLDivElement>>(new Map());

  useEffect(() => {
    if (!dataUrl) return;
    const b64 = dataUrl.split(",")[1] ?? "";
    const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));

    let cancelled = false;
    let loadedDoc: PDFDocumentProxy | null = null;
    const task = pdfjsLib.getDocument({ data: bytes });

    task.promise
      .then((doc) => {
        if (cancelled) {
          doc.destroy();
          return;
        }
        loadedDoc = doc;
        setPdfDoc(doc);
        setPageCount(doc.numPages);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(String(err));
      });

    return () => {
      cancelled = true;
      loadedDoc?.destroy();
      setPdfDoc(null);
      setPageCount(0);
    };
  }, [dataUrl]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const update = (w: number) => {
      if (w > 0) setContainerWidth(Math.floor(w) - 48);
    };
    const ro = new ResizeObserver((entries) => {
      update(entries[0]?.contentRect.width ?? 0);
    });
    ro.observe(el);
    update(el.clientWidth);
    return () => ro.disconnect();
  }, []);

  const scrollToPage = (num: number) => {
    const el = pageRefs.current.get(num);
    el?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const goToPage = (num: number) => {
    if (isNaN(num)) return;
    const clamped = Math.max(1, Math.min(pageCount, num));
    setPageInput(String(clamped));
    scrollToPage(clamped);
  };

  const handlePageInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      const num = parseInt(pageInput, 10);
      if (!isNaN(num)) goToPage(num);
    }
  };

  const effectiveWidth = containerWidth * scale;

  if (error) {
    return (
      <div className={cn("rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive", className)}>
        {error}
      </div>
    );
  }

  return (
    <div className={cn("flex min-h-0 flex-1 flex-col overflow-hidden", className)}>
      <div className="flex shrink-0 items-center justify-center gap-2 border-b border-border bg-background px-3 py-1.5">
        <button
          type="button"
          onClick={() => goToPage(parseInt(pageInput, 10) - 1)}
          disabled={parseInt(pageInput, 10) <= 1}
          className="rounded-md p-1 text-muted-foreground hover:bg-background-tertiary hover:text-foreground disabled:opacity-30"
        >
          <ChevronLeft className="size-3.5" strokeWidth={1.5} />
        </button>
        <input
          type="text"
          value={pageInput}
          onChange={(e) => setPageInput(e.target.value)}
          onKeyDown={handlePageInputKeyDown}
          onBlur={() => {
            const num = parseInt(pageInput, 10);
            if (!isNaN(num)) goToPage(num);
          }}
          className="w-10 rounded-md border border-border bg-background-tertiary px-1 py-0.5 text-center text-[11px] text-foreground"
        />
        <span className="text-[11px] text-muted-foreground">/ {pageCount}</span>
        <button
          type="button"
          onClick={() => goToPage(parseInt(pageInput, 10) + 1)}
          disabled={parseInt(pageInput, 10) >= pageCount}
          className="rounded-md p-1 text-muted-foreground hover:bg-background-tertiary hover:text-foreground disabled:opacity-30"
        >
          <ChevronRight className="size-3.5" strokeWidth={1.5} />
        </button>

        <div className="mx-1 h-4 w-px bg-border" />

        <button
          type="button"
          onClick={() => setScale((s) => Math.max(0.25, s - 0.25))}
          className="rounded-md p-1 text-muted-foreground hover:bg-background-tertiary hover:text-foreground"
        >
          <Minus className="size-3.5" strokeWidth={1.5} />
        </button>
        <span className="min-w-[40px] text-center text-[11px] text-foreground-secondary">
          {Math.round(scale * 100)}%
        </span>
        <button
          type="button"
          onClick={() => setScale((s) => Math.min(3, s + 0.25))}
          className="rounded-md p-1 text-muted-foreground hover:bg-background-tertiary hover:text-foreground"
        >
          <Plus className="size-3.5" strokeWidth={1.5} />
        </button>
        <button
          type="button"
          onClick={() => setScale(1)}
          className="rounded-md p-1 text-muted-foreground hover:bg-background-tertiary hover:text-foreground"
          title="Fit width"
        >
          <Maximize className="size-3.5" strokeWidth={1.5} />
        </button>
      </div>

      <div
        ref={containerRef}
        className="min-h-0 flex-1 overflow-auto"
        style={{ background: "#F2F3F5" }}
      >
        {pdfDoc && containerWidth > 0 && (
          <div className="flex flex-col items-center gap-4 px-6 py-6">
            {Array.from({ length: pageCount }, (_, i) => (
              <div
                key={i + 1}
                ref={(el) => {
                  if (el) pageRefs.current.set(i + 1, el);
                }}
              >
                <PdfPage doc={pdfDoc} pageNum={i + 1} width={effectiveWidth} />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
