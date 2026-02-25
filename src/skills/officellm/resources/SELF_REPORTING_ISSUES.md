# Agent 自主报告 Issue 指南 (Agent Self-Reporting Issue Guide)

当 Agent 在执行任务过程中遇到确定的 Bug 或明确的功能缺失时，为了提高效率，可以自主协助用户向 GitHub 仓库报告 Issue。

## 1. 前置条件

Agent 在尝试报告 Issue 之前，应先检查环境是否支持：

1.  **GitHub CLI (`gh`)**: 必须已安装。
2.  **认证状态**: 用户必须已登录 (`gh auth status`)。

Agent 可以通过运行以下命令来验证：
```bash
gh --version
```

## 2. 报告流程

### 第一步：查重 (Check for Duplicates)

在创建新 Issue 之前，**必须**搜索现有 Issue 以避免重复。

```bash
# 搜索相关 Issue
gh issue list --search "关键词" --state all
```

*如果发现已存在相同的 Issue，请不要重复创建，而是可以将新的上下文信息作为评论添加到现有 Issue 中（如果允许），或者告知用户该 Issue 已存在。*

### 第二步：收集信息 (Collect Information)

一个高质量的 Issue 应该包含：
*   **标题 (Title)**: 清晰简练的描述。
*   **描述 (Body)**:
    *   **背景/目的**: 试图做什么？
    *   **现象**: 发生了什么（错误信息、截图、日志）？
    *   **复现步骤 (Reproduction Steps)**: 如何重现该问题？
    *   **环境信息**: OS, 版本等。
    *   **崩溃报告 (如有)**: 如果是 OfficeLLM 的崩溃，请附上 Crash Report 路径（参考 `ERROR_TROUBLESHOOTING.md`）。

### 第三步：创建 Issue (Create Issue)

使用 `gh issue create` 命令。由于 Agent 可以直接执行命令，建议使用命令行参数直接提交，或者生成命令供用户确认。

**命令模板:**

```bash
gh issue create \
  --title "[Bug]: 简短描述" \
  --body "详细描述内容... (支持 Markdown)" \
  --label "bug"
```

**示例:**

```bash
gh issue create \
  --title "[Bug]: officellm replace-text 处理含有特殊字符的文本时崩溃" \
  --body "## 描述
  当输入文本包含 Emoji 时，replace-text命令报错。

  ## 复现步骤
  1. 创建包含 '😊' 的 docx 文件。
  2. 运行 \`officellm replace-text ...\`
  3. 报错: unexpected char.

  ## 环境
  - MacOS
  - OfficeLLM v1.0" \
  --label "bug"
```

## 3. Agent 最佳实践

1.  **不要急于报错**: 遇到错误首先尝试 `ERROR_TROUBLESHOOTING.md` 中的解决方案。只有确定是代码缺陷时才报 Issue。
2.  **用户确认**: 在执行 `gh issue create` 之前，**最好**向用户展示拟定的标题和内容，并获得确认。
    *   *Prompt: "看起来这是一个未知的 Bug，我已经准备好了 Issue 草稿，您希望我直接提交到 GitHub 吗？"*
3.  **使用 Markdown**: Body 内容支持 Markdown，请利用代码块来格式化日志和错误信息。
4.  **关联上下文**: 如果是在 Pull Request 相关的操作中发现问题，记得提及相关的 PR。

## 4. 常用 gh 命令参考

*   `gh issue list`: 列出 Issue
*   `gh issue view <number>`: 查看特定 Issue
*   `gh issue create`: 创建 Issue
*   `gh issue comment <number> --body "..."`: 评论 Issue

---
*此文档旨在帮助 Agent 更好地利用 GitHub CLI 工具协助开发者维护项目。*
