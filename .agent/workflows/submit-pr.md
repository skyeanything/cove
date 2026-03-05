---
description: Create a valid Pull Request following cove project standards
---

This workflow guides the process of submitting a PR for the cove project.

1. 确认分支名称符合规范（feature/xxx、fix/xxx、docs/xxx、refactor/xxx）

2. 运行完整构建与测试套件
```bash
pnpm run build && pnpm test
```

3. 测试质量校验
```bash
pnpm test:coverage
```
确认以下事项（详见 `.agent/workflows/test-quality.md`）：
- [ ] 覆盖率阈值全部通过
- [ ] 新增/修改的源文件有对应测试文件
- [ ] 新组件（含交互逻辑）有 `.test.tsx`
- [ ] 跨 3+ 文件的功能有文档更新

4. Rust 静态检查
```bash
cd src-tauri && cargo check
```

5. 文件大小校验
```bash
python3 scripts/check-file-size.py
```

6. 推送分支
```bash
git push origin <current_branch>
```

7. 使用 gh cli 创建 PR
```bash
gh pr create --title "type: description" --body "Description of changes"
```

> **规范提示**：
> - PR 标题格式：`feat: ...`、`fix: ...`、`docs: ...`、`refactor: ...`、`chore: ...`
> - 每个 PR 应对应一个 Issue
> - 不允许直接推送到 main 或 dev 分支
>
> **dev 分支规范**：
> - `dev` 是集成验证分支，用于多人协作时的功能验证
> - PR 到 `dev` 时，body 中使用 `Related to #<id>`，**不要**使用 `Closes #<id>`（避免提前关闭 issue）
> - PR 到 `main` 时，body 中使用 `Closes #<id>` 关闭 issue
> - 所有功能分支仍从 `main` 创建（main 是稳定基线）
