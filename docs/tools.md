# AI 工具文档

Cove 的 AI 工具分为 built-in（始终可用）和 skill-bundled（需 Skill 启用）两类。工具通过 `src/lib/ai/tools/index.ts` 注册，由 `getAgentTools()` 按启用配置动态装配。详见 [Agent/Tool/Skill 架构](agent-tool-skill-architecture.md)。

---

## `read` — 读取文件

读取工作区内指定文件的内容，支持文本文件。

**参数**

| 参数 | 类型 | 说明 |
|------|------|------|
| `path` | `string` | 相对于工作区根目录的文件路径 |

**使用场景**

- 查看代码文件内容
- 读取配置文件
- 检查日志文件

---

## `write` — 写入文件

创建新文件或完全覆盖已有文件。

**参数**

| 参数 | 类型 | 说明 |
|------|------|------|
| `path` | `string` | 目标文件路径（相对工作区） |
| `content` | `string` | 写入的完整文件内容 |

**使用场景**

- 生成新文件（脚本、配置、文档）
- 完整替换文件内容

---

## `edit` — 精准编辑

在文件中查找 `old_string` 并替换为 `new_string`，适合局部修改，避免重写整个文件。

**参数**

| 参数 | 类型 | 说明 |
|------|------|------|
| `path` | `string` | 目标文件路径 |
| `old_string` | `string` | 要替换的原始内容（需在文件中唯一） |
| `new_string` | `string` | 替换后的新内容 |

**使用场景**

- 修复代码中的 bug
- 更新配置项
- 重命名变量 / 函数

> **注意**：`old_string` 必须在文件中唯一出现，否则操作会失败并提示提供更多上下文。

---

## `bash` — 执行命令

在工作区目录下执行 shell 命令。内置安全分级，危险操作需用户确认。

**参数**

| 参数 | 类型 | 说明 |
|------|------|------|
| `command` | `string` | 要执行的 shell 命令 |

**安全分级**

| 级别 | 行为 | 匹配规则（前缀） |
|------|------|------|
| `safe` | 直接执行 | `ls`、`cat`、`head`、`tail`、`wc`、`git status/log/diff/show`、`npm test/run`、`pnpm`、`cargo build/test`、`python -c`、`node -e` |
| `confirm` | 弹出确认对话框 | 所有不在 `safe` 或 `block` 列表中的命令（如 `curl`、`wget`、`npm install`、`rm`、`grep` 等） |
| `block` | 拒绝执行 | `nc`、`telnet`、`rm -rf /`、`mkfs.`、`dd if=` |

**使用场景**

- 运行测试（`npm test`、`cargo test`）
- 构建项目（`pnpm build`）
- 查询 git 状态
- 安装依赖

---

## `fetch_url` — 获取网页

通过 Rust 后端抓取网页内容（绕过浏览器跨域限制），并提取主要文本。

**参数**

| 参数 | 类型 | 说明 |
|------|------|------|
| `url` | `string` | 目标网页 URL |

**使用场景**

- 查阅在线文档
- 获取 API 参考
- 搜索结果内容提取

---

## `parse_document` — 解析文档

解析上传的 PDF、DOCX、PPTX 或 XLSX 附件，提取文本内容供模型分析。

**参数**

| 参数 | 类型 | 说明 |
|------|------|------|
| `attachmentId` | `string` | 已上传附件的 ID（由会话消息中的附件清单提供） |
| `mode` | `"full"｜"summary"｜"chunks"` | 返回模式（可选，默认 `full`） |
| `pageRange` | `string?` | PDF 页码范围，如 `1-3,5`（可选） |

**支持格式**

- `PDF` — 提取全文内容
- `DOCX` — 提取段落与表格
- `PPTX` — 提取幻灯片文本
- `XLSX` — 提取工作表数据

**使用场景**

- 分析合同或报告
- 总结演示文稿
- 处理表格数据

---

## `cove_interpreter` — Lua 解释器

在沙箱环境（Lua 5.4 via mlua）中执行 Lua 代码，无网络访问。提供工作区文件读写 API。

**参数**

| 参数 | 类型 | 说明 |
|------|------|------|
| `code` | `string?` | 要执行的 Lua 代码（与 `file` 互斥） |
| `file` | `string?` | 工作区内 `.lua` 脚本路径（与 `code` 互斥） |
| `description` | `string?` | 代码用途简述（可选） |
| `timeout` | `number?` | 超时秒数（默认 30，最大 60） |

**可用 API**

- `print()`, `json.encode()`, `json.decode()`
- `string.*`, `table.*`, `math.*`
- `workspace.readFile(path)`, `workspace.writeFile(path, content)`, `workspace.listDir(path)` 等 11 个文件操作

**使用场景**

- 数学计算、数据变换
- JSON 处理
- 读写工作区文件（无需外部运行时）
- 执行工作区内的 `.lua` 脚本

---

## `skill` — 执行技能

加载并执行预定义的领域技能，实现复杂的多步骤任务。

**参数**

| 参数 | 类型 | 说明 |
|------|------|------|
| `name` | `string` | 技能名称（已启用的技能之一） |

**内置技能**

| 技能 | 功能 |
|------|------|
| `cove-core` | 核心行为指令（always-on） |
| `soul` | 人格系统指令（always-on） |
| `office` | 通过自然语言操作 Office 文档 |
| `skill-creator` | AI 创建新 Skill |
| `feedback` | 用户反馈收集指引 |
| `user-manual` | 产品使用手册 |

**自定义技能**

将技能文件放置于技能目录，Cove 会通过 `skill_discovery` 自动发现并注册。

---

## `skill_resource` — 加载技能资源

读取已启用技能附带的资源文件（`resources/` 目录下的文件）。

**参数**

| 参数 | 类型 | 说明 |
|------|------|------|
| `skillName` | `string` | 技能名称 |
| `resourcePath` | `string` | 资源完整路径，如 `resources/TABLE_OPERATIONS_GUIDE.md` |

**使用场景**

- 加载技能的参考文档或模板
- 读取技能附带的配置数据

---

## `write_skill` — 创建技能

AI 创建新的 Skill 并保存到用户技能目录（`~/.cove/skills/`）。仅在 `skill-creator` 技能启用时可用。

**参数**

| 参数 | 类型 | 说明 |
|------|------|------|
| `name` | `string` | 技能名称（slug 格式） |
| `content` | `string` | SKILL.md 完整内容（含 frontmatter） |

---

## `office` — Office 文档操作

通过集成的 office sidecar 进程，对本地 Office 文档（DOCX / PPTX / XLSX）执行程序化命令。

**参数**

| 参数 | 类型 | 说明 |
|------|------|------|
| `action` | `string` | 操作类型（见下表） |
| `path` | `string?` | 文档路径（`open` 时必填；`save` 时可选，表示另存为） |
| `command` | `string?` | 命令名称（`call` 时必填，如 `addSlide`、`setText`） |
| `args` | `object \| string[]` | 命令参数，推荐用键值对 object（如 `{title: "New Slide"}`），也兼容 CLI 风格数组 |

**支持的 action**

| action | 说明 |
|--------|------|
| `detect` | 检测本地是否已安装 office sidecar |
| `doctor` | 检查外部依赖状态（LibreOffice、poppler 等） |
| `open` | 打开指定路径的 Office 文档，建立会话 |
| `call` | 对已打开的文档执行命令（需提供 `command`） |
| `save` | 保存当前文档（提供 `path` 则另存为） |
| `close` | 关闭当前会话 |
| `status` | 查询当前会话状态（文档路径、PID、运行时长） |

**示例：在 PowerPoint 添加一张幻灯片**

```json
{ "action": "call", "command": "addSlide", "args": { "title": "新章节" } }
```

> **注意**：此工具调用的是内嵌 sidecar，与外部安装的 CLI 是独立的两套体系。
> 详见 [双轨体系](officellm-dual-track.md)。

---

## `diagram` — 渲染 Mermaid 图表

将 Mermaid 代码渲染为 PNG 图片并保存到工作区。常与 `office` 工具的 `addImage` 命令配合使用。

**参数**

| 参数 | 类型 | 说明 |
|------|------|------|
| `code` | `string` | Mermaid 图表代码 |
| `filename` | `string?` | 输出文件名（默认 `diagram-{timestamp}.png`） |
| `scale` | `number?` | 分辨率倍数 1-4（默认 2） |
| `theme` | `"default" \| "dark" \| "forest" \| "neutral"` | 图表主题（默认 `default`） |

**使用场景**

- 生成流程图、时序图、类图等
- 插入图表到 Office 文档

---

## `spawn_agent` — 子 Agent 派生

派生子 Agent 独立执行子任务。子 Agent 运行至完成后返回结果。

**参数**

| 参数 | 类型 | 说明 |
|------|------|------|
| `task` | `string` | 子 Agent 需完成的任务描述 |
| `tools` | `string[]?` | 子 Agent 可用的工具 ID 列表（默认继承父 Agent 所有工具） |
| `skills` | `string[]?` | 需加载到子 Agent 上下文的技能名称 |

**使用场景**

- 委派可独立完成的子任务
- 并行处理多个不需实时交互的任务

---

## `recall` — 对话记忆搜索

按主题搜索历史对话摘要。用于回忆之前的讨论内容。

**参数**

| 参数 | 类型 | 说明 |
|------|------|------|
| `query` | `string` | 搜索关键词或自然语言查询 |
| `limit` | `number?` | 最大结果数（默认 5，最大 10） |

**使用场景**

- 用户提及之前讨论过的内容时，搜索相关对话
- 查找历史上下文信息

---

## `recall_detail` — 对话详情检索

检索特定历史对话的原始消息。通常在 `recall` 找到相关对话后使用。

**参数**

| 参数 | 类型 | 说明 |
|------|------|------|
| `conversationId` | `string` | 对话 ID（来自 `recall` 结果） |
| `limit` | `number?` | 最大消息数（默认 50，最大 100） |

**使用场景**

- 获取之前对话的详细上下文
- 恢复中断的讨论
