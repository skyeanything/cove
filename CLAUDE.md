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
│   ├── settings/    # Settings panel
│   └── layout/      # Layout shells
├── hooks/           # Custom React hooks
├── stores/          # Zustand stores (one file per domain)
├── lib/
│   ├── ai/         # AI SDK wrappers
│   ├── db/         # SQLite operations
│   └── utils.ts    # Shared utilities
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
- **工具注册表**: `src/lib/ai/tools/registry.ts` 的 `TOOL_REGISTRY` 与 `getAgentTools()` 的 key 对应，用于 UI 展示与勾选，类似 opencode 按 agent/permission 过滤工具。

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

## Development Workflow

### 文件大小限制（Hard Constraint）
- TypeScript 代码文件（`.ts`/`.tsx`）：最多 **400 行**
- TypeScript 测试文件（`.test.ts`/`.spec.ts`）：最多 **500 行**
- Rust 文件（`.rs`）：最多 **300 行**
- 超出时在文件顶部添加 `// FILE_SIZE_EXCEPTION: <原因>` 注释
- `src/components/ui/` 下的 shadcn 原语文件豁免（CLAUDE.md 明确标注 DO NOT modify）

### Git Worktree 工作流
- 所有功能开发在独立 worktree 中进行，主目录保持 main 分支干净
- 新建 worktree：`./scripts/start-worktree.sh <type> <issue-id> <desc>`
- Worktree 根目录：`/Users/lizc/code/cove-worktrees/`
- 分支规范：`feature/issue-<id>-<desc>`、`fix/issue-<id>-<desc>`
- Code Review 必须在独立 review worktree 中进行

### 构建 & 测试基准线
```bash
pnpm run build                       # 前端构建（含 tsc 类型检查）
pnpm test                            # vitest 单元测试
cd src-tauri && cargo check          # Rust 静态检查
python3 scripts/check-file-size.py  # 文件大小校验
```

### AI 开发规则
- 查看 `AGENTS.md` 了解必读顺序
- 查看 `.agent/workflows/` 了解具体工作流
