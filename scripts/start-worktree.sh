#!/bin/bash
set -e

# 用法提示
if [ "$#" -lt 3 ]; then
    echo "Usage: $0 <type> <issue-id> <description>"
    echo "Example: $0 feature 42 add-mcp-support"
    echo "Types: feature, fix, docs, refactor"
    exit 1
fi

TYPE=$1
ISSUE_ID=$2
DESC=$3

# 基础路径
REPO_ROOT=$(git rev-parse --show-toplevel)
WORKTREE_ROOT=$(dirname "$REPO_ROOT")/cove-worktrees

# 规范化名称
BRANCH_NAME="${TYPE}/issue-${ISSUE_ID}-${DESC}"
DIR_NAME="issue-${ISSUE_ID}-${DESC}"
WORKTREE_PATH="${WORKTREE_ROOT}/${DIR_NAME}"

# 检查 worktree 目录是否存在
if [ -d "$WORKTREE_PATH" ]; then
    echo "❌ Worktree directory already exists: $WORKTREE_PATH"
    exit 1
fi

# 创建目录
echo "Creating worktree directory..."
mkdir -p "$WORKTREE_ROOT"

# 同步最新的 main
echo "Fetching latest main..."
git fetch origin main

# 创建 Worktree
echo "Creating worktree for $BRANCH_NAME..."
git worktree add -b "$BRANCH_NAME" "$WORKTREE_PATH" origin/main

echo ""
echo "✅ Worktree created successfully!"
echo "📂 Path: $WORKTREE_PATH"
echo "🌿 Branch: $BRANCH_NAME"
echo ""
echo "🚀 To start working:"
echo "cd $WORKTREE_PATH"
