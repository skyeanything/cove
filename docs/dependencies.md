# 第三方依赖清单

Cove 及 OfficeLLM 的完整外部依赖项。分为运行时依赖（终端用户）和编译时依赖（开发者/CI）。

## 一、已打包在 app 内的 Sidecar（用户无需安装）

| Binary | 用途 | 拉取方式 |
|--------|------|----------|
| officellm | Office 文档操作 CLI (.NET) | `pnpm office-pull` |
| pdftoppm | PDF 转图片（poppler） | `pnpm poppler-pull` |
| pdftotext | PDF 转文本（poppler） | `pnpm poppler-pull` |
| Chromium | 内嵌浏览器渲染（chromiumoxide crate） | Rust 编译时链接 |

---

## 二、Cove 运行时依赖（终端用户）

### macOS

| 依赖 | 必需/可选 | 用途 | 安装方式 |
|------|-----------|------|----------|
| Pages.app | 可选 | DOCX -> PDF 预览转换 | macOS 自带或 App Store |
| Keynote.app | 可选 | PPTX -> PDF 预览转换 | macOS 自带或 App Store |

macOS 沙箱：`sandbox-exec`（系统自带 Seatbelt，无需安装）

macOS 系统自带工具（无需安装）：`open`, `osascript`, `pgrep`, `scutil`, `networksetup`, `route`

### Windows

| 依赖 | 必需/可选 | 用途 | 安装方式 |
|------|-----------|------|----------|
| Git for Windows (Bash) | 条件必需 | 提供 bash shell 执行环境 | app 自动安装 PortableGit；也可用户预装 |

Windows 无 OS 级沙箱支持，fallback 到应用层 permission 系统。

Windows 系统自带工具（无需安装）：`reg.exe`, `where.exe`, `taskkill.exe`, `powershell`

### Linux

| 依赖 | 必需/可选 | 用途 | 安装方式 |
|------|-----------|------|----------|
| bubblewrap (bwrap) | 可选 | 命令沙箱隔离（不装则 fallback 到 permission 系统） | `apt install bubblewrap` / `dnf install bubblewrap` |
| xclip 或 wl-paste | 可选 | 剪贴板文件路径读取 | `apt install xclip` / Wayland 自带 wl-paste |

### 跨平台

| 依赖 | 必需/可选 | 用途 | 安装方式 |
|------|-----------|------|----------|
| OfficeLLM CLI（外部安装） | 可选 | `~/.officellm/bin/officellm`，替代 bundled sidecar | `npm install -g officellm` 或手动安装 |
| LLM API Key | 必需 | AI 功能需至少一个 | OpenAI / Anthropic / Google / DeepSeek / Moonshot / Bedrock 等 |

---

## 三、OfficeLLM 自身的第三方依赖

> 不用全装：如果用户只做 .docx 的读写操作（不涉及 .doc 转换、PDF 导出、页面渲染、公式插入），则不需要安装任何外部依赖。OpenXML 处理使用 vendored 的 Clippit 库，无额外 native 依赖。

### 必需依赖

| 依赖 | 用途 | macOS | Linux | Windows |
|------|------|-------|-------|---------|
| LibreOffice | .doc -> .docx 转换、PDF 导出 | `brew install --cask libreoffice` | `sudo apt install libreoffice` | 从官网安装，默认路径自动检测 |
| pdftoppm (Poppler) | 页面渲染（PDF -> 图片） | `brew install poppler` | `sudo apt install poppler-utils` | 手动下载，加入 PATH 或放到 `~/.officellm/bin/` |

> **注意**：pdftoppm 在 Cove 中已作为 sidecar 打包并注入 PATH，用户通过 Cove 使用 officellm 时无需单独安装。仅在独立使用 officellm CLI 时需要。

**路径查找逻辑**：
- macOS LibreOffice：`/Applications/LibreOffice.app/Contents/MacOS/soffice` -> PATH
- Windows LibreOffice：`C:\Program Files\LibreOffice\program\soffice.exe` -> PATH
- pdftoppm：`~/.officellm/bin/pdftoppm` -> PATH

### 可选依赖

| 依赖 | 用途 | 安装方式 |
|------|------|----------|
| Pandoc | LaTeX 公式 -> OMML（`insert-equation` 命令） | `brew install pandoc` / `apt install pandoc` / 官网下载 |
| Quarto | 替代 PDF 引擎（`to-pdf --engine quarto`） | `brew install --cask quarto` / 官网下载 |
| Typst | 轻量 PDF 排版（`to-pdf --engine typst`，需同时装 Quarto） | 通过 Quarto 调用 |

### 健康检查

运行 `officellm doctor` 可检测 LibreOffice、pdftoppm、Quarto 的可用性。在 Cove 中可通过 `office(command: "doctor")` 调用。

---

## 四、Cove 编译时依赖（开发者 / CI）

### 全平台通用

| 依赖 | 最低版本 | 用途 |
|------|----------|------|
| Rust (rustup) | 1.77.2+ | Tauri 后端编译 |
| Node.js | 20+ | 前端构建 |
| pnpm | 10+ | 包管理（通过 corepack 启用） |
| Python 3 | 3.8+ | `scripts/check-file-size.py` |

### macOS

| 依赖 | 用途 | 安装方式 |
|------|------|----------|
| Xcode Command Line Tools | C 编译器（clang）、bindgen，mlua/Lua 编译必需 | `xcode-select --install` |

### Windows

| 依赖 | 用途 | 安装方式 |
|------|------|----------|
| Visual Studio Build Tools / MSVC | C/C++ 编译器、链接器 | VS Installer |
| LLVM/Clang | mlua Lua 编译、bindgen | 安装 LLVM，设置 `LIBCLANG_PATH="C:\Program Files\LLVM\lib"` |

> CI 中 Windows 构建显式设置 `LIBCLANG_PATH`，本地开发也需要。

### Linux (Ubuntu 22.04+)

```bash
sudo apt-get install -y \
  libwebkit2gtk-4.1-dev \   # Tauri webview 引擎
  libappindicator3-dev \    # 系统托盘
  librsvg2-dev \            # SVG 渲染
  patchelf \                # ELF 打包
  libssl-dev \              # OpenSSL
  libclang-dev              # mlua/Lua 编译
```

### 需要原生编译的关键 Rust Crate

| Crate | 版本 | 说明 | 需要 |
|-------|------|------|------|
| mlua | 0.10 | Lua 5.4 解释器（vendored，从 C 源码编译） | C 编译器 + clang |
| tauri-plugin-sql | 2.3.2 | SQLite（vendored） | C 编译器 |
| chromiumoxide | 0.9 | 内嵌浏览器 | — |
| reqwest | 0.12 | HTTP（rustls-tls，纯 Rust） | — |
| rookie | 0.5 | 浏览器 Cookie 读取 | 平台相关 |

### 需要原生编译的 npm 包

| 包 | 类型 | 说明 |
|----|------|------|
| esbuild | 依赖 | 有预编译二进制，通常无需手动编译 |
| sharp | devDep | 图片处理，有预编译二进制，罕见情况需 node-gyp |
| puppeteer | devDep | 下载 Chromium（~150MB），仅开发/测试用 |

### 可选二进制（开发时拉取）

| 二进制 | 拉取命令 | 需要 | 说明 |
|--------|----------|------|------|
| officellm | `pnpm office-pull` | GitHub 认证 (`gh auth login` 或 `GH_TOKEN`) | macOS arm64 + Windows x64 |
| poppler (pdftoppm/pdftotext) | `pnpm poppler-pull` | 仅 macOS | 从 Homebrew bottle 下载 |
| Quarto | `pnpm quarto-pull` | — | 自动下载到 `~/.cove/tools/quarto/` |

---

## 五、总结

### 终端用户：最小安装（零额外依赖）

macOS/Windows 上 cove.app/cove.exe 开箱即用。核心二进制（officellm、pdftoppm、pdftotext、Chromium）均已打包。只做 .docx 读写不需要任何额外安装。

### 终端用户：按功能所需的额外依赖

| 功能 | 需要安装 | 平台 |
|------|----------|------|
| .doc -> .docx 转换 / PDF 导出 | LibreOffice | 全平台 |
| DOCX/PPTX 预览（macOS 快捷转换） | Pages / Keynote | macOS |
| LaTeX 公式插入 | Pandoc | 全平台 |
| 替代 PDF 引擎 | Quarto (+ Typst) | 全平台 |
| QMD 文档渲染 | Quarto（Cove 可自动下载到 `~/.cove/tools/`） | 全平台 |
| Shell 命令执行（Windows） | Git for Windows（app 自动安装） | Windows |
| 命令沙箱（Linux） | bubblewrap | Linux |
| 剪贴板文件路径（Linux） | xclip / wl-paste | Linux |
| 独立使用 officellm CLI | OfficeLLM 外部安装 | 全平台 |

### 开发者：编译环境速查

| 平台 | 必装 |
|------|------|
| macOS | Xcode CLT + Rust + Node.js + pnpm |
| Windows | MSVC + LLVM/Clang + Rust + Node.js + pnpm |
| Linux | libwebkit2gtk-4.1-dev + libclang-dev + libssl-dev + librsvg2-dev + patchelf + libappindicator3-dev + Rust + Node.js + pnpm |
