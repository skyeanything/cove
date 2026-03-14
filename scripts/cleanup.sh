#!/bin/bash

# Clean up merged worktrees and local/remote branches after PR merge.
# Issue closing requires human judgment (reading PR/issue content) — not automated here.
# Usage: scripts/cleanup.sh [--dry-run]

DRY_RUN=false
if [ "$1" = "--dry-run" ]; then
    DRY_RUN=true
    echo "[dry-run] Preview mode — no changes will be made."
    echo ""
fi

REPO_ROOT=$(git rev-parse --show-toplevel)
WORKTREE_ROOT=$(dirname "$REPO_ROOT")/cove-worktrees

# Must run from main repo, not a worktree
COMMON_DIR=$(git rev-parse --git-common-dir 2>/dev/null)
GIT_DIR=$(git rev-parse --git-dir 2>/dev/null)
if [ "$COMMON_DIR" != "$GIT_DIR" ]; then
    echo "Error: must run from the main repo, not a worktree."
    exit 1
fi

echo "Fetching origin..."
git fetch origin --prune

COUNT_WT=0
COUNT_LOCAL=0
COUNT_REMOTE=0

# === Phase 1: Worktrees ===
echo ""
echo "=== Phase 1: Worktrees ==="

MERGED_BRANCHES=$(git branch --merged main --format='%(refname:short)')

while IFS= read -r line; do
    if [[ "$line" == "worktree "* ]]; then
        wt_path="${line#worktree }"
    elif [[ "$line" == "branch "* ]]; then
        wt_branch="${line#branch refs/heads/}"
    elif [[ -z "$line" && -n "$wt_path" ]]; then
        # Skip main repo worktree
        if [ "$wt_path" = "$REPO_ROOT" ]; then
            wt_path=""
            wt_branch=""
            continue
        fi
        if echo "$MERGED_BRANCHES" | grep -qx "$wt_branch"; then
            echo "  Remove worktree: $wt_path ($wt_branch)"
            if [ "$DRY_RUN" = false ]; then
                if ! git worktree remove "$wt_path" 2>/dev/null; then
                    echo "    Warning: failed to remove (dirty worktree?) — skipping."
                else
                    COUNT_WT=$((COUNT_WT + 1))
                fi
            else
                COUNT_WT=$((COUNT_WT + 1))
            fi
        fi
        wt_path=""
        wt_branch=""
    fi
done < <(git worktree list --porcelain; echo "")

# === Phase 2: Local branches ===
echo ""
echo "=== Phase 2: Local branches ==="

while IFS= read -r branch; do
    branch=$(echo "$branch" | xargs)
    [ -z "$branch" ] && continue
    case "$branch" in
        main|dev|release/*) continue ;;
    esac
    echo "  Delete local branch: $branch"
    if [ "$DRY_RUN" = false ]; then
        if ! git branch -d "$branch" 2>/dev/null; then
            echo "    Warning: failed to delete — skipping."
        else
            COUNT_LOCAL=$((COUNT_LOCAL + 1))
        fi
    else
        COUNT_LOCAL=$((COUNT_LOCAL + 1))
    fi
done < <(git branch --merged main --format='%(refname:short)')

# === Phase 3: Remote branches ===
echo ""
echo "=== Phase 3: Remote branches ==="

while IFS= read -r ref; do
    ref=$(echo "$ref" | xargs)
    [ -z "$ref" ] && continue
    branch="${ref#origin/}"
    case "$branch" in
        main|dev|HEAD|release/*) continue ;;
    esac
    echo "  Delete remote branch: $branch"
    if [ "$DRY_RUN" = false ]; then
        if ! git push origin --delete "$branch" 2>/dev/null; then
            echo "    Warning: failed to delete remote branch — skipping."
        else
            COUNT_REMOTE=$((COUNT_REMOTE + 1))
        fi
    else
        COUNT_REMOTE=$((COUNT_REMOTE + 1))
    fi
done < <(git branch -r --merged main --format='%(refname:short)' | grep '^origin/')

# === Summary ===
echo ""
echo "=== Summary ==="
echo "  Worktrees removed: $COUNT_WT"
echo "  Local branches deleted: $COUNT_LOCAL"
echo "  Remote branches deleted: $COUNT_REMOTE"
if [ "$DRY_RUN" = true ]; then
    echo "  (dry-run — no changes were made)"
fi
