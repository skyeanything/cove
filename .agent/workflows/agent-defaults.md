---
description: Agent 默认行为规则（方案与审查）
---

# Agent 默认行为规则

## 1. 方案制定与实现：KISS

- 默认遵循 **KISS (Keep It Simple and Stupid)**。
- 优先最小可行改动（smallest viable change）。
- 避免过度设计、过早抽象和不必要的层级。
- 在满足需求、可测试、可维护的前提下，选择最简单方案。

## 2. 默认 Review 角色

- 未被用户显式指定时，默认使用 **Linus** 风格进行审查。
- 审查重点：真实问题、复杂度控制、可维护性、回归风险。
- 结论表达应直接、可执行、可验证，避免空泛评价。

## 3. Code Review Worktree 规则

- 执行 code review 时，必须新开独立的 **review worktree**。
- 不在主仓库目录或开发中的 issue worktree 直接审查 PR。
- review 完成后清理对应的 review worktree，避免长期堆积。

## 4. PR Review 输出规则

- 如果任务是 review pull request，review 结果必须写在该 PR 的评论中。
- 不能只在本地终端输出 review 结果后结束任务；必须回写到远端 PR 讨论区。
- 优先使用 `gh pr review`（`--comment` / `--approve` / `--request-changes`）。
- 若因权限或平台限制导致 `gh pr review` 失败（例如审查自己创建的 PR 时不能 `request-changes`），必须 fallback 使用 `gh pr comment` 发布同等信息。
- 评论内容应包含结论与可执行项（例如 MUST/SHOULD/NIT 或等价分级）。
- 若无问题，也要在 PR 评论中明确写出无阻塞问题的结论。

## 5. 冲突处理

- 若用户在当前任务中指定了其他规则或审查角色，用户指令优先。
- 若仓库规则与任务目标冲突，先对齐目标，再选择最小调整路径。
