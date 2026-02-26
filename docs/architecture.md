# 架构说明

## 整体架构

```
┌─────────────────────────────────────────────────────────┐
│                     React 19 前端                        │
│  组件层  →  Zustand Store  →  lib/ai / lib/db           │
└─────────────────────┬───────────────────────────────────┘
                      │ Tauri IPC（invoke / event）
┌─────────────────────▼───────────────────────────────────┐
│                   Rust 命令层（Tauri）                    │
│  attachment_commands / docx_commands / fs_commands       │
│  fetch_commands / shell_commands / officellm / ...       │
└─────────────────────┬───────────────────────────────────┘
                      │
          ┌───────────┴────────────┐
          │                        │
    ┌─────▼──────┐         ┌───────▼────────┐
    │   SQLite   │         │  外部进程 / OS  │
    │ (本地数据)  │         │ Shell / Office  │
    └────────────┘         └────────────────┘
```

## 前端模块

### `src/lib/ai/agent.ts` — AI 流式执行主循环

核心 AI 执行引擎，负责：
- 构建发送给模型的消息列表（含系统提示、历史、附件）
- 调用 Vercel AI SDK `streamText()` 启动流式推理
- 监听工具调用事件，分发到对应工具并收集结果
- 将流式文本与工具结果写回 Zustand store，驱动 UI 更新

### `src/lib/ai/provider-factory.ts` — 供应商工厂

根据设置中的供应商 ID 和 API Key，动态实例化对应的 AI SDK Provider：
- 支持 20+ 家供应商（详见 [providers.md](providers.md)）
- 统一返回 `LanguageModel` 接口，上层无感知差异

### `src/lib/ai/context.ts` — 系统提示构建

动态组装系统提示，包含：
- 用户自定义的 assistant 系统提示
- 当前工作区路径与文件树摘要
- 已启用工具列表
- 当前日期 / 环境信息

### `src/lib/ai/tools/` — 8 个 AI 工具

| 文件 | 工具 ID | 功能 |
|------|---------|------|
| `read.ts` | `read` | 读取工作区文件 |
| `write.ts` | `write` | 创建 / 覆盖文件 |
| `edit.ts` | `edit` | 精准替换（oldString → newString） |
| `bash.ts` | `bash` | 执行 shell 命令（安全分级） |
| `fetch-url.ts` | `fetch_url` | 获取并解析网页 |
| `parse-document.ts` | `parse_document` | 解析 PDF / DOCX / PPTX / XLSX |
| `skill.ts` | `skill` | 加载并执行领域技能 |
| `officellm.ts` | `officellm` | Office 文档操作 |

工具注册表：`src/lib/ai/tools/index.ts`，`getAgentTools()` 根据启用配置动态返回工具集。

### `src/stores/` — Zustand 状态管理

| Store 文件 | 职责 |
|-----------|------|
| `chatStore.ts` | 对话列表、当前会话、消息流 |
| `dataStore.ts` | 跨会话持久化数据 |
| `filePreviewStore.ts` | 文件预览面板状态 |
| `layoutStore.ts` | 侧边栏展开 / 折叠、面板宽度 |
| `permissionStore.ts` | 工具权限授权状态 |
| `settingsStore.ts` | 供应商配置、模型参数、主题 |
| `skillsStore.ts` | 技能列表与启用状态 |
| `themeStore.ts` | 亮色 / 暗色主题 |
| `workspaceStore.ts` | 工作区路径、文件树 |

## Rust 后端

### `src-tauri/src/`

| 模块 | 职责 |
|------|------|
| `attachment_commands/` | 附件上传与元数据读取 |
| `docx_commands/` | DOCX 内容解析 |
| `fs_commands/` | 文件系统读写（受工作区权限控制） |
| `fetch_commands.rs` | 网页内容抓取（绕过浏览器跨域限制） |
| `shell_commands.rs` | Shell 命令安全执行 |
| `officellm/` | officellm CLI / Server 进程管理 |
| `skill_discovery.rs` | 扫描本地技能目录 |
| `workspace_watcher.rs` | 文件系统变更监听（notify crate） |

## 数据库

使用 `tauri-plugin-sql` 封装的 SQLite，所有 SQL 操作集中在 `src/lib/db/`：
- `conversations.ts` — 对话 CRUD
- `messages.ts` — 消息 CRUD
- `assistants.ts` — 助手配置

所有 SQL 使用参数化查询，防止注入。

## 开发规范速查

- 文件大小限制：`.ts`/`.tsx` ≤ 400 行，`.rs` ≤ 300 行
- 分支命名：`feature/issue-<id>-<desc>`
- 所有功能开发必须在独立 worktree 中进行
- 详见 [CLAUDE.md](../CLAUDE.md) 和 [AGENTS.md](../AGENTS.md)
