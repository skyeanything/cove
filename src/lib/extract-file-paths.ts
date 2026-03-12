export interface ExtractedPath {
  path: string;
  start: number;
  end: number;
}

const TOOL_PATTERNS: Record<string, RegExp[]> = {
  diagram: [/Diagram saved to:\s*(.+)/],
  office: [/Document saved to:\s*(.+)/],
};

/**
 * Extract file paths from tool result strings.
 * Returns matched paths with their positions in the original text.
 */
export function extractFilePathsFromResult(toolName: string, result: string): ExtractedPath[] {
  const patterns = TOOL_PATTERNS[toolName];
  if (!patterns) return [];

  const results: ExtractedPath[] = [];
  for (const pattern of patterns) {
    const match = pattern.exec(result);
    if (match?.[1]) {
      const path = match[1].trim();
      const start = match.index + match[0].indexOf(path);
      results.push({ path, start, end: start + path.length });
    }
  }
  return results;
}

/**
 * Extract the file path from the intro text of a write/edit diff result.
 * The intro typically looks like: "Successfully wrote to path/to/file.ts"
 * or "Successfully edited path/to/file.ts"
 */
export function extractPathFromDiffIntro(intro: string): string | null {
  // Match common patterns: "wrote to <path>", "edited <path>", "created <path>"
  const match = /(?:wrote to|edited|created|saved to)\s+(.+?)\.?$/i.exec(intro);
  return match?.[1]?.trim() ?? null;
}
