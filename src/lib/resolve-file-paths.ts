import { getPreviewKind } from "@/lib/preview-types";

/**
 * Regex to detect directory context headings like `**tests/**` or `**tests**`.
 * Captures the directory name (group 1).
 */
const DIR_HEADING_PATTERN = /\*\*([\w][\w.@-]*(?:\/[\w][\w.@-]*)*)\/?(\*\*)/;

/**
 * Matches a markdown list item containing a bare filename in backticks.
 * group 1 = filename (no `/` inside).
 */
const BARE_FILE_IN_LIST = /^[\s]*[-*]\s+.*`([\w][\w.-]*\.\w{2,})`/;

/**
 * Pre-process markdown to resolve bare filenames under directory context headings.
 *
 * When AI output contains patterns like:
 * ```
 * **tests/**
 * - `1.docx`
 * - `temp_content.txt`
 * ```
 *
 * This function prepends the directory to produce `tests/1.docx`, enabling
 * downstream `detectPreviewableFilePath` to match them.
 *
 * Only transforms when the resolved path has a supported preview kind.
 */
export function resolveFilePathsFromContext(markdown: string): string {
  if (!markdown) return markdown;

  const lines = markdown.split("\n");
  let currentDir: string | null = null;
  let inFencedBlock = false;
  const result: string[] = [];

  for (const line of lines) {
    // Track fenced code blocks — never transform inside them
    if (/^(`{3,}|~{3,})/.test(line.trimStart())) {
      inFencedBlock = !inFencedBlock;
      result.push(line);
      continue;
    }
    if (inFencedBlock) {
      result.push(line);
      continue;
    }
    const dirMatch = DIR_HEADING_PATTERN.exec(line);
    if (dirMatch && dirMatch[1]) {
      currentDir = dirMatch[1].replace(/\/+$/, "");
      result.push(line);
      continue;
    }

    // Reset directory context on blank lines or non-list lines
    // (except lines that are themselves the heading)
    if (currentDir && line.trim() !== "" && !/^[\s]*[-*]\s+/.test(line)) {
      currentDir = null;
    }

    if (currentDir && line.trim() === "") {
      result.push(line);
      continue;
    }

    if (currentDir) {
      const fileMatch = BARE_FILE_IN_LIST.exec(line);
      if (fileMatch && fileMatch[1]) {
        const bareFile = fileMatch[1];
        // Only transform if no / already present (truly bare)
        if (!bareFile.includes("/")) {
          const resolved = `${currentDir}/${bareFile}`;
          if (getPreviewKind(resolved) !== "unsupported") {
            result.push(line.replace(`\`${bareFile}\``, `\`${resolved}\``));
            continue;
          }
        }
      }
    }

    result.push(line);
  }

  return result.join("\n");
}
