import { useState, useRef, useCallback } from "react";
import { parseXlsx, colToLetter, type SheetData } from "@/lib/excel-utils";

// ============================================================
// XLSX Viewer Component
// ============================================================
function XlsxViewer({ sheets }: { sheets: SheetData[] }) {
  const [activeSheet, setActiveSheet] = useState(0);
  const sheet = sheets[activeSheet];
  if (!sheet) return <div style={{ color: "#999", padding: 20 }}>No sheets found</div>;

  return (
    <div>
      <div style={{ display: "flex", gap: 4, marginBottom: 16 }}>
        {sheets.map((s, i) => (
          <button
            key={i}
            onClick={() => setActiveSheet(i)}
            style={{
              padding: "6px 16px", borderRadius: 8, border: "1px solid #ddd",
              background: i === activeSheet ? "#2563eb" : "#fff",
              color: i === activeSheet ? "#fff" : "#333",
              cursor: "pointer", fontSize: 13,
            }}
          >
            {s.name}
          </button>
        ))}
      </div>
      <div style={{ fontSize: 12, color: "#666", marginBottom: 8 }}>
        {sheet.rowCount} rows × {sheet.colCount} cols
      </div>
      <div style={{ maxHeight: 600, overflow: "auto", border: "1px solid #e5e7eb", borderRadius: 8 }}>
        <table style={{ borderCollapse: "collapse", fontSize: 13 }}>
          <thead>
            <tr>
              <th style={{ background: "#f3f4f6", color: "#6b7280", padding: "4px 8px", border: "1px solid #d1d5db", position: "sticky", top: 0, zIndex: 2, minWidth: 40 }}></th>
              {Array.from({ length: sheet.colCount }, (_, i) => (
                <th key={i} style={{ background: "#f3f4f6", color: "#6b7280", padding: "4px 8px", border: "1px solid #d1d5db", position: "sticky", top: 0, zIndex: 1, minWidth: 60, textAlign: "center", fontWeight: 500 }}>
                  {colToLetter(i + 1)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sheet.rows.map((row, ri) => (
              <tr key={ri}>
                <td style={{ background: "#f3f4f6", color: "#6b7280", padding: "4px 8px", border: "1px solid #d1d5db", textAlign: "center", fontWeight: 500, minWidth: 40 }}>
                  {ri + 1}
                </td>
                {row.map((cell, ci) => {
                  const mergeInfo = sheet.merges.get(`${ri + 1},${ci + 1}`);
                  if (mergeInfo?.skip) return null;
                  return (
                    <td
                      key={ci}
                      rowSpan={mergeInfo?.rowSpan}
                      colSpan={mergeInfo?.colSpan}
                      style={{
                        border: "1px solid #d1d5db", padding: "4px 8px",
                        minWidth: 60, maxWidth: 200, overflow: "hidden",
                        textOverflow: "ellipsis", whiteSpace: "nowrap",
                        ...cell.style,
                      }}
                    >
                      {cell.value}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ============================================================
// PPTX Viewer Component (using pptx-viewer)
// ============================================================
function PptxViewer({ buffer }: { buffer: ArrayBuffer }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState<"loading" | "done" | "error">("loading");
  const [error, setError] = useState<string>("");
  const [slideInfo, setSlideInfo] = useState<string>("");
  const viewerRef = useRef<{ destroy: () => void } | null>(null);
  const initialized = useRef(false);

  useState(() => {
    if (initialized.current) return;
    initialized.current = true;
    (async () => {
      try {
        const { PPTXViewer } = await import("pptx-viewer");
        if (!containerRef.current) return;
        const viewer = new PPTXViewer(containerRef.current, {
          showControls: true,
          keyboardNavigation: true,
          onLoad: (presentation) => {
            setSlideInfo(`${presentation.slides.length} slide(s), ${presentation.slideSize.width}×${presentation.slideSize.height}`);
          },
          onError: (err) => {
            console.error("pptx-viewer error:", err);
            setError(err.message);
            setStatus("error");
          },
        });
        viewerRef.current = viewer;
        await viewer.load(buffer);
        setStatus("done");
      } catch (err) {
        console.error("pptx-viewer error:", err);
        setError(err instanceof Error ? err.message : String(err));
        setStatus("error");
      }
    })();
  });

  return (
    <div>
      {status === "loading" && <p style={{ color: "#999", padding: 20 }}>Loading PPTX...</p>}
      {status === "error" && (
        <div style={{ padding: 12, background: "#fef2f2", borderRadius: 8, fontSize: 13, color: "#991b1b", marginBottom: 12 }}>
          <p><strong>Error:</strong> {error}</p>
          <p style={{ marginTop: 4 }}>Check browser console for details.</p>
        </div>
      )}
      {slideInfo && <div style={{ fontSize: 12, color: "#666", marginBottom: 8 }}>{slideInfo}</div>}
      <div ref={containerRef} style={{ minHeight: 400, width: "100%" }} />
    </div>
  );
}

// ============================================================
// Main Spike Page
// ============================================================
export default function SpikeOfficPreview() {
  const [xlsxData, setXlsxData] = useState<SheetData[] | null>(null);
  const [pptxBuffer, setPptxBuffer] = useState<ArrayBuffer | null>(null);
  const [fileName, setFileName] = useState<string>("");
  const [fileSize, setFileSize] = useState<number>(0);
  const [error, setError] = useState<string>("");

  const handleFile = useCallback(async (file: File) => {
    setXlsxData(null);
    setPptxBuffer(null);
    setError("");
    setFileName(file.name);
    setFileSize(file.size);
    const ext = file.name.split(".").pop()?.toLowerCase();
    const buffer = await file.arrayBuffer();
    try {
      if (ext === "xlsx" || ext === "xls") {
        setXlsxData(await parseXlsx(buffer));
      } else if (ext === "pptx" || ext === "ppt") {
        setPptxBuffer(buffer);
      } else {
        setError("Unsupported file type: " + ext);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, []);

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }, [handleFile]);

  return (
    <div style={{ maxWidth: 1200, margin: "0 auto", padding: 24, fontFamily: "system-ui, -apple-system, sans-serif" }}>
      <h1 style={{ fontSize: 24, marginBottom: 8 }}>Office Preview Spike</h1>
      <p style={{ color: "#666", marginBottom: 24, fontSize: 14 }}>
        验证 ExcelJS (XLSX) 和 pptx-preview (PPTX) 的渲染效果
      </p>
      <div
        onDrop={onDrop}
        onDragOver={(e) => e.preventDefault()}
        onClick={() => document.getElementById("spike-file-input")?.click()}
        style={{ border: "2px dashed #ccc", borderRadius: 12, padding: 40, textAlign: "center", marginBottom: 24, cursor: "pointer" }}
      >
        <div style={{ fontSize: 36, marginBottom: 8 }}>📄</div>
        <strong>拖拽文件到此处，或点击选择</strong>
        <p style={{ color: "#666", fontSize: 14, marginTop: 8 }}>支持 .xlsx / .pptx 文件</p>
        <input
          id="spike-file-input"
          type="file"
          accept=".xlsx,.pptx"
          style={{ display: "none" }}
          onChange={(e) => { if (e.target.files?.[0]) handleFile(e.target.files[0]); }}
        />
      </div>
      {fileName && (
        <div style={{ padding: 12, background: "#f0f9ff", borderRadius: 8, marginBottom: 16, fontSize: 13, color: "#1e40af" }}>
          File: {fileName} ({(fileSize / 1024).toFixed(1)} KB)
        </div>
      )}
      {error && (
        <div style={{ padding: 12, background: "#fef2f2", borderRadius: 8, marginBottom: 16, fontSize: 13, color: "#991b1b" }}>{error}</div>
      )}
      {xlsxData && (
        <div>
          <h2 style={{ fontSize: 18, margin: "24px 0 12px", color: "#333" }}>XLSX Preview (ExcelJS + HTML Table)</h2>
          <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 12, padding: 16 }}>
            <XlsxViewer sheets={xlsxData} />
          </div>
        </div>
      )}
      {pptxBuffer && (
        <div>
          <h2 style={{ fontSize: 18, margin: "24px 0 12px", color: "#333" }}>PPTX Preview (pptx-preview)</h2>
          <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 12, padding: 16 }}>
            <PptxViewer buffer={pptxBuffer} />
          </div>
        </div>
      )}
    </div>
  );
}
