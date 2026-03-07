/**
 * Generate a duplicate file name: foo.txt -> foo (copy).txt
 * Handles existing copy suffixes: foo (copy).txt -> foo (copy 2).txt
 */
export function getDuplicateName(fileName: string): string {
  const dotIdx = fileName.lastIndexOf(".");
  const hasExt = dotIdx > 0; // dotIdx === 0 means dotfile like .gitignore
  const ext = hasExt ? fileName.slice(dotIdx) : "";
  const base = hasExt ? fileName.slice(0, dotIdx) : fileName;
  const copyMatch = base.match(/^(.+?) \(copy(?: (\d+))?\)$/);
  if (copyMatch) {
    const origBase = copyMatch[1]!;
    const num = copyMatch[2] ? parseInt(copyMatch[2], 10) + 1 : 2;
    return `${origBase} (copy ${num})${ext}`;
  }
  return `${base} (copy)${ext}`;
}

/**
 * Find the next non-colliding duplicate name given a set of existing sibling names.
 * Iterates getDuplicateName until no collision.
 */
export function getAvailableDuplicateName(
  fileName: string,
  existingNames: Set<string>,
): string {
  let candidate = getDuplicateName(fileName);
  const MAX = 100;
  for (let i = 0; i < MAX && existingNames.has(candidate); i++) {
    candidate = getDuplicateName(candidate);
  }
  return candidate;
}
