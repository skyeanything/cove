---
description: Issue 拆分规范 — Epic 分解与子 Issue 粒度控制
---

# Issue 拆分规范

> 大型任务 MUST 先创建 Epic issue，再拆分为子 issue。本文档定义拆分的强制规则。

## 粒度标准 — 以 AI Code Agent 单次 session 可完成为度

- 每个子 issue MUST 能在一个 AI Code Agent session 内完成（含编码、测试、验证）
- 源码影响范围建议 **200-600 行**，产出代码建议 **200-500 行**
- 涉及文件数建议 **2-5 个**（同一模块/职责域内的相关文件）

## 独立性要求

- 每个子 issue MUST 可独立开发、独立提 PR、独立通过 CI 验证
- 子 issue 之间 MUST NOT 存在循环依赖
- 如存在前置依赖（如基础设施 issue），MUST 在 issue body 中注明 `依赖: #<id>`

## 可验证性要求

- 每个子 issue MUST 包含明确的验收标准（Acceptance Criteria，用 checkbox 列出）
- 每个子 issue MUST 包含验证命令（如 `pnpm test`、`cargo test` 的具体执行方式）
- 验收标准 MUST 可由自动化命令判定通过/失败，不依赖人工主观判断

## 分组策略

- 按**职责域**分组，不按文件类型（如：把同一功能的 store + lib + test 放一个 issue，而非「所有 store 一个 issue」）
- 同一 CRUD 模式的多个小文件可合并为一个 issue（如 7 个相似的 DB repo）
- 复杂模块（>300 行、多分支逻辑）MUST 独立为一个 issue

## Epic Body 要求

- MUST 包含子 issue 索引（按 Phase 分组，带 checkbox 追踪进度）
- MUST 包含依赖关系图（文本即可，标明哪些可并行、哪些有前置）
- MUST 包含目标指标（可量化的完成标准）

## 子 Issue Body 模板

```markdown
Parent Epic: #<epic-id> (Phase N)

## 目标
一句话描述本 issue 要达成的结果。

## 范围
| 文件 | 行数 | 要点 |
|------|------|------|
| `path/to/file.ts` | 120 | 具体要做什么 |

## 关键场景 / 设计要点
（按需列出核心逻辑、边界条件、需要 mock 的依赖等）

## 验收标准
- [ ] 条件 1
- [ ] 条件 2
- [ ] `pnpm test` / `cargo test` 全部通过

## 验证命令
```bash
pnpm vitest run path/to/file.test.ts
```

## 依赖（可选）
建议先完成 #<id>（原因）。
```
