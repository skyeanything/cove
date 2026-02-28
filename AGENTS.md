# AGENTS.md — AI 工具必读顺序

> 所有 AI 辅助开发工具（Claude Code、Cursor、Copilot 等）在开始工作前必须按以下顺序阅读文档。

## 必读顺序

1. **`.agent/workflows/worktree-parallel.md`** — Git Worktree 并行开发流程（新功能必须在独立 worktree 中开发）
2. **`.agent/workflows/agent-defaults.md`** — Agent 默认行为（KISS、Review 角色、PR Review 输出规则）
3. **`.agent/workflows/issue-decomposition.md`** — Issue 拆分规范（Epic 分解、子 Issue 粒度、模板）
4. **`.agent/workflows/build-and-test.md`** — 构建与测试命令（提交前必须通过）
5. **`.agent/workflows/test-quality.md`** — 测试质量约束（覆盖率、组件测试、文档覆盖度）
6. **`.agent/workflows/submit-pr.md`** — PR 提交规范与流程
7. **`CLAUDE.md`** — 项目设计规范、技术栈、代码约定（Hard Constraints）

## 优先级

```
CLAUDE.md Hard Constraints
  > .agent/workflows/*.md 工作流规则
    > 其他项目文档
```

## 快速参考

| 任务 | 命令 |
|------|------|
| 开始新 Issue | `./scripts/start-worktree.sh <type> <id> <desc>` |
| 前端构建+类型检查 | `pnpm run build` |
| 运行测试 | `pnpm test` |
| 测试覆盖率检查 | `pnpm test:coverage` |
| Rust 静态检查 | `cd src-tauri && cargo check` |
| 文件大小校验 | `python3 scripts/check-file-size.py` |
| 创建 PR | `gh pr create --title "type: desc" --body "..."` |
| 审查 PR 并回写评论 | `gh pr review <id> --comment ...` / `gh pr comment <id> ...` |

## 文件大小限制（Hard Constraint）

- `.ts` / `.tsx` 代码文件：**400 行**上限
- `.test.ts` / `.spec.ts` 测试文件：**500 行**上限
- `.rs` Rust 文件：**300 行**上限
- 超出时在文件顶部添加 `// FILE_SIZE_EXCEPTION: <原因>`
- `src/components/ui/` 下的 shadcn 原语文件豁免

## officellm 双轨体系

Cove 中有两套独立的 officellm：内嵌（Tauri tool）和外部安装（bash CLI）。

- 内置 `officellm` skill 是 bootstrap（默认启用，用户可关闭），提供 Tauri tool 基本指引
- 外部 `OfficeLLM` skill 由 skill discovery 扫描发现，用户可启用/禁用
- 两者可共存、版本独立，各自 skill 匹配各自 CLI 版本
- 修改相关代码前 **必读** [`docs/officellm-dual-track.md`](docs/officellm-dual-track.md)

## Code Review 强制规则

- 任务是 review PR 时，必须将 review 结论写回对应 PR 讨论区，不能只在本地终端输出。
- 优先使用 `gh pr review`；若因权限/平台限制无法提交（例如审查自己创建的 PR 不能 `request-changes`），必须 fallback 到 `gh pr comment`。
- 即使无阻塞问题，也必须在 PR 留下明确结论（例如 “No blocking issues”）。
