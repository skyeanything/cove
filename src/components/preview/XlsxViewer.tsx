import { useEffect, useState } from "react";
import ExcelJS from "exceljs";
import { dataUrlToArrayBuffer } from "@/lib/data-url-utils";

interface CellData {
  value: string;
  style: React.CSSProperties;
}

interface MergeInfo {
  skip?: boolean;
  rowSpan?: number;
  colSpan?: number;
}

interface SheetData {
  name: string;
  rows: CellData[][];
  colCount: number;
  rowCount: number;
  merges: Map<string, MergeInfo>;
}

const THEME_COLORS = [
  "#FFFFFF", "#000000", "#44546A", "#4472C4",
  "#ED7D31", "#A5A5A5", "#FFC000", "#5B9BD5",
  "#70AD47", "#264478",
];

function argbToHex(argb: string): string {
  if (!argb) return "#000";
  return argb.length === 8 ? "#" + argb.slice(2) : "#" + argb;
}

function themeColor(theme: number): string {
  return THEME_COLORS[theme] ?? "#000";
}

function resolveColor(color?: { argb?: string; theme?: number }): string | undefined {
  if (!color) return undefined;
  if (color.argb) return argbToHex(color.argb);
  if (color.theme !== undefined) return themeColor(color.theme);
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
  if (style.font) {
    const f = style.font;
    if (f.bold) css.fontWeight = "bold";
    if (f.italic) css.fontStyle = "italic";
    const dec: string[] = [];
    if (f.underline) dec.push("underline");
    if (f.strike) dec.push("line-through");
    if (dec.length) css.textDecoration = dec.join(" ");
    if (f.size) css.fontSize = `${f.size}px`;
    if (f.name) css.fontFamily = f.name;
    const fontColor = resolveColor(f.color as { argb?: string; theme?: number });
    if (fontColor) css.color = fontColor;
  }
  if (style.fill && style.fill.type === "pattern") {
    const fill = style.fill as ExcelJS.FillPattern;
    const bg = resolveColor(fill.fgColor as { argb?: string; theme?: number });
    if (bg && bg !== "#FFFFFF" && bg !== "#ffffff") css.backgroundColor = bg;
  }
  if (style.alignment) {
    const a = style.alignment;
    if (a.horizontal) css.textAlign = a.horizontal as React.CSSProperties["textAlign"];
    if (a.vertical) {
      const v: Record<string, string> = { top: "top", middle: "middle", bottom: "bottom" };
      css.verticalAlign = v[a.vertical] ?? "middle";
    }
    if (a.wrapText) {
      css.whiteSpace = "pre-wrap";
      css.maxWidth = "200px";
    }
  }
  if (style.border) {
    const b = style.border;
    const borderStr = (x: Partial<ExcelJS.Border>) => {
      const w = x.style === "medium" ? "2px" : x.style === "thick" ? "3px" : "1px";
      const s = x.style === "dotted" ? "dotted" : x.style === "dashed" ? "dashed" : "solid";
      const c = resolveColor(x.color as { argb?: string; theme?: number }) ?? "#000";
      return `${w} ${s} ${c}`;
    };
    if (b.top) css.borderTop = borderStr(b.top);
    if (b.bottom) css.borderBottom = borderStr(b.bottom);
    if (b.left) css.borderLeft = borderStr(b.left);
    if (b.right) css.borderRight = borderStr(b.right);
  }
  return css;
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
  }
  return String(v);
}

async function parseXlsx(buffer: ArrayBuffer): Promise<SheetData[]> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);
  const sheets: SheetData[] = [];

  workbook.eachSheet((sheet) => {
    const colCount = Math.min(sheet.columnCount || 26, 50);
    const rowCount = Math.min(sheet.rowCount || 0, 500);
    const merges = new Map<string, MergeInfo>();
    const mergeModels = (sheet as unknown as { _merges?: Record<string, { model: { top: number; left: number; bottom: number; right: number } }> })._merges;
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
    const rows: CellData[][] = [];
    for (let r = 1; r <= rowCount; r++) {
      const row: CellData[] = [];
      for (let c = 1; c <= colCount; c++) {
        const cell = sheet.getCell(r, c);
        row.push({ value: getCellDisplayValue(cell), style: parseCellStyles(cell) });
      }
      rows.push(row);
    }
    sheets.push({ name: sheet.name, rows, colCount, rowCount, merges });
  });
  return sheets;
}

interface XlsxViewerProps {
  dataUrl: string;
  className?: string;
}

export function XlsxViewer({ dataUrl, className }: XlsxViewerProps) {
  const [sheets, setSheets] = useState<SheetData[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string>("");

  useEffect(() => {
    setLoading(true);
    setErr("");
    parseXlsx(dataUrlToArrayBuffer(dataUrl))
      .then(setSheets)
      .catch((e: Error) => setErr(e?.message ?? "解析失败"))
      .finally(() => setLoading(false));
  }, [dataUrl]);

  if (loading) {
    return (
      <div className="py-8 text-center text-sm text-muted-foreground">加载 XLSX…</div>
    );
  }
  if (err || !sheets?.length) {
    return (
      <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
        {err || "无工作表"}
      </div>
    );
  }

  return (
    <XlsxSheets sheets={sheets} className={className} />
  );
}

function XlsxSheets({ sheets, className }: { sheets: SheetData[]; className?: string }) {
  const [active, setActive] = useState(0);
  const sheet = sheets[active];
  if (!sheet) return null;

  return (
    <div className={className}>
      <div className="mb-3 flex flex-wrap gap-2">
        {sheets.map((s, i) => (
          <button
            key={i}
            type="button"
            onClick={() => setActive(i)}
            className={`rounded-lg border px-3 py-1.5 text-[13px] ${
              i === active
                ? "border-accent bg-accent text-accent-foreground"
                : "border-border bg-background-tertiary text-foreground-secondary hover:text-foreground"
            }`}
          >
            {s.name}
          </button>
        ))}
      </div>
      <div className="text-[12px] text-muted-foreground">
        {sheet.rowCount} 行 × {sheet.colCount} 列
      </div>
      <div className="mt-2 max-h-[70vh] overflow-auto rounded-lg border border-border">
        <table className="w-full border-collapse text-[13px]">
          <thead>
            <tr>
              <th className="sticky top-0 z-10 min-w-[40px] border border-border bg-background-tertiary px-2 py-1 text-center font-medium text-muted-foreground" />
              {Array.from({ length: sheet.colCount }, (_, i) => (
                <th
                  key={i}
                  className="sticky top-0 z-10 min-w-[60px] border border-border bg-background-tertiary px-2 py-1 text-center font-medium text-muted-foreground"
                >
                  {colToLetter(i + 1)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sheet.rows.map((row, ri) => (
              <tr key={ri}>
                <td className="min-w-[40px] border border-border bg-background-tertiary px-2 py-1 text-center text-muted-foreground">
                  {ri + 1}
                </td>
                {row.map((cell, ci) => {
                  const merge = sheet.merges.get(`${ri + 1},${ci + 1}`);
                  if (merge?.skip) return null;
                  return (
                    <td
                      key={ci}
                      rowSpan={merge?.rowSpan}
                      colSpan={merge?.colSpan}
                      className="min-w-[60px] max-w-[200px] border border-border px-2 py-1 overflow-hidden text-ellipsis whitespace-nowrap"
                      style={cell.style}
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
