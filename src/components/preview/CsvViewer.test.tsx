// @vitest-environment happy-dom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { CsvViewer } from "./CsvViewer";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, opts?: Record<string, unknown>) => {
      if (opts) return `${key}:${JSON.stringify(opts)}`;
      return key;
    },
  }),
}));

afterEach(cleanup);

// Helpers
function renderCsv(text: string) {
  return render(<CsvViewer text={text} />);
}

function getHeaders(): string[] {
  const ths = document.querySelectorAll("thead th");
  // First th is the empty row-number column; skip it
  return Array.from(ths).slice(1).map((th) => th.textContent ?? "");
}

function getRowNumbers(): string[] {
  const tds = document.querySelectorAll("tbody td:first-child");
  return Array.from(tds).map((td) => td.textContent ?? "");
}

function getCellTexts(): string[][] {
  const rows = document.querySelectorAll("tbody tr");
  return Array.from(rows).map((row) => {
    const cells = Array.from(row.querySelectorAll("td")).slice(1); // skip row-number cell
    return cells.map((td) => td.textContent ?? "");
  });
}

// ── Header rendering ──────────────────────────────────────────────────────
describe("CsvViewer header rendering", () => {
  it("renders column headers from the first row", () => {
    renderCsv("Name,Age,City\nAlice,30,NYC\n");
    const headers = getHeaders();
    expect(headers).toEqual(["Name", "Age", "City"]);
  });

  it("renders a single header column", () => {
    renderCsv("Title\nValue1\n");
    expect(getHeaders()).toEqual(["Title"]);
  });

  it("renders table element", () => {
    renderCsv("A,B\n1,2\n");
    expect(document.querySelector("table")).not.toBeNull();
    expect(document.querySelector("thead")).not.toBeNull();
    expect(document.querySelector("tbody")).not.toBeNull();
  });
});

// ── Data row rendering ────────────────────────────────────────────────────
describe("CsvViewer data row rendering", () => {
  it("renders data rows after the header row", () => {
    renderCsv("Name,Score\nAlice,95\nBob,87\n");
    const cells = getCellTexts();
    expect(cells).toHaveLength(2);
    expect(cells[0]).toEqual(["Alice", "95"]);
    expect(cells[1]).toEqual(["Bob", "87"]);
  });

  it("row numbers start at 1", () => {
    renderCsv("Col\nRow1\nRow2\nRow3\n");
    const rowNums = getRowNumbers();
    expect(rowNums).toEqual(["1", "2", "3"]);
  });

  it("row numbers are sequential for many rows", () => {
    const lines = ["Header"];
    for (let i = 1; i <= 5; i++) lines.push(`value${i}`);
    renderCsv(lines.join("\n"));
    const rowNums = getRowNumbers();
    expect(rowNums).toEqual(["1", "2", "3", "4", "5"]);
  });
});

// ── Quoted fields with embedded commas ───────────────────────────────────
describe("CsvViewer quoted fields", () => {
  it("handles quoted field with embedded comma", () => {
    renderCsv(`"Name","Value"\n"Smith, John","100"\n`);
    const headers = getHeaders();
    expect(headers).toEqual(["Name", "Value"]);
    const cells = getCellTexts();
    expect(cells[0]).toEqual(["Smith, John", "100"]);
  });

  it("handles multiple quoted fields with commas in one row", () => {
    renderCsv(`"A","B","C"\n"x, y","a, b, c","z"\n`);
    const cells = getCellTexts();
    expect(cells[0]).toEqual(["x, y", "a, b, c", "z"]);
  });

  it("handles mix of quoted and unquoted fields", () => {
    renderCsv(`Label,Note\n"Hello, World",plain\n`);
    const cells = getCellTexts();
    expect(cells[0]).toEqual(["Hello, World", "plain"]);
  });
});

// ── Empty CSV ─────────────────────────────────────────────────────────────
describe("CsvViewer empty input", () => {
  it("shows no data rows for empty string", () => {
    renderCsv("");
    const rows = document.querySelectorAll("tbody tr");
    expect(rows.length).toBe(0);
  });

  it("shows no data rows for header-only csv", () => {
    renderCsv("Name,Age\n");
    // Papa skips empty lines so only the header row exists, leaving 0 data rows
    const cells = getCellTexts();
    expect(cells).toHaveLength(0);
  });
});

// ── Summary stats ─────────────────────────────────────────────────────────
describe("CsvViewer summary stats", () => {
  it("displays row count and col count in summary line", () => {
    renderCsv("A,B,C\n1,2,3\n4,5,6\n");
    // t("preview.csvRows") -> "preview.csvRows"
    // t("preview.csvCols") -> "preview.csvCols"
    // Expect "2 preview.csvRows x 3 preview.csvCols"
    expect(screen.getByText(/preview\.csvRows/)).toBeDefined();
    expect(screen.getByText(/preview\.csvCols/)).toBeDefined();
  });

  it("does not show truncation notice for small csv", () => {
    renderCsv("X\n1\n2\n");
    // truncation key should not appear
    expect(screen.queryByText(/preview\.csvTruncated/)).toBeNull();
  });

  it("shows 0 rows for empty CSV, not negative", () => {
    renderCsv("");
    // Should show "0 preview.csvRows", not "-1 preview.csvRows"
    expect(screen.queryByText(/-1/)).toBeNull();
  });
});
