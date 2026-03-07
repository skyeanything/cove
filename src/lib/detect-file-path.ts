import { getPreviewKind } from "@/lib/preview-types";

/**
 * File-path pattern for inline code detection in assistant markdown.
 * Matches:
 * - Absolute paths starting with /
 * - Relative paths with at least one directory separator (src/main.tsx, ./foo/bar.ts)
 *
 * Must have a file extension to avoid false positives on arbitrary text.
 */
const FILE_PATH_PATTERN = /^(?:\.{0,2}\/)?(?:[\w.@-]+\/)+[\w.-]+\.\w+$/;

/**
 * Bare filename pattern: `report.docx`, `data.csv`, etc.
 * No directory separator required, but must have extension >= 2 chars.
 * Must start with a word character (not `.` — avoids `.gitignore` etc.).
 */
const BARE_FILENAME_PATTERN = /^[\w][\w.-]*\.\w{2,}$/;

/**
 * Bare filenames that look like common prose terms rather than actual files.
 * These are rejected even if their extension is supported by getPreviewKind.
 * FilePathChip has async existence verification as a second safety net,
 * but these are so common in text that we block them at detection level.
 */
const BARE_FILENAME_BLOCKLIST = new Set([
  "console.log",
  "node.js",
  "vue.js",
  "next.js",
  "nuxt.js",
  "react.js",
  "angular.js",
  "ember.js",
  "express.js",
  "electron.js",
]);

/**
 * Check if an inline code or bold text looks like a file path that we can preview.
 * Bare filenames are checked via getPreviewKind + blocklist.
 * FilePathChip provides async existence verification as a second safety net.
 */
export function detectPreviewableFilePath(text: string): string | null {
  const trimmed = text.trim();
  if (!trimmed) return null;

  // Full path with directory separator — broad check via getPreviewKind
  if (FILE_PATH_PATTERN.test(trimmed)) {
    const kind = getPreviewKind(trimmed);
    if (kind === "unsupported") return null;
    return trimmed;
  }

  // Bare filename — check via getPreviewKind, with blocklist for common prose terms
  if (BARE_FILENAME_PATTERN.test(trimmed)) {
    if (BARE_FILENAME_BLOCKLIST.has(trimmed.toLowerCase())) return null;
    const kind = getPreviewKind(trimmed);
    if (kind === "unsupported") return null;
    return trimmed;
  }

  return null;
}
