import { useState, useRef, useCallback } from "react";
import ExcelJS from "exceljs";

// ============================================================
// Types
// ============================================================
interface SheetData {
  name: string;
  rows: CellData[][];
  colCount: number;
  rowCount: number;
  merges: Map<string, MergeInfo>;
}

interface CellData {
  value: string;
  style: React.CSSProperties;
}

interface MergeInfo {
  skip?: boolean;
  rowSpan?: number;
  colSpan?: number;
}

// ============================================================
// Excel style helpers
// ============================================================
const THEME_COLORS = [
  "#FFFFFF", "#000000", "#44546A", "#4472C4",
  "#ED7D31", "#A5A5A5", "#FFC000", "#5B9BD5",
  "#70AD47", "#264478",
];

function argbToHex(argb: string): string {
  if (!argb) return "#000";
  return argb.length === 8 ? "#" + argb.slice(2) : "#" + argb;
}

function themeColor(theme: number, _tint?: number): string {
  return THEME_COLORS[theme] || "#000";
}

function resolveColor(color?: { argb?: string; theme?: number; tint?: number }): string | undefined {
  if (!color) return undefined;
  if (color.argb) return argbToHex(color.argb);
  if (color.theme !== undefined) return themeColor(color.theme, color.tint);
  return undefined;
}

function colToLetter(col: number): string {
  let s = "";
  let c = col;
  while (c > 0) {
    c--;
    s = String.fromCharCode(65 + (c % 26)) + s;
    c = Math.floor(c / 26);
  }
  return s;
}

function parseCellStyles(cell: ExcelJS.Cell): React.CSSProperties {
  const css: React.CSSProperties = {};
  const style = cell.style;
  if (!style) return css;

  // Font
  if (style.font) {
    const f = style.font;
    if (f.bold) css.fontWeight = "bold";
    if (f.italic) css.fontStyle = "italic";
    const decorations: string[] = [];
    if (f.underline) decorations.push("underline");
    if (f.strike) decorations.push("line-through");
    if (decorations.length) css.textDecoration = decorations.join(" ");
    if (f.size) css.fontSize = f.size + "px";
    if (f.name) css.fontFamily = f.name;
    const fontColor = resolveColor(f.color);
    if (fontColor) css.color = fontColor;
  }

  // Fill
  if (style.fill && style.fill.type === "pattern") {
    const fill = style.fill as ExcelJS.FillPattern;
    const bgColor = resolveColor(fill.fgColor as { argb?: string; theme?: number; tint?: number });
    if (bgColor && bgColor !== "#FFFFFF" && bgColor !== "#ffffff") {
      css.backgroundColor = bgColor;
    }
  }

  // Alignment
  if (style.alignment) {
    const a = style.alignment;
    if (a.horizontal) css.textAlign = a.horizontal as React.CSSProperties["textAlign"];
    if (a.vertical) {
      const vMap: Record<string, string> = { top: "top", middle: "middle", bottom: "bottom" };
      css.verticalAlign = vMap[a.vertical] || "middle";
    }
    if (a.wrapText) {
      css.whiteSpace = "pre-wrap";
      css.maxWidth = "200px";
    }
  }

  // Border
  if (style.border) {
    const b = style.border;
    if (b.top) css.borderTop = borderStr(b.top);
    if (b.bottom) css.borderBottom = borderStr(b.bottom);
    if (b.left) css.borderLeft = borderStr(b.left);
    if (b.right) css.borderRight = borderStr(b.right);
  }

  return css;
}

function borderStr(b: Partial<ExcelJS.Border>): string {
  const widthMap: Record<string, string> = { thin: "1px", medium: "2px", thick: "3px", dotted: "1px", dashed: "1px" };
  const styleMap: Record<string, string> = { thin: "solid", medium: "solid", thick: "solid", dotted: "dotted", dashed: "dashed" };
  const w = widthMap[b.style || "thin"] || "1px";
  const s = styleMap[b.style || "thin"] || "solid";
  const c = resolveColor(b.color as { argb?: string; theme?: number; tint?: number }) || "#000";
  return `${w} ${s} ${c}`;
}

function getCellDisplayValue(cell: ExcelJS.Cell): string {
  const v = cell.value;
  if (v === null || v === undefined) return "";
  if (typeof v === "object") {
    if ("richText" in v && Array.isArray((v as { richText: { text: string }[] }).richText)) {
      return (v as { richText: { text: string }[] }).richText.map((rt) => rt.text).join("");
    }
    if ("result" in v) return String((v as { result: unknown }).result ?? "");
    if ("text" in v) return String((v as { text: string }).text);
    return JSON.stringify(v);
  }
  return String(v);
}

// ============================================================
// Parse XLSX into SheetData[]
// ============================================================
async function parseXlsx(buffer: ArrayBuffer): Promise<SheetData[]> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);

  const sheets: SheetData[] = [];

  workbook.eachSheet((sheet) => {
    const colCount = Math.min(sheet.columnCount || 26, 50);
    const rowCount = Math.min(sheet.rowCount || 0, 500);

    // Parse merges
    const merges = new Map<string, MergeInfo>();
    // _merges is Record<string, Range> where Range has .model { top, left, bottom, right }
    const mergeModels = (sheet as unknown as { _merges: Record<string, { model: { top: number; left: number; bottom: number; right: number } }> })._merges;
    if (mergeModels) {
      for (const key in mergeModels) {
        const range = mergeModels[key];
        const m = range?.model;
        if (!m) continue;
        const { top, left, bottom, right } = m;
        for (let r = top; r <= bottom; r++) {
          for (let c = left; c <= right; c++) {
            if (r === top && c === left) {
              merges.set(`${r},${c}`, { rowSpan: bottom - top + 1, colSpan: right - left + 1 });
            } else {
              merges.set(`${r},${c}`, { skip: true });
            }
          }
        }
      }
    }

    // Parse rows
    const rows: CellData[][] = [];
    for (let r = 1; r <= rowCount; r++) {
      const row: CellData[] = [];
      for (let c = 1; c <= colCount; c++) {
        const cell = sheet.getCell(r, c);
        row.push({
          value: getCellDisplayValue(cell),
          style: parseCellStyles(cell),
        });
      }
      rows.push(row);
    }

    sheets.push({ name: sheet.name, rows, colCount, rowCount, merges });
  });

  return sheets;
}

// ============================================================
// XLSX Viewer Component
// ============================================================
function XlsxViewer({ sheets }: { sheets: SheetData[] }) {
  const [activeSheet, setActiveSheet] = useState(0);
  const sheet = sheets[activeSheet];
  if (!sheet) return <div style={{ color: "#999", padding: 20 }}>No sheets found</div>;

  return (
    <div>
      {/* Sheet tabs */}
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

      {/* Info */}
      <div style={{ fontSize: 12, color: "#666", marginBottom: 8 }}>
        {sheet.rowCount} rows × {sheet.colCount} cols
      </div>

      {/* Table */}
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
      {slideInfo && (
        <div style={{ fontSize: 12, color: "#666", marginBottom: 8 }}>{slideInfo}</div>
      )}
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
        const sheets = await parseXlsx(buffer);
        setXlsxData(sheets);
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

      {/* Upload area */}
      <div
        onDrop={onDrop}
        onDragOver={(e) => e.preventDefault()}
        onClick={() => document.getElementById("spike-file-input")?.click()}
        style={{
          border: "2px dashed #ccc", borderRadius: 12, padding: 40,
          textAlign: "center", marginBottom: 24, cursor: "pointer",
        }}
      >
        <div style={{ fontSize: 36, marginBottom: 8 }}>📄</div>
        <strong>拖拽文件到此处，或点击选择</strong>
        <p style={{ color: "#666", fontSize: 14, marginTop: 8 }}>支持 .xlsx / .pptx 文件</p>
        <input
          id="spike-file-input"
          type="file"
          accept=".xlsx,.pptx"
          style={{ display: "none" }}
          onChange={(e) => {
            if (e.target.files?.[0]) handleFile(e.target.files[0]);
          }}
        />
      </div>

      {/* File info */}
      {fileName && (
        <div style={{ padding: 12, background: "#f0f9ff", borderRadius: 8, marginBottom: 16, fontSize: 13, color: "#1e40af" }}>
          File: {fileName} ({(fileSize / 1024).toFixed(1)} KB)
        </div>
      )}

      {/* Error */}
      {error && (
        <div style={{ padding: 12, background: "#fef2f2", borderRadius: 8, marginBottom: 16, fontSize: 13, color: "#991b1b" }}>
          {error}
        </div>
      )}

      {/* XLSX Preview */}
      {xlsxData && (
        <div>
          <h2 style={{ fontSize: 18, margin: "24px 0 12px", color: "#333" }}>XLSX Preview (ExcelJS + HTML Table)</h2>
          <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 12, padding: 16 }}>
            <XlsxViewer sheets={xlsxData} />
          </div>
        </div>
      )}

      {/* PPTX Preview */}
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
