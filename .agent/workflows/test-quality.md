---
description: Test quality constraints — coverage thresholds, change coverage, component testing, and documentation requirements
---

# 测试质量约束

本文档定义了 cove 项目的测试质量标准。所有 AI Agent 和人类开发者在提交 PR 前 MUST 遵循。

---

## §1 覆盖率阈值（分阶段提升）

| Phase | 触发条件 | Statements | Branches | Functions | Lines |
|-------|----------|-----------|----------|-----------|-------|
| 1 | 立即生效 | 15% | 10% | 15% | 15% |
| 2 | 全局文件覆盖率 >60% | 30% | 25% | 30% | 30% |
| 3 | 全局文件覆盖率 >80% | 50% | 40% | 50% | 50% |
| 4 | 长期目标 | 70% | 60% | 70% | 70% |

**规则**：
- MUST NOT 降低 `vitest.config.ts` 中已提升的阈值
- 阈值适用于全局（`coverage.include: ["src/**/*.{ts,tsx}"]`，统计所有源文件）
- 验证命令：`pnpm test:coverage`
- 提升阶段时更新 `vitest.config.ts` 中的 `thresholds` 并在 PR 中注明

---

## §2 变更覆盖率检查

**MUST**：
- 新增或修改的 `.ts` / `.tsx` 源文件 MUST 有对应的 `.test.ts` 或 `.test.tsx` 测试文件
- 对应关系：`foo.ts` → `foo.test.ts`，`Foo.tsx` → `Foo.test.tsx`（同目录或 `__tests__/` 目录）

**豁免**：
- 纯类型文件（仅含 `type` / `interface` / `enum` 导出）
- `src/components/ui/` — shadcn 原语，DO NOT modify
- 配置文件（`vite.config.ts`、`vitest.config.ts`、`tailwind.config.*`）
- `src/i18n/` — 翻译文件
- `src/types/` — 纯类型定义目录

---

## §3 用例完整度

每个测试文件 MUST 覆盖以下维度（适用时）：

| 维度 | 说明 |
|------|------|
| **正常路径** | 典型输入的预期行为 |
| **边界条件** | 空值、空数组、极端长度、最大/最小值 |
| **错误处理** | 异常抛出、错误返回、reject 场景 |
| **状态变迁** | 多步操作后的状态一致性（Store / 有状态逻辑） |

### Store 测试标准

```typescript
// MUST 使用 createStoreReset() 隔离状态
const resetStore = createStoreReset(useMyStore);
beforeEach(() => resetStore());

// MUST 覆盖：
// - 初始状态验证
// - 每个 action 的行为
// - action 间的交互（如有）
```

### DB Repository 测试标准

```typescript
// MUST 使用 createMockDb() + mockGetDb()
const mockDb = createMockDb();
beforeEach(() => {
  mockGetDb(mockDb);
  mockDb.reset();
});

// MUST 覆盖：
// - CRUD 全路径
// - 错误传播（DB 异常 → 函数抛出/返回）
```

---

## §4 组件测试要求

### 何时 MUST 写组件测试

含以下任一特征的**新建**组件 MUST 有 `.test.tsx`：
- 交互逻辑（onClick、onSubmit、键盘事件）
- 条件渲染（基于 props / state 显示不同内容）
- 状态管理（useState / useReducer / Zustand store 交互）

### 何时 MAY 跳过

- 纯布局组件（仅组合子组件，无逻辑）
- 薄包装组件（仅传递 props 到 shadcn/ui 组件）

### 技术栈

- `@testing-library/react` + `@testing-library/user-event`
- `@testing-library/jest-dom`（断言扩展）
- `happy-dom`（已配置在 vitest setup 中）

### 组件测试模板

```tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi } from "vitest";
import { MyComponent } from "./MyComponent";

describe("MyComponent", () => {
  it("renders default state", () => {
    render(<MyComponent />);
    expect(screen.getByText("Expected text")).toBeInTheDocument();
  });

  it("handles user interaction", async () => {
    const user = userEvent.setup();
    const onAction = vi.fn();
    render(<MyComponent onAction={onAction} />);

    await user.click(screen.getByRole("button", { name: /submit/i }));
    expect(onAction).toHaveBeenCalledOnce();
  });

  it("renders conditionally based on props", () => {
    render(<MyComponent showExtra />);
    expect(screen.getByText("Extra content")).toBeInTheDocument();
  });
});
```

---

## §5 文档覆盖度

| 场景 | 要求 |
|------|------|
| 跨 3+ 文件的新功能 | MUST 更新 `CLAUDE.md` 或相关 workflow 文档 |
| 新 AI 工具 | MUST 有 `description` 字段（用于模型判断） |
| 新 Skill | MUST 有完整 `SKILL.md` frontmatter（name、description、emoji） |
| 新 workflow 文档 | MUST 更新 `AGENTS.md` 必读顺序 |

---

## §6 三阶段执行

### Stage 1：Agent 自检（开发完成后）

开发完成后、提交 PR 前，MUST 执行：

```bash
# 1. 全部测试通过
pnpm test

# 2. 覆盖率阈值通过
pnpm test:coverage
```

然后对照以下清单自检：

- [ ] 新增/修改的源文件有对应测试文件
- [ ] 测试覆盖正常路径 + 边界条件 + 错误处理
- [ ] 新组件（含交互逻辑）有 `.test.tsx`
- [ ] 跨 3+ 文件的功能有文档更新
- [ ] `pnpm test:coverage` 阈值全部通过

### Stage 2：PR 提交前（submit-pr.md 流程）

在 `submit-pr.md` 步骤 2 之后执行测试质量校验，详见该文档。

### Stage 3：CI 集成（Follow-up）

未来将在 GitHub Actions 中集成：
- 覆盖率报告上传
- PR 覆盖率变更 diff 评论
- 阈值未达标时阻止合并

> CI 集成作为独立 Issue 跟进实现。
