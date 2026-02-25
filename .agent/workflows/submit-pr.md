---
description: Create a valid Pull Request following cove project standards
---

This workflow guides the process of submitting a PR for the cove project.

1. 确认分支名称符合规范（feature/xxx、fix/xxx、docs/xxx、refactor/xxx）

2. 运行完整构建与测试套件
```bash
pnpm run build && pnpm test
```

3. Rust 静态检查
```bash
cd src-tauri && cargo check
```

4. 文件大小校验
```bash
python3 scripts/check-file-size.py
```

5. 推送分支
```bash
git push origin <current_branch>
```

6. 使用 gh cli 创建 PR
```bash
gh pr create --title "type: description" --body "Description of changes"
```

> **规范提示**：
> - PR 标题格式：`feat: ...`、`fix: ...`、`docs: ...`、`refactor: ...`、`chore: ...`
> - 每个 PR 应对应一个 Issue（在 body 中写 `Closes #<id>`）
> - 不允许直接推送到 main 分支
