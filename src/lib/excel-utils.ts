import ExcelJS from "exceljs";

// ============================================================
// Types
// ============================================================
export interface SheetData {
  name: string;
  rows: CellData[][];
  colCount: number;
  rowCount: number;
  merges: Map<string, MergeInfo>;
}

export interface CellData {
  value: string;
  style: React.CSSProperties;
}

export interface MergeInfo {
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

export function colToLetter(col: number): string {
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
    const decorations: string[] = [];
    if (f.underline) decorations.push("underline");
    if (f.strike) decorations.push("line-through");
    if (decorations.length) css.textDecoration = decorations.join(" ");
    if (f.size) css.fontSize = f.size + "px";
    if (f.name) css.fontFamily = f.name;
    const fontColor = resolveColor(f.color);
    if (fontColor) css.color = fontColor;
  }

  if (style.fill && style.fill.type === "pattern") {
    const fill = style.fill as ExcelJS.FillPattern;
    const bgColor = resolveColor(fill.fgColor as { argb?: string; theme?: number; tint?: number });
    if (bgColor && bgColor !== "#FFFFFF" && bgColor !== "#ffffff") {
      css.backgroundColor = bgColor;
    }
  }

  if (style.alignment) {
    const a = style.alignment;
    if (a.horizontal) css.textAlign = a.horizontal as React.CSSProperties["textAlign"];
    if (a.vertical) {
      const vMap: Record<string, string> = { top: "top", middle: "middle", bottom: "bottom" };
      css.verticalAlign = vMap[a.vertical] || "middle";
    }
    if (a.wrapText) { css.whiteSpace = "pre-wrap"; css.maxWidth = "200px"; }
  }

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

export function getCellDisplayValue(cell: ExcelJS.Cell): string {
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
export async function parseXlsx(buffer: ArrayBuffer): Promise<SheetData[]> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);

  const sheets: SheetData[] = [];

  workbook.eachSheet((sheet) => {
    const colCount = Math.min(sheet.columnCount || 26, 50);
    const rowCount = Math.min(sheet.rowCount || 0, 500);

    const merges = new Map<string, MergeInfo>();
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
