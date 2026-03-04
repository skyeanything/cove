# 贡献指南

本文档面向人类开发者和 AI code agent，提供参与 cove 项目开发的实操流程。详细的设计规范和技术架构见 `CLAUDE.md`、`AGENTS.md` 及 `.agent/workflows/` 目录。

## 前置条件

| 依赖 | 版本 |
|------|------|
| Node.js | >= 20 |
| pnpm | >= 10 |
| Rust | >= 1.77.2 |
| Python 3 | 文件大小校验脚本需要 |

主支持平台：macOS。

## 环境搭建

```bash
# 克隆仓库
git clone https://github.com/skyeanything/cove.git
cd cove

# 安装前端依赖
pnpm install

# 启动完整桌面开发环境（前端 + Rust）
pnpm tauri dev

# 仅启动前端 Vite dev server（不含 Tauri）
pnpm dev
```

首次 `pnpm tauri dev` 会编译 Rust 后端，耗时较长。后续增量编译会快得多。

## 开发流程

### Issue 先行

所有开发工作必须有对应的 GitHub Issue。没有 Issue 就不要开分支。

大型任务先创建 Epic issue，再拆分为子 issue。子 issue 粒度：200-600 行源码、2-5 个文件，能在一个开发 session 内完成。详见 `.agent/workflows/issue-decomposition.md`。

### Worktree 工作流

功能开发在独立 worktree 中进行，主目录保持 main 分支干净。

```bash
# 创建 worktree（推荐）
./scripts/start-worktree.sh <type> <issue-id> <desc>

# 示例
./scripts/start-worktree.sh feature 42 add-mcp-support
./scripts/start-worktree.sh fix 88 stream-error
./scripts/start-worktree.sh docs 202 contributing-guide
```

脚本会自动：更新 main、创建 worktree 目录、创建规范分支名、关联分支。

完成后清理：

```bash
git worktree remove /Users/lizc/code/cove-worktrees/issue-<id>-<desc>
git push origin --delete <branch-name>
git branch -d <branch-name>
```

详见 `.agent/workflows/worktree-parallel.md`。

### 分支命名

| 类型 | 格式 |
|------|------|
| 新功能 | `feature/issue-<id>-<desc>` |
| Bug 修复 | `fix/issue-<id>-<desc>` |
| 文档 | `docs/issue-<id>-<desc>` |
| 重构 | `refactor/issue-<id>-<desc>` |

分支名必须包含 Issue 编号。不要直接推送到 main。

## 代码规范

### 文件大小限制

| 文件类型 | 上限 |
|----------|------|
| `.ts` / `.tsx` | 400 行 |
| `.test.ts` / `.spec.ts` | 500 行 |
| `.rs` | 300 行 |

超出时在文件顶部添加 `// FILE_SIZE_EXCEPTION: <原因>`。`src/components/ui/` 下的 shadcn 原语文件豁免。

Pre-commit hook 会自动校验，超限的提交会被阻止。

### 命名规范

| 类别 | 规则 | 示例 |
|------|------|------|
| 组件 | PascalCase | `ChatMessage.tsx` |
| Hooks | camelCase + `use` 前缀 | `useChatStore.ts` |
| Stores | camelCase | `chatStore.ts` |
| Utils | camelCase | `formatDate.ts` |
| 类型 | PascalCase，无 `I` 前缀 | `Message` |

### TypeScript

- strict 模式，`noUnusedLocals`、`noUnusedParameters`、`noUncheckedIndexedAccess`
- 禁止 `any` 类型
- 路径别名：`@/` 映射到 `./src/`
- 样式：仅使用 Tailwind utility classes，无自定义 CSS

完整规范见 `CLAUDE.md` 的 "Code Conventions" 和 "Design System" 章节。

## 测试要求

### 基本规则

- 新增或修改的 `.ts` / `.tsx` 源文件必须有对应测试文件
- 对应关系：`foo.ts` -> `foo.test.ts`，`Foo.tsx` -> `Foo.test.tsx`
- 含交互逻辑、条件渲染或状态管理的组件必须有 `.test.tsx`

### 豁免

纯类型文件、`src/components/ui/`、配置文件、`src/i18n/`、`src/types/`。

### 测试维度

每个测试文件须覆盖（适用时）：

- **正常路径**：典型输入的预期行为
- **边界条件**：空值、空数组、极端长度
- **错误处理**：异常抛出、reject 场景
- **状态变迁**：多步操作后的状态一致性

### 技术栈

vitest + `@testing-library/react` + `@testing-library/user-event` + `happy-dom`。

详见 `.agent/workflows/test-quality.md`。

## 提交前检查

PR 提交前必须通过以下全部检查：

```bash
# 1. 前端构建 + 类型检查
pnpm run build

# 2. 运行测试
pnpm test

# 3. 测试覆盖率
pnpm test:coverage

# 4. Rust 静态检查
(cd src-tauri && cargo check)

# 5. 文件大小校验
python3 scripts/check-file-size.py
```

详见 `.agent/workflows/build-and-test.md`。

## PR 提交

### 标题格式

```
feat: add MCP support
fix: resolve stream error on reconnect
docs: add contributing guide
refactor: split SkillsPage into focused modules
chore: update dependencies
```

### Body 要求

- 包含 `Closes #<id>` 关联对应 Issue
- Summary 用 bullet points 列出具体变更
- 包含 Test plan（如何验证）

### 创建 PR

```bash
git push origin <branch-name>
gh pr create --title "type: description" --body "..."
```

详见 `.agent/workflows/submit-pr.md`。

## 写作风格

所有 commit message、PR 描述、代码注释、文档均遵循以下规则：

- 无 emoji
- Commit message 用祈使语气："Add X"，非 "Added X"
- 直接、精确、无废话
- 不使用 "comprehensive"、"robust"、"elegant" 等自夸词汇
- PR 描述用 bullet points，不用散文

详见 `.agent/workflows/writing-style.md`。

## AI Agent 开发者

如果你是 AI code agent，开始工作前按 `AGENTS.md` 中的顺序阅读所有必读文档。优先级：

```
CLAUDE.md Hard Constraints > .agent/workflows/*.md > 其他项目文档
```

## 参考文档索引

| 文档 | 内容 |
|------|------|
| `CLAUDE.md` | 技术栈、设计系统、代码规范、文件结构 |
| `AGENTS.md` | AI 工具必读顺序、命令速查表 |
| `.agent/workflows/worktree-parallel.md` | Worktree 并行开发详细流程 |
| `.agent/workflows/issue-decomposition.md` | Issue 拆分规范 |
| `.agent/workflows/build-and-test.md` | 构建测试流水线 |
| `.agent/workflows/test-quality.md` | 测试质量约束 |
| `.agent/workflows/submit-pr.md` | PR 提交流程 |
| `.agent/workflows/writing-style.md` | 写作风格规范 |
| `docs/architecture.md` | 前端架构与数据流 |
| `docs/tools.md` | AI 工具参数与使用场景 |
