# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

---

## [Unreleased] — v0.1.0

### Added

- **officellm API 模块** — CLI / Server 双模式，支持检测、打开、操作、保存、关闭 Office 文档，并作为 AI 工具（`officellm`）供模型调用
- **附件系统** — 拖拽上传 PDF / DOCX / PPTX / XLSX，自动解析并附带到对话上下文
- **Office 文件预览面板** — 工作区文件树浏览 + 多格式查看器
- **工作区监听** — 文件变更实时更新（`workspace_watcher.rs`）
- **officellm to-pdf 集成** — 替代 Pages 转换，支持 Office 文档转 PDF
- **技能系统（Skill）** — 内置 `officellm`、`web-research` 技能；支持外部自定义技能发现（`skill_discovery.rs`）
- **聊天优化** — `ModelOptionsForm` 模型参数配置，`useTypewriter` 打字机效果
- **流式渲染优化** — 实时流式输出限流处理，提升大模型响应体验

### Changed / Refactored

- 拆分 14 个超限文件（`.ts`/`.tsx` > 400 行），清零 baseline 豁免列表
- 强化开发规范（`CLAUDE.md` MUST / MUST NOT 约束，worktree 工作流）
- 清理未使用的导入与函数
- 补充 Husky pre-commit 依赖，自动执行文件大小检查

### Fixed

- officellm 工具：`BufReader` 持久化、无锁 I/O，修复 `close()` 与路由问题
- 修正 officellm 提示能力边界描述
- 修复 session 在 I/O 期间未保持全局状态导致的路由异常

---

## [0.0.1] — Initial

### Added

- 基础 AI 聊天框架（Tauri 2 + React 19 + Vercel AI SDK 6）
- 多供应商支持：OpenAI、Anthropic、Google Gemini、DeepSeek、Moonshot、Amazon Bedrock
- 本地 SQLite 持久化对话历史（`tauri-plugin-sql`）
- 8 个内置 AI 工具：`read`、`write`、`edit`、`bash`、`fetch_url`、`parse_document`、`skill`、`officellm`
- Zustand 状态管理（9 个 store：chat、data、filePreview、layout、permission、settings、skills、theme、workspace）
- Tailwind CSS 4 + shadcn/ui 设计系统（"Quiet Elegance" 风格）
- 亮色 / 暗色主题切换
- Husky pre-commit hook + 文件大小校验脚本
