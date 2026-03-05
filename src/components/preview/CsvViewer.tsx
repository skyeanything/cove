import { useMemo } from "react";
import Papa from "papaparse";
import { useTranslation } from "react-i18next";

const MAX_ROWS = 500;
const MAX_COLS = 50;

interface CsvViewerProps {
  text: string;
  className?: string;
}

export function CsvViewer({ text, className }: CsvViewerProps) {
  const { t } = useTranslation();

  const { headers, rows, truncatedRows, truncatedCols, totalRows, totalCols } = useMemo(() => {
    const result = Papa.parse<string[]>(text, {
      header: false,
      skipEmptyLines: true,
    });
    const allRows = result.data;
    const rawTotalRows = allRows.length;
    const rawTotalCols = allRows.reduce((max, row) => Math.max(max, row.length), 0);

    const headerRow = allRows[0] ?? [];
    const dataRows = allRows.slice(1);

    const limitedCols = Math.min(rawTotalCols, MAX_COLS);
    const limitedRows = dataRows.slice(0, MAX_ROWS);

    return {
      headers: headerRow.slice(0, limitedCols),
      rows: limitedRows.map((row) => row.slice(0, limitedCols)),
      truncatedRows: dataRows.length > MAX_ROWS,
      truncatedCols: rawTotalCols > MAX_COLS,
      totalRows: Math.max(0, rawTotalRows - 1),
      totalCols: rawTotalCols,
    };
  }, [text]);

  return (
    <div className={className}>
      <div className="mb-2 text-[12px] text-muted-foreground">
        {totalRows} {t("preview.csvRows")} x {totalCols} {t("preview.csvCols")}
        {(truncatedRows || truncatedCols) && (
          <span className="ml-2 text-foreground-tertiary">
            ({t("preview.csvTruncated", {
              rows: Math.min(totalRows, MAX_ROWS),
              cols: Math.min(totalCols, MAX_COLS),
            })})
          </span>
        )}
      </div>
      <div className="max-h-[70vh] overflow-auto rounded-lg border border-border">
        <table className="w-full border-collapse text-[13px]">
          <thead>
            <tr>
              <th className="sticky top-0 z-10 min-w-[40px] border border-border bg-background-tertiary px-2 py-1 text-center font-medium text-muted-foreground" />
              {headers.map((header, i) => (
                <th
                  key={i}
                  className="sticky top-0 z-10 min-w-[60px] border border-border bg-background-tertiary px-2 py-1 text-left font-medium text-foreground"
                >
                  {header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, ri) => (
              <tr key={ri} className={ri % 2 === 1 ? "bg-background-secondary" : ""}>
                <td className="min-w-[40px] border border-border bg-background-tertiary px-2 py-1 text-center text-muted-foreground">
                  {ri + 1}
                </td>
                {row.map((cell, ci) => (
                  <td
                    key={ci}
                    className="min-w-[60px] max-w-[200px] overflow-hidden text-ellipsis whitespace-nowrap border border-border px-2 py-1"
                  >
                    {cell}
                  </td>
                ))}
                {row.length < headers.length &&
                  Array.from({ length: headers.length - row.length }, (_, i) => (
                    <td key={`empty-${i}`} className="border border-border px-2 py-1" />
                  ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
