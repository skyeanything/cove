---
description: Git Worktree 并行开发流程 - 同时进行多个 Issue 开发
---

# Git Worktree 并行开发流程

> 使用 git worktree 可以在同一个仓库中**并行开发多个 Issue**，无需频繁 stash 或切换分支。

## 📁 目录结构

```
/Users/lizc/code/
├── cove/                                # 主工作目录 (main 分支)
└── cove-worktrees/                      # Worktree 根目录
    ├── issue-42-add-mcp-support/        # Issue #42 的 worktree
    ├── issue-88-stream-fix/             # Issue #88 的 worktree
    └── fix-63-attachment-bug/           # 修复 #63 的 worktree
```

## 前置检查（Hard Constraint）

创建 Issue 前 MUST 先搜索是否已有相同或相似的 Issue，避免重复创建：

```bash
gh issue list -S "<关键词>" --state all
```

确认无重复后再创建新 Issue。

## 🚀 开始新 Issue 开发 (推荐)

使用 `scripts/start-worktree.sh` 脚本可以自动完成分支规范化、目录创建和 worktree 初始化。

```bash
# 用法: ./scripts/start-worktree.sh <type> <issue-id> <description>

# 示例：开始 Issue #42 开发
./scripts/start-worktree.sh feature 42 add-mcp-support
```

脚本会自动执行以下操作：
1. 更新本地 `main` 分支
2. 创建目录 `/Users/lizc/code/cove-worktrees/issue-42-add-mcp-support`
3. 创建分支 `feature/issue-42-add-mcp-support`
4. 将 worktree 关联到该分支

### 手动方式（如果不使用脚本）

1. 创建 worktree 目录（如不存在）
```bash
mkdir -p /Users/lizc/code/cove-worktrees
```

2. 从 main 创建带分支的 worktree
```bash
git worktree add -b feature/issue-<id>-<short-desc> \
  /Users/lizc/code/cove-worktrees/issue-<id>-<short-desc> \
  main
```

## 📋 常用命令

### 列出所有 worktree
```bash
git worktree list
```

### 切换到指定 Issue 工作
```bash
cd /Users/lizc/code/cove-worktrees/issue-<id>-<desc>
```

### 为 PR 审查创建独立 review worktree（必须）
```bash
# 示例：审查 PR #100
git worktree add -b codex/pr-100-review \
  /Users/lizc/code/cove-worktrees/pr-100-review \
  main

cd /Users/lizc/code/cove-worktrees/pr-100-review
gh pr checkout 100
```

### Issue 完成后清理 worktree
```bash
# 先删除 worktree
git worktree remove /Users/lizc/code/cove-worktrees/issue-<id>-<desc>

# PR 合并后删除远程分支
git push origin --delete feature/issue-<id>-<desc>

# 删除本地分支
git branch -d feature/issue-<id>-<desc>
```

## 📝 命名规范

| 类型 | 分支名 | Worktree 目录名 |
|------|--------|-----------------|
| 新功能 | `feature/issue-<id>-<desc>` | `issue-<id>-<desc>` |
| Bug 修复 | `fix/issue-<id>-<desc>` | `fix-<id>-<desc>` |
| 文档更新 | `docs/issue-<id>-<desc>` | `docs-<id>-<desc>` |
| 重构 | `refactor/issue-<id>-<desc>` | `refactor-<id>-<desc>` |

## 🔄 同步 main 到 worktree

当需要将 main 的最新更改同步到你的 worktree：

```bash
# 在 worktree 目录中
git fetch origin
git rebase origin/main
```

## ⚠️ 注意事项

1. **每个分支只能有一个 worktree** - 同一个分支不能同时关联多个 worktree
2. **不要删除 .git 目录** - 所有 worktree 共享同一个 .git 目录（在主目录中）
3. **合并后及时清理** - PR 合并后记得清理对应的 worktree，避免占用磁盘空间
4. **IDE 支持** - VS Code 和 Cursor 都可以直接打开 worktree 目录作为独立项目
5. **Code Review 必须独立 worktree** - 审查 PR 时必须新开 review worktree，不与开发 worktree 混用
