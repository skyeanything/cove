# 快速开始

从裸 macOS 到项目跑起来的完整指南。项目能跑之后的开发流程（worktree、分支、PR、测试）见 [CONTRIBUTING.md](../CONTRIBUTING.md)。

## 系统要求

| 依赖 | 最低版本 | 说明 |
|------|----------|------|
| macOS | 12 Monterey+ | 当前主要支持平台 |
| Xcode Command Line Tools | — | Rust 和原生模块编译必需 |
| Rust | 1.77.2+ | 通过 rustup 安装 |
| Node.js | 20+ | 推荐通过 nvm 管理 |
| pnpm | 10+ | 通过 corepack 启用 |
| Python 3 | 3.8+ | 文件大小校验脚本需要 |

## 环境安装

### Xcode Command Line Tools

Rust 编译和部分 npm 原生模块（如 rquickjs 的 bindgen）依赖 clang，必须先装。

```bash
xcode-select --install
```

弹出安装窗口后点确认，等待完成。已安装过的会提示 "already installed"。

验证：

```bash
xcode-select -p
# 应输出 /Library/Developer/CommandLineTools 或 Xcode.app 路径
```

### Rust

通过 rustup 安装，不要用 Homebrew（Homebrew 版本不含 rustup，后续工具链管理不便）。

```bash
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
```

安装过程选默认选项（按 1）。安装完后重新加载 shell 环境：

```bash
source "$HOME/.cargo/env"
```

验证：

```bash
rustc --version   # >= 1.77.2
cargo --version
```

### Node.js

推荐通过 nvm 管理多版本：

```bash
# 安装 nvm（如果没装过）
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash

# 重新打开终端，然后安装 Node.js
nvm install 22
nvm use 22
```

或通过 Homebrew：

```bash
brew install node@22
```

验证：

```bash
node --version   # >= 20
```

### pnpm

通过 Node.js 内置的 corepack 启用：

```bash
corepack enable
corepack prepare pnpm@10.28.2 --activate
```

`package.json` 的 `packageManager` 字段锁定了项目使用的 pnpm 版本，corepack 会自动遵循。

验证：

```bash
pnpm --version   # >= 10
```

### Python 3

macOS 12+ 自带 Python 3。如果没有：

```bash
brew install python3
```

验证：

```bash
python3 --version   # >= 3.8
```

## 获取代码并运行

### 克隆仓库

```bash
git clone https://github.com/cove-founders/cove.git
cd cove
```

### 安装依赖

```bash
pnpm install
```

### 启动开发环境

两种模式：

```bash
# 完整桌面应用（前端 + Rust 后端）
pnpm tauri dev

# 仅前端（浏览器中预览，不含 Tauri 功能）
pnpm dev
```

日常开发推荐 `pnpm tauri dev`，需要测试 Tauri 命令（文件系统、Shell、数据库等）时必须用完整模式。仅调试纯前端 UI 时可用 `pnpm dev` 加快启动。

### 首次构建说明

首次运行 `pnpm tauri dev` 会从零编译 Rust 后端，根据机器配置耗时 5-15 分钟。这是正常的。期间终端会持续输出 `Compiling ...` 日志，不是卡死。

后续启动只编译变更的部分，通常几秒到十几秒。

## officellm 二进制（可选）

officellm 是 Office 文档操作功能的后端二进制。如果不需要 Office 文档操作功能，可以跳过。

```bash
# 需要 GitHub CLI 且已认证
gh auth status

# 拉取二进制
pnpm office-pull
```

二进制会下载到 `src-tauri/binaries/`。需要 GitHub 仓库的读取权限。

详细的 officellm 架构说明见 [docs/officellm-dual-track.md](officellm-dual-track.md)。

## 验证安装

运行以下命令确认环境正确：

```bash
# 版本检查
rustc --version && cargo --version && node --version && pnpm --version && python3 --version

# 前端构建（含类型检查）
pnpm run build

# 运行测试
pnpm test

# Rust 静态检查
(cd src-tauri && cargo check)
```

全部通过后，运行 `pnpm tauri dev`，应看到桌面窗口正常启动。

## 常见问题

### rquickjs / bindgen / clang 编译失败

```
error: failed to run custom build command for `rquickjs-sys`
```

原因：缺少 Xcode Command Line Tools。安装后重试：

```bash
xcode-select --install
# 安装完成后重新运行
pnpm tauri dev
```

如果已安装但仍报错，尝试重置路径：

```bash
sudo xcode-select --reset
```

### 首次 cargo 编译耗时过长

首次编译 Rust 后端需要 5-15 分钟，取决于机器配置。终端持续输出 `Compiling xxx v0.x.x` 是正常现象，不是卡死。

如果需要确认编译仍在进行，可以观察 CPU 使用率或用 `Activity Monitor` 查看 `rustc` 进程。

### pnpm install 原生模块失败

```
error: node-gyp rebuild failed
```

可能原因：

1. 缺少 Xcode Command Line Tools（见上方）
2. Node.js 版本过低（需 >= 20）
3. sharp 等模块的预编译二进制不匹配当前平台

尝试清除缓存重装：

```bash
rm -rf node_modules
pnpm store prune
pnpm install
```

### officellm 二进制拉取失败

```
error: HTTP 404 / 401
```

需要 GitHub CLI 认证且有仓库读取权限：

```bash
# 检查认证状态
gh auth status

# 如果未认证
gh auth login
```

认证后重新运行 `pnpm office-pull`。

## 下一步

- 开发流程、分支规范、测试要求、PR 提交 -- 见 [CONTRIBUTING.md](../CONTRIBUTING.md)
- 项目架构 -- 见 [docs/architecture.md](architecture.md)
- AI 工具文档 -- 见 [docs/tools.md](tools.md)
- AI agent 开发者必读 -- 见 [AGENTS.md](../AGENTS.md)
