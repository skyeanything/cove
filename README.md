# Cove — AI 桌面聊天客户端

<!-- TODO: 截图 -->

## 特性

- **多供应商支持** — OpenAI、DeepSeek、Moonshot、OpenRouter 等供应商可在设置 UI 直接配置；Anthropic、Google Gemini、Bedrock 等更多供应商已在代码层集成，后续版本陆续开放
- **本地 SQLite 持久化** — 所有对话数据存储在本地，数据不上云
- **流式推理** — 实时流式输出，支持 Thinking / Reasoning 内容展示
- **内置 AI 工具** — 读写文件、执行 shell 命令、解析文档（PDF / DOCX / PPTX / XLSX）、网页获取、Office 文档操作
- **技能系统（Skill）** — 内置 `officellm`、`web-research` 技能，支持外部自定义技能
- **工作区感知** — 文件树浏览、工作区快速切换、文件变更实时监听
- **主题切换** — 亮色 / 暗色，Linear / Raycast 风格"安静优雅"设计系统
- **附件系统** — 拖拽上传 PDF / DOCX / PPTX / XLSX，自动解析并附带到对话上下文

## 技术栈

| 层级 | 技术 |
|------|------|
| 桌面框架 | Tauri 2 |
| 前端 | React 19 + TypeScript + Vite |
| AI | Vercel AI SDK 6 |
| UI | Tailwind CSS 4 + shadcn/ui |
| 状态管理 | Zustand |
| 数据库 | SQLite（tauri-plugin-sql） |
| 包管理 | pnpm |

## 安装与运行

### 前置条件

- Node.js >= 20，pnpm >= 10
- Rust >= 1.77.2
- macOS（当前主要支持平台）

### 克隆 & 启动开发环境

```bash
git clone https://github.com/skyeanything/cove.git
cd cove
pnpm install
pnpm tauri dev
```

### 生产构建

```bash
pnpm tauri build
```

## 项目结构

```
cove/
├── src/
│   ├── components/
│   │   ├── ui/          # shadcn/ui 原语（勿修改）
│   │   ├── chat/        # 聊天相关组件
│   │   ├── sidebar/     # 侧边栏组件
│   │   ├── settings/    # 设置面板
│   │   └── layout/      # 布局外壳
│   ├── hooks/           # 自定义 React Hooks
│   ├── stores/          # Zustand 状态（每个领域一文件）
│   ├── lib/
│   │   ├── ai/          # AI SDK 封装 & 工具
│   │   ├── db/          # SQLite 操作（Repository 模式）
│   │   └── utils.ts     # 共用工具
│   ├── types/           # TypeScript 类型定义
│   └── i18n/            # 国际化翻译
├── src-tauri/           # Rust 后端（Tauri 命令）
│   └── src/
│       ├── attachment_commands/  # 附件解析命令
│       ├── docx_commands/        # DOCX 操作
│       ├── fs_commands/          # 文件系统命令
│       ├── officellm/            # Office LLM 集成
│       ├── fetch_commands.rs     # 网页获取
│       ├── shell_commands.rs     # Shell 命令执行
│       ├── skill_discovery.rs    # 技能发现
│       └── workspace_watcher.rs  # 工作区监听
├── docs/                # 项目文档
│   ├── architecture.md  # 架构说明
│   ├── tools.md         # AI 工具文档
│   └── providers.md     # LLM 供应商列表
├── scripts/             # 构建 & 开发脚本
└── CLAUDE.md            # AI 开发规范（设计系统 + 工作流）
```

## 配置 AI 供应商

打开 **设置 → 供应商**，选择对应供应商，填入 API Key 即可启用。支持的供应商列表见 [docs/providers.md](docs/providers.md)。

## AI 工具

Cove 内置 8 个 AI 工具，模型可在对话中自动调用：

| 工具 | 功能 |
|------|------|
| `read` | 读取工作区文件内容 |
| `write` | 创建或覆盖文件 |
| `edit` | 精准编辑（oldString → newString 替换） |
| `bash` | 执行 shell 命令（含安全分级） |
| `fetch_url` | 获取并解析网页内容 |
| `parse_document` | 解析 PDF / DOCX / PPTX / XLSX |
| `skill` | 加载并执行领域技能 |
| `officellm` | Office 文档操作（检测 / 打开 / 操作 / 保存 / 关闭） |

详细说明见 [docs/tools.md](docs/tools.md)。

## 文档

| 文档 | 内容 |
|------|------|
| [架构说明](docs/architecture.md) | 前端架构与数据流 |
| [AI 工具](docs/tools.md) | 8 个内置工具的参数与使用场景 |
| [LLM 供应商](docs/providers.md) | 供应商配置与支持列表 |
| [工具-技能架构](docs/agent-tool-skill-architecture.md) | 工具分类、Skill 门控、命名迁移 |
| [officellm 双轨体系](docs/officellm-dual-track.md) | 内嵌 vs 外部 officellm 架构 |
| [Soul 系统](docs/soul-system.md) | Agent 人格与行为框架 |
| [Soul 实现](docs/soul-implementation.md) | Soul 系统技术实现细节 |
| [Soul 对话日志](docs/soul-conversation-log.md) | Soul 设计过程对话记录 |

## 贡献

见 [CONTRIBUTING.md](CONTRIBUTING.md)。

## License

MIT
