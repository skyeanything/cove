#!/bin/bash
set -e

if [ "$#" -lt 3 ]; then
    echo "Usage: $0 <type> <issue-id> <description> [--base <branch>]"
    echo "Example: $0 feature 42 add-mcp-support"
    echo "Example: $0 fix 99 hotfix-crash --base release/0.2"
    echo "Types: feature, fix, docs, refactor"
    exit 1
fi

TYPE=$1
ISSUE_ID=$2
DESC=$3

# Parse --base option
BASE_BRANCH="origin/main"
if [ "$4" = "--base" ] && [ -n "$5" ]; then
    BASE_BRANCH="$5"
fi

REPO_ROOT=$(git rev-parse --show-toplevel)
WORKTREE_ROOT=$(dirname "$REPO_ROOT")/cove-worktrees

BRANCH_NAME="${TYPE}/issue-${ISSUE_ID}-${DESC}"
DIR_NAME="issue-${ISSUE_ID}-${DESC}"
WORKTREE_PATH="${WORKTREE_ROOT}/${DIR_NAME}"

if [ -d "$WORKTREE_PATH" ]; then
    echo "Worktree directory already exists: $WORKTREE_PATH"
    exit 1
fi

echo "Creating worktree directory..."
mkdir -p "$WORKTREE_ROOT"

echo "Fetching latest from origin..."
git fetch origin

echo "Creating worktree for $BRANCH_NAME (base: $BASE_BRANCH)..."
git worktree add -b "$BRANCH_NAME" "$WORKTREE_PATH" "$BASE_BRANCH"

echo ""
echo "Worktree created successfully!"
echo "Path: $WORKTREE_PATH"
echo "Branch: $BRANCH_NAME"
echo "Base: $BASE_BRANCH"
echo ""
echo "To start working:"
echo "cd $WORKTREE_PATH"
