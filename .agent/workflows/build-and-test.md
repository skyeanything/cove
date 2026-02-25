---
description: Build, Test, and Check the cove project (Tauri + React + TypeScript)
---

This workflow executes the standard CI pipeline locally.

1. 前端类型检查 + 构建
```bash
pnpm run build
```

2. 运行前端单元测试
```bash
pnpm test
```

3. Rust 静态检查（在 src-tauri/ 目录下）
```bash
cd src-tauri && cargo check
```

4. 文件大小校验
```bash
python3 scripts/check-file-size.py
```

> **提示**：步骤 1 包含 `tsc -b` 类型检查，无需单独运行 `tsc`。
> 步骤 3 仅做静态检查，无需编译完整 Tauri 应用。
