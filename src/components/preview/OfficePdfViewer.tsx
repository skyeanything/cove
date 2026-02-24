/**
 * OfficePdfViewer — 通用的 Office → PDF → pdf.js 渲染组件。
 *
 * DocxViewer / PptxViewer 均为此组件的薄包装，传入不同的
 * Tauri 命令名和转换提示文案即可。
 *
 * 缓存策略（两级）：
 *   L1 内存缓存（模块 Map，按命令名隔离）：同 session 内命中时零延迟。
 *   L2 磁盘缓存（Rust 端，FNV-1a 哈希键）：跨 session 命中时极快。
 *   首次预览：后台线程异步转换，UI 始终响应，完成后自动渲染。
 */
import { useEffect, useRef, useState } from "react";
import * as pdfjsLib from "pdfjs-dist";
import type { PDFDocumentProxy, RenderTask } from "pdfjs-dist";
import { invoke } from "@tauri-apps/api/core";
import { cn } from "@/lib/utils";

// ── pdf.js worker（Vite 打包为独立 chunk，避免主线程阻塞）──────────────────
pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  "pdfjs-dist/build/pdf.worker.min.mjs",
  import.meta.url,
).toString();

// ── L1 内存缓存（按命令名隔离，session 内永久有效）──────────────────────────
// key: `${command}:${dataUrl.length}:${dataUrl.slice(0, 64)}`
// value: 转换后的 PDF data-URL
const memCache = new Map<string, string>();

function cacheKey(command: string, dataUrl: string): string {
  return `${command}:${dataUrl.length}:${dataUrl.slice(0, 64)}`;
}

// ── 单页 canvas 渲染 ──────────────────────────────────────────────────────────
interface PdfPageProps {
  doc: PDFDocumentProxy;
  pageNum: number;
  width: number;
}

function PdfPage({ doc, pageNum, width }: PdfPageProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (width <= 0) return;
    const canvas = canvasRef.current;
    if (!canvas) return;

    let cancelled = false;
    let renderTask: RenderTask | null = null;

    doc
      .getPage(pageNum)
      .then((page) => {
        if (cancelled) {
          page.cleanup();
          return;
        }

        const baseVp = page.getViewport({ scale: 1 });
        const scale = width / baseVp.width;
        const vp = page.getViewport({ scale });
        const dpr = window.devicePixelRatio || 1;

        canvas.width = Math.floor(vp.width * dpr);
        canvas.height = Math.floor(vp.height * dpr);
        canvas.style.width = `${vp.width}px`;
        canvas.style.height = `${vp.height}px`;

        const ctx = canvas.getContext("2d");
        if (!ctx || cancelled) return;
        ctx.scale(dpr, dpr);

        renderTask = page.render({ canvasContext: ctx, viewport: vp, canvas });
        return renderTask.promise.then(() => page.cleanup());
      })
      .catch(() => {
        // 忽略 cancel() 产生的错误
      });

    return () => {
      cancelled = true;
      renderTask?.cancel();
    };
  }, [doc, pageNum, width]);

  return (
    <canvas
      ref={canvasRef}
      style={{
        display: "block",
        background: "#fff",
        borderRadius: 3,
        boxShadow: "0 1px 3px rgba(0,0,0,0.10), 0 1px 2px rgba(0,0,0,0.06)",
      }}
    />
  );
}

// ── 主组件 ────────────────────────────────────────────────────────────────────
export interface OfficePdfViewerProps {
  dataUrl: string;
  /** Tauri 后端命令名，如 "docx_to_pdf" 或 "pptx_to_pdf" */
  command: string;
  /** 转换中显示的主提示，如 "正在使用 Pages 转换文档…" */
  convertingLabel: string;
  className?: string;
}

type Status = "idle" | "converting" | "done" | "error";

export function OfficePdfViewer({
  dataUrl,
  command,
  convertingLabel,
  className,
}: OfficePdfViewerProps) {
  const [status, setStatus] = useState<Status>("idle");
  const [pdfDataUrl, setPdfDataUrl] = useState<string>("");
  const [error, setError] = useState<string>("");
  const pendingRef = useRef<string>("");

  const [pdfDoc, setPdfDoc] = useState<PDFDocumentProxy | null>(null);
  const [pageCount, setPageCount] = useState(0);
  const [containerWidth, setContainerWidth] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);

  // ── 文档 → PDF 转换（含 L1/L2 缓存）────────────────────────────────────
  // Rust 端命令已改为 async（spawn_blocking），不阻塞主线程，
  // invoke() 返回 Promise，UI 在等待期间保持完全响应。
  useEffect(() => {
    if (!dataUrl) return;

    const key = cacheKey(command, dataUrl);
    const cached = memCache.get(key);
    if (cached) {
      setPdfDataUrl(cached);
      setStatus("done");
      return;
    }

    setStatus("converting");
    setError("");
    setPdfDataUrl("");
    pendingRef.current = dataUrl;

    invoke<string>(command, { dataUrl })
      .then((pdf) => {
        if (pendingRef.current !== dataUrl) return;
        memCache.set(key, pdf);
        setPdfDataUrl(pdf);
        setStatus("done");
      })
      .catch((err: unknown) => {
        if (pendingRef.current !== dataUrl) return;
        setError(String(err));
        setStatus("error");
      });
  }, [dataUrl, command]);

  // ── pdf.js 加载 PDF 文档 ──────────────────────────────────────────────────
  useEffect(() => {
    if (!pdfDataUrl) return;

    const b64 = pdfDataUrl.split(",")[1] ?? "";
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
  }, [pdfDataUrl]);

  // ── 容器宽度监听（ResizeObserver → 自动重渲染各页）─────────────────────
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const update = (w: number) => {
      // 两侧各 24px padding
      if (w > 0) setContainerWidth(Math.floor(w) - 48);
    };

    const ro = new ResizeObserver((entries) => {
      update(entries[0]?.contentRect.width ?? 0);
    });
    ro.observe(el);
    update(el.clientWidth);

    return () => ro.disconnect();
  }, []);

  // ── 错误态 ────────────────────────────────────────────────────────────────
  if (status === "error") {
    return (
      <div
        className={cn(
          "rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive",
          className,
        )}
      >
        {error}
      </div>
    );
  }

  // ── 转换中 ────────────────────────────────────────────────────────────────
  if (status === "converting") {
    return (
      <div
        className={cn(
          "flex flex-1 flex-col items-center justify-center gap-3 text-center",
          className,
        )}
      >
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
        <div className="space-y-1">
          <p className="text-sm font-medium text-foreground">{convertingLabel}</p>
          <p className="text-xs text-muted-foreground">
            首次预览约需 1–3 秒，之后将从缓存瞬间加载
          </p>
        </div>
      </div>
    );
  }

  // ── 完成态：pdf.js canvas 渲染 ────────────────────────────────────────────
  return (
    <div
      ref={containerRef}
      className={cn("relative min-h-0 flex-1 overflow-y-auto", className)}
      style={{ background: "#F2F3F5" }}
    >
      {pdfDoc && containerWidth > 0 && (
        <div className="flex flex-col items-center gap-4 px-6 py-6">
          {Array.from({ length: pageCount }, (_, i) => (
            <PdfPage
              key={i + 1}
              doc={pdfDoc}
              pageNum={i + 1}
              width={containerWidth}
            />
          ))}
        </div>
      )}
    </div>
  );
}
