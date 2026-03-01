#!/bin/bash

REPO_ROOT=$(git rev-parse --show-toplevel)
cd "$REPO_ROOT"

PASSED=0
FAILED=0
TOTAL=5

run_check() {
    local num=$1
    local label=$2
    shift 2
    echo "[$num/$TOTAL] $label"
    if output=$("$@" 2>&1); then
        echo "  PASS"
        PASSED=$((PASSED + 1))
    else
        echo "  FAIL"
        echo "$output" | tail -20 | sed 's/^/  > /'
        FAILED=$((FAILED + 1))
    fi
    echo ""
}

echo "=== Pre-Release Check ==="
echo ""

run_check 1 "Frontend build + tsc type check" pnpm run build
run_check 2 "Unit tests" pnpm test
run_check 3 "Test coverage" pnpm test:coverage
run_check 4 "Rust static check" bash -c "cd src-tauri && cargo check"
run_check 5 "File size check" python3 scripts/check-file-size.py

echo "=== Summary ==="
echo "$PASSED/$TOTAL checks passed"
if [ "$FAILED" -gt 0 ]; then
    echo "$FAILED check(s) failed"
    exit 1
fi
echo "All checks passed. Ready for release."
