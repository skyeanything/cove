# Architecture Decision Records

本文档记录 Cove 项目的关键架构决策。每个 ADR 包含背景、决策、替代方案和理由，供开发者和 AI agent 参考。

---

## ADR-001: 桌面框架 -- Tauri 2

### 背景

Cove 是桌面端 AI 聊天客户端，需要本地文件系统访问、Shell 执行、SQLite 持久化等原生能力。框架选型直接决定分发体积、性能上限和安全模型。

### 决策

采用 Tauri 2（当前 v2.10.0）。Rust 后端处理文件 I/O、Skill 发现、Shell 命令等安全敏感操作；前端复用系统 WebView 渲染 React UI。

### 替代方案

| 方案 | 优势 | 劣势 |
|------|------|------|
| Electron | 生态成熟，Chromium 行为一致 | 二进制 ~150MB，内存占用高，无 Rust 安全边界 |
| Flutter Desktop | 跨平台 UI 一致性，Dart 单语言 | Web 生态整合差，AI SDK 无 Dart 绑定，渲染引擎自绘 |
| 纯 Web (PWA) | 零安装，跨平台 | 无本地文件系统、无 Shell 执行、无 SQLite |

### 理由

Tauri 2 二进制约 3MB（vs Electron ~150MB），共享 OS WebView 省去捆绑浏览器引擎。Rust 后端天然支持内存安全的并发文件操作和路径遍历防护（`skill_commands.rs` 中的 canonicalize + starts_with 检查）。IPC 边界强制前后端隔离，敏感操作必须通过 Tauri command 暴露，减少攻击面。macOS 上原生支持 traffic light 定位和 overlay title bar，符合项目 "Native feel" 设计原则。

---

## ADR-002: AI 框架 -- Vercel AI SDK 6

### 背景

项目需要统一接口对接 20+ LLM 供应商，支持流式输出和工具调用（tool use），同时保持供应商切换的低成本。

### 决策

采用 Vercel AI SDK 6（`ai@^6.0.77`），使用 `streamText()` 处理流式对话，`generateText()` 处理工具调用。通过官方 provider 包（`@ai-sdk/openai`、`@ai-sdk/anthropic`、`@ai-sdk/google`、`@ai-sdk/deepseek`、`@ai-sdk/moonshotai`、`@ai-sdk/amazon-bedrock`）接入各供应商。

### 替代方案

| 方案 | 优势 | 劣势 |
|------|------|------|
| LangChain.js | 链式编排能力强，RAG 工具丰富 | 抽象层过重，bundle size 大，简单聊天场景 over-engineering |
| 自建 SDK | 完全可控，无外部依赖 | 维护成本高，需逐一实现各供应商 API 差异和流式解析 |
| OpenAI SDK 直接调用 | 轻量，文档清晰 | 锁定单一供应商 API 格式，切换供应商需大量适配 |

### 理由

AI SDK 6 的 `LanguageModel` 接口是 provider-agnostic 的：同一段 `streamText({ model, messages, tools })` 代码，换一个 model 实例即可切换供应商，零业务逻辑改动。工具调用通过 `tool({ description, parameters, execute })` 声明，与 Cove 的工具注册表模式（`TOOL_IMPLS` map）直接对接。6 个官方 provider 包覆盖了项目当前全部供应商需求。

---

## ADR-003: 状态管理 -- Zustand

### 背景

前端需要管理对话列表、消息流、助手配置、Skill 启停、布局状态、主题等多个独立状态域。状态管理方案需要支持 TypeScript 严格模式和异步操作（DB 读写、Tauri invoke）。

### 决策

采用 Zustand v5（`zustand@^5.0.11`）。每个状态域一个独立 store 文件，当前共 11 个 store：chatStore、settingsStore、skillsStore、layoutStore、themeStore、workspaceStore、dataStore、permissionStore、sandboxStore、fileClipboardStore、filePreviewStore。

### 替代方案

| 方案 | 优势 | 劣势 |
|------|------|------|
| Redux Toolkit | 生态最大，DevTools 成熟，action 可序列化 | 样板代码多（slice + reducer + selector），Provider wrapper 必需 |
| Jotai | 原子化粒度细，天然支持 React Suspense | 多 store 协调困难，大量 atom 定义分散，async atom 语法繁琐 |
| React Context + useReducer | 零依赖 | 性能问题（context 变更触发全子树重渲染），大型状态难维护 |

### 理由

Zustand 无 Provider wrapper，store 是普通 JavaScript 模块，组件外可直接调用 `store.getState()` / `store.setState()`。这对 Cove 的场景至关重要：AI 工具执行函数、DB 回调、Tauri event handler 都在 React 组件树之外，需要直接读写状态。11 个独立 store 文件按域隔离，互不干扰。异步 action 直接在 store 内 `await` DB 操作或 Tauri invoke，无需额外 middleware。

---

## ADR-004: 数据持久化 -- SQLite via tauri-plugin-sql

### 背景

桌面聊天客户端需要持久化对话历史、消息内容、助手配置、供应商凭据等结构化数据，且需要支持全文搜索（消息检索）。

### 决策

采用 SQLite，通过 `tauri-plugin-sql` 在 Rust 侧管理连接。前端通过 10 个 repository 文件（`src/db/repos/`）封装所有 SQL 操作：assistantRepo、attachmentRepo、conversationRepo、mcpServerRepo、messageRepo、promptRepo、providerRepo、settingsRepo、summaryRepo、workspaceRepo。使用 FTS5 虚拟表（`message_fts`、`conversation_summaries_fts`）实现全文搜索。迁移通过 `src-tauri/migrations/` 下的 SQL 文件管理。

### 替代方案

| 方案 | 优势 | 劣势 |
|------|------|------|
| IndexedDB | 浏览器原生，无插件依赖 | 无 SQL，复杂查询困难，无 FTS，Tauri WebView 中行为不一致 |
| localStorage | 最简单，键值存取 | 5MB 限制，无结构化查询，同步阻塞，数据量增长后不可用 |
| 外部 DB (PostgreSQL) | 查询能力强 | 桌面应用需要额外安装数据库服务，部署复杂度过高 |

### 理由

SQLite 是单文件嵌入式数据库，零部署成本，随应用打包。FTS5 扩展提供全文搜索能力，支持 `message_fts` 和 `conversation_summaries_fts` 两个虚拟表的高效检索（FTS5 不可用时 graceful 降级，try-catch 回退普通查询）。Repository 模式确保组件层不直接接触 SQL，所有查询使用参数化防注入。4 个迁移文件通过 `runMigrations()` 顺序执行，支持 schema 演进。

---

## ADR-005: Skill 三层架构

### 背景

Skill 系统需要同时支持项目内置能力、用户自定义扩展、以及从其他 AI 工具（Claude、Cursor 等）发现已有 Skill。不同来源的 Skill 可能同名，需要明确的优先级和去重机制。

### 决策

三层加载机制，按优先级从高到低：

1. **User skills (cove)** -- `~/.cove/skills/{name}/SKILL.md`，通过 Tauri command `discover_external_skills` 发现
2. **Discovered skills** -- 从 `~/.cursor/skills/`、`~/.cache/claude/skills/` 等约定目录扫描（Rust 端 `skill_discovery.rs`）
3. **Built-in skills** -- `src/skills/*/SKILL.md`，通过 Vite `import.meta.glob` 静态加载

同名 Skill 仅保留最高优先级来源（cove > claude > agents > cursor > opencode > office）。

### 替代方案

| 方案 | 优势 | 劣势 |
|------|------|------|
| 仅内置 Skill | 实现简单，无冲突问题 | 用户无法扩展，无法复用其他工具的 Skill |
| 插件注册表（npm-like） | 版本管理、依赖解析完整 | 过度工程化，桌面聊天客户端不需要包管理器 |
| 单层目录扫描 | 发现逻辑简单 | 无法区分来源优先级，同名冲突无法解决 |

### 理由

三层架构平衡了可扩展性和简洁性。Built-in 保证开箱即用；User skills 允许定制化覆盖；Discovered 层自动复用用户已有的 AI 工具 Skill 资产，降低迁移成本。安全机制包括：Rust 端名称校验（小写字母数字 + 连字符，最长 64 字符）、路径遍历防护（canonicalize + starts_with 基础路径检查）、以及宽松的 frontmatter 解析（标准 YAML 失败时回退到 regex 解析器，参考 opencode 的 `ConfigMarkdown.fallbackSanitization` 策略）。`folderName` 与 `meta.name` 分离设计确保磁盘操作使用实际目录名，不受 frontmatter 编辑影响。

---

## ADR-006: opencode 参考策略

### 背景

[opencode](https://github.com/opencode-ai/opencode) 是成熟的 AI 编码工具，其工具注册表、Skill 加载、权限控制等模式与 Cove 需求高度重合。需要决定如何利用这一参考实现。

### 决策

采用 "参考模式"：提取 opencode 的设计模式和架构思路，用 Cove 自己的技术栈重新实现。不直接 fork 或引入 opencode 代码作为依赖。

已对齐的模式：
- 工具注册表（`TOOL_IMPLS` map + `getAgentTools()` 动态过滤，对应 opencode 的 `ToolRegistry.tools(model, agent)`）
- 工具执行返回格式（`{ title, output, metadata, attachments? }`）
- 宽松 frontmatter 解析（标准失败时 regex 回退）
- Skill 输出包装为 `<skill_content>` XML 结构
- 优先级去重逻辑

未采纳的部分（因 Tauri 沙箱约束）：
- 直接文件 I/O（opencode 用 Bun/Node `fs`，Cove 必须通过 Tauri command）
- ripgrep 集成（opencode 直接调用本地 ripgrep 二进制）
- Bash 执行（opencode 用 `child_process`，Cove 需要 `tauri-plugin-shell`）

### 替代方案

| 方案 | 优势 | 劣势 |
|------|------|------|
| Fork opencode | 直接复用代码，启动快 | 技术栈不匹配（Bun vs Tauri），维护上游同步成本高 |
| 从零构建 | 完全自主，无技术债 | 重复发明已验证的模式，设计决策缺乏参照 |
| 引入为 npm 依赖 | 代码复用最大化 | opencode 面向 CLI，API 不稳定，Tauri 环境不兼容 |

### 理由

Cove 运行在 Tauri 沙箱中，所有系统访问必须通过 Rust 后端的 IPC command。opencode 的执行层（文件 I/O、Shell、ripgrep）直接依赖 Node/Bun 运行时，无法在 WebView 中使用。但其上层设计模式（工具注册、Skill 格式、权限模型）是平台无关的，可以直接对齐。参考模式的代价是需要重写执行层，收益是保持架构一致性的同时完全适配 Tauri 安全模型。代码中通过注释标注了对应的 opencode 源文件位置（如 `loader.ts` 中引用 `opencode ConfigMarkdown.fallbackSanitization`），方便后续追踪上游变化。

---

## ADR-007: 文件大小 400 行硬性限制

### 背景

AI agent（Claude Code、Cursor 等）在单次会话中生成的代码容易出现文件膨胀：逻辑堆积在单个文件中，缺少拆分动机。项目初期即出现多个 500+ 行文件，可维护性下降。

### 决策

强制文件大小限制：
- `.ts` / `.tsx` 源文件：400 行
- `.test.ts` / `.spec.ts` 测试文件：500 行
- `.rs` Rust 文件：300 行

通过 `scripts/check-file-size.py` 扫描检查，Husky pre-commit hook 自动执行。违规文件阻止 commit。

### 替代方案

| 方案 | 优势 | 劣势 |
|------|------|------|
| 仅 lint 警告 | 不阻断开发流程 | 警告容易被忽略，约束力弱 |
| ESLint max-lines 规则 | 集成现有工具链 | 仅覆盖 JS/TS，不覆盖 Rust，配置分散 |
| 无限制 + 代码审查 | 灵活，依赖判断力 | AI agent 无自觉拆分意识，审查成本高 |

### 理由

硬性限制配合 pre-commit 执行是对 AI agent 最有效的约束机制。agent 无法绕过 hook 强制提交，必须在生成代码时主动拆分文件。三种豁免机制保证灵活性：

1. **内联注释** -- 文件顶部 `// FILE_SIZE_EXCEPTION: <reason>` 标注特殊原因
2. **基线文件** -- `scripts/file-size-known-exceptions.txt` 记录历史遗留超限文件（含 stale 检测，已修复的文件会触发清理提示）
3. **路径排除** -- `src/components/ui/` 下的 shadcn 原语文件自动豁免（第三方生成代码，不应修改）

Python 脚本而非 ESLint 插件是因为需要同时覆盖 TypeScript 和 Rust 文件，且检查逻辑简单（行数统计），不需要 AST 解析。
