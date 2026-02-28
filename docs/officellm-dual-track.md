# officellm 双轨体系

Cove 中存在两套独立的 officellm 体系：**内嵌（Bundled）** 和 **外部安装（External）**。两者可共存、版本可不同，各自的 Skill 文档匹配各自的 CLI 版本。

## 对照表

|  | 内嵌 officellm | 外部安装 officellm |
|---|---|---|
| **调用方式** | `officellm` Tauri tool (IPC) | `bash` tool (`officellm` CLI) |
| **Binary** | Sidecar，打包在 .app 内 | `~/.officellm/bin/officellm` |
| **Home 目录** | `<app_data>/officellm/` | `~/.officellm/` |
| **Skill 名称** | `officellm`（内置，always-on） | `OfficeLLM`（外部发现） |
| **Skill 来源** | `src/skills/officellm/SKILL.md`，Vite 静态加载 | Skill Discovery 扫描磁盘 |
| **用户可控** | 始终注入，不可关闭 | 可启用/禁用 |

## 内嵌 officellm

### Skill（`officellm`，always: true）

内置 Skill 是一个 **bootstrap**，始终注入到 system prompt 中，告诉模型：

1. **调用优先级** — 如果外部 `OfficeLLM` Skill 已启用，优先用 `bash` 调 CLI；否则用 Tauri tool
2. **加载完整参考** — 通过 `skill` 工具加载 `OfficeLLM` 获取完整命令文档
3. **资源发现** — `doctor` → `home` → `resources/` 路径
4. **依赖检测** — LibreOffice / poppler / Quarto 的安装指引

文件：`src/skills/officellm/SKILL.md`（~47 行）

### Tauri Tool（`officellm`）

通过 Tauri IPC 调用 bundled sidecar，支持 CLI 模式和 Server 模式。

关键文件：
- `src/lib/ai/tools/officellm.ts` — 工具定义
- `src-tauri/src/officellm/` — Rust 实现（resolve / cli / server / env / init）

### Binary 解析（`resolve.rs`）

`resolve_bin()` 按优先级查找：
1. Sidecar（exe 同目录，dev 带 triple 后缀，bundled 不带）
2. 外部安装 `~/.officellm/bin/officellm`

返回 `(path, is_bundled)` — `is_bundled` 决定 Home 目录选择。

### Home 目录

- Bundled: `officellm_home(app)` → `<app_data_dir>/officellm/`（自动创建）
- External: `external_home()` → `~/.officellm/`

## 外部安装 officellm

### Skill（`OfficeLLM`，外部发现）

由 officellm CLI 自带，安装在 `~/.officellm/skills/OfficeLLM/SKILL.md`。包含完整命令参考（~100 个命令）、工作流、最佳实践。

用户在设置中手动启用后，模型会用 `bash` 工具调用 `officellm` CLI。

### Skill Discovery 扫描路径

`discover_external_skills` 按以下顺序扫描，同名 Skill 先到先得：

1. **DEFAULT_SKILL_ROOTS**（`~/.officellm/skills/`）— 覆盖外部安装用户
2. **Bundled Home**（`<app_data>/officellm/skills/`）— 覆盖 bundled-only 用户
3. Custom roots / Workspace roots

这意味着：
- 外部安装用户：`~/.officellm/skills/` 先扫到 → 版本与用户安装的 CLI 匹配
- Bundled-only 用户：`~/.officellm/` 不存在 → bundled home 兜底，版本与 sidecar 匹配

关键文件：`src-tauri/src/skill_discovery/mod.rs`

## System Prompt 注入流程

```
buildSystemPrompt()
  ├── 基础身份 + 时间 + 工作区
  ├── 工具使用规则
  ├── Assistant 指令 + 用户自定义指令
  ├── getAlwaysSkills()
  │     └── officellm skill（always: true）← 始终注入
  └── "Use the skill tool to load domain-specific instructions..."
```

之前 `officellmAvailable` 参数在 `buildSystemPrompt` 中硬编码了一段 officellm 提示，
现已删除 — 由 always-on skill 机制统一处理。

## 工具门控

`getAgentTools()` 仍然通过 `options.officellm` 控制是否注册 `officellm` Tauri tool。
`isOfficellmAvailable()` 检测是否有可用的 binary（bundled 或 external）。

## 关键文件索引

| 文件 | 职责 |
|------|------|
| `src/skills/officellm/SKILL.md` | 内置 bootstrap skill（always-on） |
| `src/lib/ai/tools/officellm.ts` | `officellm` Tauri tool 定义 |
| `src/lib/ai/context.ts` | System prompt 构建（注入 always skills） |
| `src/lib/ai/tools/index.ts` | 工具注册与门控 |
| `src/lib/ai/officellm-detect.ts` | Binary 可用性检测 |
| `src-tauri/src/officellm/resolve.rs` | Binary + Home 路径解析 |
| `src-tauri/src/officellm/cli.rs` | CLI 模式执行 |
| `src-tauri/src/officellm/server.rs` | Server 模式管理 |
| `src-tauri/src/skill_discovery/mod.rs` | 外部 Skill 发现（含 bundled home 扫描） |
| `src/stores/skillsStore.ts` | Skill 启用/禁用状态管理 |
