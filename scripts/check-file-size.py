#!/usr/bin/env python3
"""Check that .ts/.tsx/.rs files stay within the project's line-count limits.

Limits (from CLAUDE.md):
  - 400 lines for .ts/.tsx code files
  - 500 lines for .test.ts/.spec.ts test files
  - 300 lines for .rs Rust files

A file passes if it is under the limit, contains a FILE_SIZE_EXCEPTION comment,
or is listed in the baseline (scripts/file-size-known-exceptions.txt).

Uses a baseline / stale-detection pattern with scripts/file-size-known-exceptions.txt.
"""

import sys
from pathlib import Path

TS_CODE_LIMIT = 400
TS_TEST_LIMIT = 500
RS_LIMIT = 300
EXCEPTION_MARKER = "FILE_SIZE_EXCEPTION"

# Directories excluded from scanning (vendored libraries, build artifacts, shadcn primitives)
EXCLUDE_DIRS = {"node_modules", "target", "dist", "ui"}

# Paths excluded from scanning (shadcn ui components - DO NOT modify per CLAUDE.md)
EXCLUDE_PATH_PREFIXES = ("src/components/ui/",)


def read_text(path: Path) -> str:
    if not path.exists():
        return ""
    return path.read_text(encoding="utf-8", errors="ignore")


def normalize(path: str) -> str:
    """Normalize path separators to forward slashes for cross-platform baseline comparison."""
    return path.replace("\\", "/")


def get_ts_limit(rel_path: str) -> int:
    """Return the line limit based on whether the file is a test file."""
    name = rel_path.split("/")[-1]
    if ".test." in name or ".spec." in name:
        return TS_TEST_LIMIT
    return TS_CODE_LIMIT


def is_excluded(rel_parts: tuple[str, ...], rel_path: str) -> bool:
    """Check if any path component is in the exclusion set, or matches excluded path prefixes."""
    if EXCLUDE_DIRS & set(rel_parts):
        return True
    for prefix in EXCLUDE_PATH_PREFIXES:
        if rel_path.startswith(prefix):
            return True
    return False


def load_baseline(baseline_path: Path) -> set[str]:
    """Read known-exception file paths (# comments and blank lines ignored)."""
    content = read_text(baseline_path)
    entries: set[str] = set()
    for line in content.splitlines():
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        entry = line.split("#")[0].strip()
        if entry:
            entries.add(normalize(entry))
    return entries


def count_lines(content: str) -> int:
    line_count = content.count("\n")
    if content and not content.endswith("\n"):
        line_count += 1
    return line_count


def check_files(
    base_dir: Path,
    pattern: str,
    get_limit_fn,
    baseline: set[str],
    violations: list,
    passed_baseline: set[str],
) -> None:
    for f in sorted(base_dir.rglob(pattern)):
        rel = f.relative_to(base_dir)
        rel_path = normalize(str(rel))
        if is_excluded(rel.parts, rel_path):
            continue

        content = read_text(f)
        line_count = count_lines(content)
        limit = get_limit_fn(rel_path)

        if line_count <= limit:
            continue

        if EXCEPTION_MARKER in content:
            continue

        if rel_path in baseline:
            passed_baseline.add(rel_path)
            continue

        violations.append((rel_path, line_count, limit))


def main() -> None:
    base_dir = Path(__file__).resolve().parents[1]
    baseline_path = base_dir / "scripts/file-size-known-exceptions.txt"
    baseline = load_baseline(baseline_path)

    print("🔍 Checking file size limits (.ts/.tsx/.rs)...")

    violations: list[tuple[str, int, int]] = []
    passed_baseline: set[str] = set()

    # Check TypeScript files
    for pattern in ("*.ts", "*.tsx"):
        check_files(base_dir, pattern, get_ts_limit, baseline, violations, passed_baseline)

    # Check Rust files
    check_files(base_dir, "*.rs", lambda _: RS_LIMIT, baseline, violations, passed_baseline)

    fail = False

    if violations:
        print("❌ Files exceeding line-count limit:")
        for rel_path, lines, limit in sorted(violations):
            print(f"  - {rel_path}: {lines} lines (limit: {limit})")
        print()
        print("To fix, either:")
        print("  1. Refactor the file to stay within the limit")
        print(f"  2. Add a // {EXCEPTION_MARKER}: <reason> comment to the file")
        print("  3. Add the file path to scripts/file-size-known-exceptions.txt")
        fail = True
    else:
        print("✅ All files are within limits or have valid exceptions.")

    # Detect stale baseline entries
    stale_removed: set[str] = set()
    stale_under_limit: set[str] = set()
    stale_has_exception: set[str] = set()

    for entry in baseline:
        file_path = base_dir / entry
        if not file_path.exists():
            stale_removed.add(entry)
            continue

        content = read_text(file_path)
        line_count = count_lines(content)

        if entry.endswith(".rs"):
            limit = RS_LIMIT
        else:
            limit = get_ts_limit(entry)

        if line_count <= limit:
            stale_under_limit.add(entry)
        elif EXCEPTION_MARKER in content:
            stale_has_exception.add(entry)

    all_stale = stale_removed | stale_under_limit | stale_has_exception
    if all_stale:
        print("⚠️  Stale baseline entries (remove from file-size-known-exceptions.txt):")
        for entry in sorted(stale_removed):
            print(f"  - {entry}  (file no longer exists)")
        for entry in sorted(stale_under_limit):
            print(f"  - {entry}  (now within limit)")
        for entry in sorted(stale_has_exception):
            print(f"  - {entry}  (has {EXCEPTION_MARKER} comment)")
        fail = True

    total_baseline = len(passed_baseline)
    print(f"\n📊 Baseline exceptions: {total_baseline} file(s)")

    if fail:
        sys.exit(1)

    print("🚀 File size check passed!")
    sys.exit(0)


if __name__ == "__main__":
    main()
