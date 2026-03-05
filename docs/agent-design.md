# Cove Agent 设计理念

本文档阐述 cove 作为 AI 桌面客户端的 agent 设计哲学。面向 agent 和人类开发者，解释系统设计的 WHY。

## 1. Agent 与工具的关系

### 设计选择：全工具默认可用

cove 中所有工具默认对 agent 可用，无手动开关。`getAgentTools()` 对大多数 built-in 类工具无条件注册，仅 skill-bundled 工具需对应 Skill 启用。

例外：部分 built-in 工具有特殊注册逻辑。`skill` 和 `skill_resource` 是工厂函数，注册时绑定当前已启用的 Skill 列表。`spawn_agent` 需要 `SubAgentContext` 且 `currentDepth < maxDepth` 才注册，防止无限递归。这些属于注册时的参数绑定，而非用户可控的开关。

这与 opencode 不同。opencode 按 agent 角色和权限过滤工具集（`ToolRegistry.tools(model, agent)`），cove 选择信任模型的工具选择能力。理由：

- 减少用户配置摩擦。桌面用户不应关心哪些工具对 agent 可见。
- 模型有足够能力根据任务语境选择合适工具，无需人为限制。
- 工具安全性由工具自身的安全分级保证（见第 3 节），而非可见性控制。

### @mention 作为引导而非限制

`@mention` 系统让用户在聊天输入框中引用 Tools、Skills、Files，但这是引导机制，不是限制机制。agent 始终可以使用全部已注册工具，`@mention` 只是将用户意图显式传达给模型。

`ToolInfo.userVisible` 字段控制哪些工具出现在 `@mention` 自动补全中。内部工具（`skill`、`skill_resource`、`spawn_agent`、`recall`、`recall_detail`、`write_skill`）对用户隐藏，由 agent 自主调用。

## 2. Skill 系统设计

### 三层加载与优先级解析

Skill 从三个来源加载：

| 层级 | 来源 | 加载方式 | 优先级 |
|------|------|----------|--------|
| Built-in | `src/skills/*/SKILL.md` | Vite `import.meta.glob` 静态加载 | 2 (最低) |
| External | IDE 约定目录 | Tauri `discover_external_skills` 扫描 | 1 (claude) / 2 (其他) |
| User | `~/.cove/skills/{name}/SKILL.md` | Tauri `discover_external_skills` 扫描 | 0 (最高) |

External 和 User 两层均通过 `discover_external_skills` 统一扫描发现（`~/.cove/skills` 是默认扫描根之一）。`read_skill` / `write_skill` / `delete_skill` 是单个 Skill 的 CRUD API，不参与发现流程。

同名 Skill 去重时保留优先级最高的来源。`sourcePriority()` 函数实现：cove(0) > claude(1) > 其他含 built-in(2)。注意 cursor、agents、opencode 等非 claude 来源与 built-in 同为优先级 2。

这种设计允许用户覆盖内置 Skill 的行为，同时复用 IDE 生态中已有的 Skill 资源。

### 门控逻辑

`getAgentTools()` 中 skill-bundled 工具的门控逻辑通用化，无 hardcoded 判断。built-in 工具中有三个使用工厂函数特殊处理：

```
对于每个 ToolInfo:
  category === "built-in" →
    id === "skill"          → createSkillTool(enabledNames) 工厂创建
    id === "skill_resource" → createSkillResourceTool(enabledNames) 工厂创建
    id === "spawn_agent"    → 需 subAgentContext 且 currentDepth < maxDepth
    其他                    → 从 TOOL_IMPLS 直接注册
  category === "skill-bundled" →
    1. info.skillName 对应的 Skill 已启用？
    2. info.runtimeCheck 对应的运行时依赖可用？
    二者皆满足 → 注册；否则跳过
```

当前 skill-bundled 工具：

| 工具 | 关联 Skill | 运行时检查 |
|------|-----------|-----------|
| `office` | office | office sidecar |
| `diagram` | office | office sidecar |
| `write_skill` | skill-creator | 无 |

### always 技能自动注入

`always: true` 的 Skill 通过 `getAlwaysSkills()` 在 `buildSystemPrompt()` 中直接注入 system prompt，无需模型调用 skill 工具加载。适用于始终需要的基础指令。

### skill 与 skill_resource 分离

skill 工具返回 Skill 的核心指令内容。skill_resource 工具按需加载 Skill 附带的资源文件（如 `TABLE_OPERATIONS_GUIDE.md`）。

分离原因：避免一次性注入全部资源导致上下文膨胀。以 office Skill 为例，SKILL.md 本身加上所有 resources 可达数十 KB；模型先通过 skill 获取核心指令，再根据需要用 skill_resource 加载特定资源。

## 3. 安全分级

### bash 工具三级分类

bash 工具将命令分为三个安全级别：

| 级别 | 行为 | 匹配规则 |
|------|------|----------|
| safe | 直接执行，无需确认 | `ls`、`cat`、`git status/log/diff/show`、`pnpm`、`cargo build/test` 等只读或构建类命令 |
| confirm | 弹窗请求用户确认 | `curl`、`wget`、`npm install` 等网络或写入类命令 |
| block | 始终拒绝 | `nc`、`telnet`、`rm -rf /`、`mkfs.`、`dd if=` 等危险操作 |

分级通过命令前缀匹配实现（`SAFE_PREFIXES`、`BLOCK_PREFIXES`），未命中任何前缀的命令默认归入 confirm。

### 异步权限队列

模型在单步中可能并发发出多个工具调用。`permissionStore` 使用队列（而非单槽位）管理权限请求，防止后来者覆盖前者的 Promise 导致前者永远不 resolve。

```
pendingAsk: 当前展示给用户的请求（队列头部）
pendingQueue: 等待中的请求队列
→ 用户响应后弹出下一个
```

支持「记住同类命令」：以命令首词为指纹（`getBashCommandPattern()`），用户选择 `always_allow` 后同一会话内同首词命令自动放行。

### read-before-write 约束

write 和 edit 工具在覆盖文件前强制要求本会话内先读取过该文件（`assertReadBeforeWrite()`）。

实现机制：
- `file-time.ts` 按会话记录文件读取时间戳（仅内存，不持久化）
- 写入前通过 Tauri `stat_file` 获取当前 mtime
- 若 mtime > 读取时间，说明文件被外部修改，拒绝写入并要求重新读取

这防止了两类问题：盲覆盖（agent 未了解文件内容就写入）和竞态覆盖（用户在 agent 读后手动修改了文件）。

### 工作区边界

Rust 层的 `read_file`、`write_file`、`stat_file` 等命令强制路径限制。尝试访问工作区外路径返回 `OutsideWorkspace` 错误。无法通过 `../` 等路径逃逸。

## 4. 桌面 Agent 与 CLI Agent 的差异

### 定位差异

cove 是面向普通用户的桌面 AI 客户端，不是开发者工具。与 claude code / cursor 的关键区别：

| 维度 | CLI Agent (claude code) | 桌面 Agent (cove) |
|------|------------------------|-------------------|
| 交互 | 终端文本 | GUI，流式可视化，权限弹窗 |
| 目标用户 | 开发者 | 普通用户 + 开发者 |
| 权限模型 | 终端内确认 | Zustand store 驱动的弹窗队列 |
| 身份 | 无状态 | SOUL 持久身份 |
| 工具暴露 | 用户需理解工具概念 | 工具对用户透明，@mention 可选引导 |

### SOUL 持久身份系统

cove 的 SOUL 系统（`soul.ts`）为 agent 提供跨会话的持久身份：

- `SOUL.md`：公开身份定义，注入每次对话的 system prompt 最顶部
- `soul/private/`：私有文件，同样注入 system prompt 但对用户隐藏
- `formatSoulPrompt()` 将 SOUL 内容格式化为 `[SOUL]` / `[SOUL:private:filename]` 块

SOUL 在 system prompt 中的位置先于所有其他内容（时间戳、工作区、工具规则），确保身份认知优先于任务指令。

### 双轨 OfficeLLM 集成

office 工具支持内嵌和外部两种模式（详见 `docs/officellm-dual-track.md`）。内嵌模式直接与 Tauri sidecar 通信；外部模式允许用户连接独立部署的 OfficeLLM 服务。这种双轨设计适配不同用户场景和部署条件。

## 5. 演进方向

### 工具扩展

参考 opencode 中依赖本地文件系统、尚未在 cove 中集成的能力：

| 能力 | opencode 实现 | cove 集成方式 |
|------|--------------|--------------|
| grep / glob | `file/ripgrep.ts` | 需通过 Tauri 提供 |
| 权限确认增强 | `permission/next.ts` + `ctx.ask()` | 当前使用 permissionStore 弹窗 |
| 输出截断 | `tool/truncation.ts` 写文件 | 当前 bash 工具做字符截断 |
| 外部目录访问 | `external-directory.ts` | 需 Tauri 扩展工作区边界 |

### Skill 生态

当前 Skill 来源有限。后续方向：
- 用户通过 `write_skill` 工具让 agent 自动创建 Skill
- 社区分享 Skill 包
- Skill 间依赖声明

### Sub-Agent 深度扩展

当前 `maxDepth = 2`（main agent depth 0 + 两层 sub-agent）。Sub-agent 通过 `spawn_agent` 工具创建，使用 `generateText()` 独立运行，对用户不可见。

限制因素：
- 深层 sub-agent 的上下文窗口消耗
- 错误传播和中断处理的复杂度
- 用户对不可见操作的信任边界

未来可能根据任务复杂度动态调整 maxDepth，或引入 sub-agent 执行过程的可视化。

### 上下文管理

当前策略：对话过长时生成摘要（`summaryUpTo`），旧消息被摘要替代。

演进方向：
- 更精细的 token 管理（按工具输出、Skill 内容分别计量）
- 选择性保留关键上下文片段
- 跨会话的知识持久化（recall 工具已初步支持）
