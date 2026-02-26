# Office Chat — ChatWise Clone

## Project Overview
A desktop AI chat client cloning [ChatWise](https://chatwise.app), built with **Tauri 2 + React 19 + Vercel AI SDK 6**.

## Tech Stack
- **Desktop**: Tauri 2 (Rust backend)
- **Frontend**: React 19 + TypeScript + Vite
- **AI**: Vercel AI SDK 6 (`ai@^6`)
- **Styling**: Tailwind CSS 4 + shadcn/ui
- **State**: Zustand
- **DB**: SQLite via `tauri-plugin-sql`
- **Package Manager**: pnpm

## Design System — "Quiet Elegance"

ChatWise follows a **Linear/Raycast-inspired** minimal aesthetic. Every pixel matters.

### Design Principles
1. **Restraint** — No unnecessary decoration. Every element earns its place.
2. **Density done right** — Information-dense but never cluttered. Generous whitespace where it matters.
3. **Subtle depth** — Use shadows and borders sparingly. Prefer `border` over `shadow` for separation.
4. **Smooth motion** — 150-200ms transitions. `ease-out` for enters, `ease-in` for exits.
5. **Native feel** — Respect platform conventions. macOS traffic lights, system fonts.

### Color Tokens (CSS Variables)
```
Light Mode:
--background:        #FFFFFF
--background-secondary: #F9FAFB  (sidebar, panels)
--background-tertiary:  #F3F4F6  (hover states, input bg)
--foreground:        #111827
--foreground-secondary: #6B7280
--foreground-tertiary:  #9CA3AF
--border:            #E5E7EB
--border-subtle:     #F3F4F6
--accent:            #2563EB  (blue-600, primary actions)
--accent-hover:      #1D4ED8
--accent-foreground: #FFFFFF
--destructive:       #EF4444
--success:           #10B981

Dark Mode:
--background:        #09090B
--background-secondary: #0F0F12  (sidebar)
--background-tertiary:  #18181B  (hover, input bg)
--foreground:        #FAFAFA
--foreground-secondary: #A1A1AA
--foreground-tertiary:  #71717A
--border:            #27272A
--border-subtle:     #1E1E22
--accent:            #3B82F6  (blue-500)
--accent-hover:      #60A5FA
--accent-foreground: #FFFFFF
--destructive:       #EF4444
--success:           #10B981
```

### Typography
- **Font**: `system-ui, -apple-system, sans-serif` (native system font)
- **Mono**: `"SF Mono", "Cascadia Code", "Fira Code", monospace`
- **Base size**: 14px
- **Line height**: 1.5 for body, 1.3 for headings
- **Weight**: 400 normal, 500 medium (labels), 600 semibold (headings)

### Spacing Scale
Use Tailwind's default scale. Key patterns:
- Sidebar width: 260px (collapsible)
- Right sidebar: 320px (collapsible)
- Component padding: `p-2` (8px) for dense, `p-3` (12px) for normal, `p-4` (16px) for spacious
- Gap between items: `gap-1` (4px) in lists, `gap-2` (8px) between sections
- Input area padding: `px-4 py-3`

### Border Radius
- Buttons: `rounded-lg` (8px)
- Cards/Panels: `rounded-xl` (12px)
- Input fields: `rounded-lg` (8px)
- Avatars: `rounded-full`
- Small elements (tags, badges): `rounded-md` (6px)

### Shadows
Minimal use. Prefer borders for separation.
- Dropdowns/Popovers: `shadow-lg` with `border`
- Modals: `shadow-2xl`
- Cards: NO shadow, use `border` only

### Animation
- Sidebar collapse: `200ms ease-out`
- Dropdown open: `150ms ease-out`
- Hover transitions: `150ms ease`
- Page transitions: none (instant)
- Streaming text: no animation, just append

### Component Patterns
- **Sidebar items**: `px-2 py-1.5 rounded-lg hover:bg-tertiary` — subtle hover, no borders
- **Active item**: `bg-tertiary font-medium` — slightly different bg, medium weight
- **Buttons (primary)**: Solid accent color, medium weight, `h-8 px-3 text-sm`
- **Buttons (ghost)**: Transparent, icon-only in toolbars, `hover:bg-tertiary`
- **Input fields**: `bg-tertiary border-none` in dark, `bg-background border` in light
- **Dividers**: `border-t border-border` — single pixel, never heavy

### Icons
- Use `lucide-react` exclusively
- Size: 16px (sm), 18px (default), 20px (lg)
- Stroke width: 1.5 (not 2, to feel lighter)
- Color: `foreground-secondary` by default

## Code Conventions

### File Structure
```
src/
├── components/
│   ├── ui/          # shadcn/ui primitives (DO NOT modify)
│   ├── chat/        # Chat-related components
│   ├── sidebar/     # Sidebar components
│   ├── settings/    # Settings panel (incl. SkillsPage)
│   └── layout/      # Layout shells
├── hooks/           # Custom React hooks
├── stores/          # Zustand stores (one file per domain)
├── lib/
│   ├── ai/
│   │   ├── skills/  # Skill types, loader, discovery
│   │   └── tools/   # AI tool definitions & registry
│   ├── db/          # SQLite operations
│   └── utils.ts     # Shared utilities
├── skills/          # Built-in skills (SKILL.md + resources)
├── types/           # TypeScript types & interfaces
└── i18n/            # Translations
```

### Naming
- Components: PascalCase (`ChatMessage.tsx`)
- Hooks: camelCase with `use` prefix (`useChatStore.ts`)
- Stores: camelCase (`chatStore.ts`)
- Utils: camelCase (`formatDate.ts`)
- Types: PascalCase interfaces, avoid `I` prefix (`Message`, not `IMessage`)
- CSS: Tailwind utility classes only. No custom CSS unless absolutely necessary.

### Component Guidelines
- Prefer composition over props. Small, focused components.
- Use `cn()` (clsx + twMerge) for conditional classes.
- All interactive elements must have `cursor-pointer` and visible focus states.
- Keyboard accessibility: all actions reachable via keyboard.
- No `any` types. Strict TypeScript.

### State Management
- Zustand stores for global state (conversations, assistants, settings)
- React state for local UI state (dropdowns open, input values)
- Never put derived data in stores — compute it

### Database
- All DB operations go through repository functions in `lib/db/`
- Never call SQL directly from components
- Use parameterized queries (prevent injection)

## Opencode 实现参考

本项目的部分 AI 工具参考 [opencode](https://github.com/opencode-ai/opencode) 的 `packages/opencode/src/tool` 与相关模块实现，便于对齐行为与后续扩展。

### 工具形态（opencode）
- **定义**: `Tool.define(id, { description, parameters: z.object(...), execute(params, ctx) })`，返回 `Tool.Info`。
- **execute 返回值**: `{ title: string, output: string, metadata, attachments? }`。
- **上下文 ctx**: `sessionID`, `messageID`, `agent`, `abort` (AbortSignal), `callID?`, `messages`, `metadata(fn)`, `ask(permissionReq)`。
- **注册与暴露**: `ToolRegistry.tools(model, agent)` 得到已初始化的工具列表；在 `session/prompt.ts` 中用 `tool({ description, inputSchema: jsonSchema(z.toJSONSchema(parameters)), execute })` 转成 Vercel AI SDK 的 `tool()`。

### 已对齐到本项目的部分
- **Exa 网页搜索 / 代码搜索**: 参考 `websearch.ts`、`codesearch.ts`，调用 `https://mcp.exa.ai/mcp`，请求头 `x-api-key`，超时用 `AbortController` + `setTimeout`（opencode 用 `abortAfterAny(ms, ctx.abort)`）。
- **工具注册表**: `src/lib/ai/tools/index.ts` 的 `AGENT_TOOLS`（静态默认集）与 `getAgentTools(enabledSkillNames, options?)`（动态过滤集）对应，类似 opencode 按 agent/permission 过滤工具。
- **Skill 系统**: `src/lib/ai/skills/` 实现了技能发现、加载与优先级解析，详见下方「Skill 系统架构」。

### 依赖后端、尚未集成的能力
以下在 opencode 中依赖 Bun/Node 与本地文件系统，若要在 office-chat 中实现需通过 Tauri 提供能力：

| 能力 | opencode 位置 | 说明 |
|------|----------------|------|
| 工作区/实例 | `project/instance.ts` | `Instance.directory`（cwd）、`Instance.worktree`、`containsPath(path)` |
| 读/写/编辑文件 | `tool/read.ts`, `write.ts`, `edit.ts` | 需 Tauri 读写在用户选定目录上的能力 |
| grep / glob | `tool/grep.ts`, `glob.ts` + `file/ripgrep.ts` | 依赖本地 ripgrep 或等价实现 |
| 执行命令 | `tool/bash.ts` | 依赖 `tauri-plugin-shell` 或子进程 API |
| 权限与确认 | `permission/next.ts`、工具内 `ctx.ask({ permission, patterns, ... })` | 敏感操作前询问用户；可简化为 Tauri 弹窗或设置项 |
| 输出截断 | `tool/truncation.ts` | 工具输出过长时写文件并返回路径提示；前端可做简单长度截断 |

实现上述能力时，可继续参考 opencode 的 `external-directory.ts`（访问工作区外路径时的权限）、`edit.ts` 中的多种 `Replacer`（oldString 匹配策略）以及 `read.txt` / `edit.txt` 等描述文案。

## Skill 系统架构

### 概述

Skill 是模块化的能力扩展包，每个 Skill 以 `SKILL.md` 为核心定义文件，可选附带 `resources/` 资源目录。

### SKILL.md Frontmatter 规范

```yaml
---
name: my-skill            # 必填，slug 格式（小写字母、数字、连字符）
description: "..."        # 必填，简短描述（模型用于判断何时启用）
emoji: "🔧"              # 可选，UI 展示图标
always: true              # 可选，始终注入 system prompt（不需用户启用）
requires:                 # 可选，声明依赖的工具
  tools:
    - bash
    - write
metadata:                 # 可选，额外元数据
  version: "1.0"
  author: "..."
---

（Markdown 正文 = Skill 指令，注入为 system prompt 的一部分）
```

> **重要**: 编辑保存 Skill 时必须保留所有 frontmatter 字段（包括未在 UI 中展示的 `always`、`requires`、`metadata` 等）。`SkillsPage` 的 `parseSkillFields()` / `buildSkillMd()` 通过 `extraFrontmatter` 实现未知字段的 round-trip 保留。

### 三层加载机制

1. **Built-in skills** — 打包在 `src/skills/` 中，通过 Vite `import.meta.glob` 静态加载
2. **User skills (cove)** — 存放在 `~/.cove/skills/{name}/SKILL.md`，通过 Tauri 命令发现
3. **Discovered skills (claude/cursor/etc.)** — 从已知约定目录自动扫描

来源优先级：`cove > claude > 其他`（同名 Skill 仅保留最高优先级）

### 关键文件

| 文件 | 职责 |
|------|------|
| `src/skills/*/SKILL.md` | 内置 Skill 定义 |
| `src/lib/ai/skills/types.ts` | `SkillMeta`, `Skill`, `SkillResource` 类型 |
| `src/lib/ai/skills/loader.ts` | Frontmatter 解析、加载、摘要生成 |
| `src/lib/ai/tools/index.ts` | `AGENT_TOOLS`（静态集）、`getAgentTools()`（动态集） |
| `src/lib/ai/tools/skill.ts` | `skill` 工具（模型按名调用 Skill）、`skill_resource` 工具 |
| `src/lib/ai/tools/write-skill.ts` | `write_skill` 工具（AI 创建新 Skill 并保存到磁盘） |
| `src/stores/skillsStore.ts` | Zustand store：发现、启用/禁用、保存、删除 |
| `src/components/settings/SkillsPage.tsx` | 设置页 UI：列表、编辑（结构化表单）、删除 |
| `src/components/chat/SkillsPopover.tsx` | 聊天中 Skill 选择弹窗 |
| `src-tauri/src/skill_commands.rs` | Rust 端：`read_skill`、`write_skill`、`delete_skill` |
| `src-tauri/src/skill_discovery.rs` | Rust 端：外部 Skill 目录扫描 |

### 工具门控（Tool Gating）

`getAgentTools()` 根据 `enabledSkillNames` 动态构建工具集：
- `skill` 工具始终注册，但内部仅暴露已启用的 Skill
- `write_skill` 仅在 `skill-creator` 已启用时注册
- `officellm` 通过 `options.officellm` 控制

### React Key 规范

Skill 列表中的 React key 使用 `${source}:${name}` 复合键，防止不同来源同名 Skill 导致 key 冲突。

## Development Workflow

### 文件大小限制（Hard Constraint）
- TypeScript 代码文件（`.ts`/`.tsx`）：最多 **400 行**
- TypeScript 测试文件（`.test.ts`/`.spec.ts`）：最多 **500 行**
- Rust 文件（`.rs`）：最多 **300 行**
- 超出时在文件顶部添加 `// FILE_SIZE_EXCEPTION: <原因>` 注释
- `src/components/ui/` 下的 shadcn 原语文件豁免（CLAUDE.md 明确标注 DO NOT modify）

### Git Worktree 工作流（Hard Constraint）

**MUST**:
- 所有功能开发 MUST 在独立 worktree 中进行，主目录（`/Users/lizc/code/cove/`）保持 main 分支干净
- 开始开发前 MUST 先有对应的 GitHub Issue
- 使用脚本创建 worktree：`./scripts/start-worktree.sh <type> <issue-id> <desc>`
- 分支命名 MUST 包含 Issue 编号：
  - 新功能：`feature/issue-<id>-<desc>`
  - Bug 修复：`fix/issue-<id>-<desc>`
  - 文档：`docs/issue-<id>-<desc>`
  - 重构：`refactor/issue-<id>-<desc>`
- PR body MUST 包含 `Closes #<id>` 关联 Issue
- PR 标题格式：`feat: ...`、`fix: ...`、`docs: ...`、`refactor: ...`、`chore: ...`

**MUST NOT**:
- MUST NOT 在主仓库目录（`/Users/lizc/code/cove/`）直接开发功能分支
- MUST NOT 创建不含 Issue 编号的分支
- MUST NOT 直接推送到 main 分支

### 构建 & 测试基准线
```bash
pnpm run build                       # 前端构建（含 tsc 类型检查）
pnpm test                            # vitest 单元测试
cd src-tauri && cargo check          # Rust 静态检查
python3 scripts/check-file-size.py  # 文件大小校验
```

### AI 开发规则（Hard Constraint）
- 开始任何开发工作前，MUST 按 `AGENTS.md` 中的顺序阅读所有必读文档
- MUST 先阅读 `.agent/workflows/worktree-parallel.md`，再开始写任何代码
- 如果当前工作目录是 `/Users/lizc/code/cove/`（主仓库），MUST NOT 在此创建功能分支或编写功能代码
