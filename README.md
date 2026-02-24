# Cove

一款精致的桌面 AI 聊天客户端，支持 20+ AI 提供商，内置文件附件、Office 文档预览与工作区管理。

![Tauri](https://img.shields.io/badge/Tauri_2-FFC131?logo=tauri&logoColor=white)
![React](https://img.shields.io/badge/React_19-61DAFB?logo=react&logoColor=black)
![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?logo=typescript&logoColor=white)
![Vercel AI SDK](https://img.shields.io/badge/AI_SDK_6-000000?logo=vercel&logoColor=white)
![SQLite](https://img.shields.io/badge/SQLite-003B57?logo=sqlite&logoColor=white)

## 功能亮点

**对话**
- 多提供商模型切换，按对话覆盖模型与参数
- 流式输出、Token 用量追踪、上下文占用百分比
- 对话置顶、搜索、历史时间线分组

**附件与预览**
- 拖拽上传图片、PDF、代码文件、Office 文档
- 内置 DOCX / XLSX / PPTX 预览器
- 代码高亮（15+ 语言）、Markdown 渲染（数学公式、Mermaid 图表）

**工作区**
- 选择本地目录作为工作区，实时监听文件变更
- 文件树浏览、创建、重命名、删除

**AI 工具调用**
- Bash 执行（安全分级）、文件读写与编辑
- URL 抓取、文档解析
- 外部 Skill 发现与加载

**其他**
- 深色 / 浅色主题，跟随系统
- 中文 / English 双语
- 自定义助手（系统指令、温度、惩罚参数等）
- MCP Server 管理

## 支持的 AI 提供商

| 提供商 | 说明 |
|--------|------|
| OpenAI | GPT-4o, o1, o3-mini 等 |
| Anthropic | Claude Opus / Sonnet / Haiku |
| Google | Gemini 2.0 Flash / Pro |
| DeepSeek | deepseek-chat, deepseek-reasoner |
| Ollama | 本地开源模型 |
| OpenRouter | 多模型统一网关 |
| Moonshot (Kimi) | 国内 / 国际端点 |
| 腾讯混元 | 多层级模型 |
| 火山引擎 (Ark) | 豆包等模型 |
| MiniMax | M2.5 系列 |
| 阿里云 (通义千问) | DashScope API |
| Groq | 高速推理 |
| Mistral | 多规格模型 |
| GitHub Copilot | 托管模型 |
| Perplexity | 搜索增强模型 |
| Together | 开源模型 API |
| Azure OpenAI | 企业级部署 |
| AWS Bedrock | 多厂商模型 |
| 自定义 | 任意 OpenAI 兼容端点 |

## 技术栈

| 层 | 技术 |
|----|------|
| 桌面框架 | Tauri 2 (Rust) |
| 前端 | React 19 + TypeScript + Vite 7 |
| AI | Vercel AI SDK 6 |
| 样式 | Tailwind CSS 4 + shadcn/ui |
| 状态管理 | Zustand 5 |
| 数据库 | SQLite (tauri-plugin-sql) |
| 国际化 | i18next |
| 文档处理 | pdf-extract, docx-lite, calamine (Rust) |
| 包管理 | pnpm |

## 快速开始

### 环境要求

- [Node.js](https://nodejs.org/) 18+
- [pnpm](https://pnpm.io/) 10+
- [Rust](https://www.rust-lang.org/tools/install) 1.77+
- Tauri 2 系统依赖（参考 [Tauri 官方文档](https://v2.tauri.app/start/prerequisites/)）

### 安装与运行

```bash
# 克隆仓库
git clone <repo-url>
cd cove

# 安装依赖
pnpm install

# 启动开发模式
pnpm tauri dev
```

### 构建

```bash
# 构建生产版本
pnpm tauri build
```

## 项目结构

```
src/                        # React 前端
├── components/
│   ├── chat/              # 聊天区域、消息列表、Markdown 渲染
│   ├── sidebar/           # 左侧栏、搜索
│   ├── settings/          # 设置面板（提供商、模型、助手）
│   ├── preview/           # 文件预览（代码、Office、PDF）
│   ├── layout/            # 布局外壳
│   └── ui/                # shadcn/ui 基础组件
├── lib/
│   ├── ai/                # AI Agent、模型服务、工具定义
│   └── db/                # SQLite 仓储层
├── stores/                # Zustand 状态管理
├── hooks/                 # 自定义 Hooks
├── types/                 # TypeScript 类型定义
└── i18n/                  # 国际化资源

src-tauri/                  # Rust 后端
├── src/                   # 命令实现（文件、Shell、文档解析等）
└── migrations/            # 数据库迁移
```

## 开发脚本

| 命令 | 说明 |
|------|------|
| `pnpm dev` | 启动前端开发服务器 |
| `pnpm build` | 构建前端 |
| `pnpm tauri dev` | 启动 Tauri 开发模式 |
| `pnpm tauri build` | 构建桌面应用 |
| `pnpm test` | 运行测试 |

## License

MIT
