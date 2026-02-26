# Agent 可靠性指南 (Agent Reliability Guide)

OfficeLLM 专为 AI Agent 设计，提供了一系列功能来确保文档操作的稳定性和安全性。本指南详细介绍了如何利用这些功能来构建健壮的文档处理流程。

## 1. 处理修订追踪 (Tracked Changes)

修订追踪是导致 Agent 操作失败的常见原因。当文档包含未接受的修订时，文本可能会分散在 `w:del`（删除线）和 `w:ins`（插入）标签中，甚至导致 `replace-text` 无法匹配预期文本。

### 问题场景
- 直接读取 XML 时包含已删除的内容。
- 只有部分文本被匹配到（因为 XML 结构被修订标签打断）。

### 最佳实践

#### 1.1 读取内容
如果你只关心文档的**最终呈现状态**（即接受所有修订后的样子），请在提取文本时使用 `--final-only`：

```bash
officellm extract-text -i doc.docx --final-only
```

这会自动在内存中接受所有修订，只提取最终文本。

#### 1.2 执行修改
在修改文档之前，建议明确处理修订状态。你可以选择：

- **方案 A (推荐)**：在执行指令时自动接受修订。
  ```bash
  officellm execute -f instructions.json -i doc.docx --accept-revisions
  ```

- **方案 B**：显式清理文档。
  ```bash
  officellm accept-revisions -i doc.docx -o clean.docx
  officellm replace-text -i clean.docx ...
  ```

## 2. 稳定的定位策略 (Stable Targeting)

依赖纯文本查找（`Text Search`）容易受到格式变化（如多余空格、格式标签）的影响。为了提高定位的准确性，建议使用 **结构化定位**。

### 2.1 获取文档结构
首先，使用 `list-structure` 获取文档的骨架：

```bash
officellm list-structure -i doc.docx
```

输出示例：
```json
{
  "paragraphs": [
    { "index": 0, "text": "Heading 1", "xpath": "/w:document/w:body/w:p[1]" },
    { "index": 1, "text": "Content...", "xpath": "/w:document/w:body/w:p[2]" }
  ]
}
```

### 2.2 使用索引定位 (`ReplaceParagraphByIndex`)
在 `execute` 模式下，可以直接通过索引替换段落。这对于结构固定的模板填充非常有效。

指令示例 (`instructions.json`):
```json
{
  "ops": [
    {
      "op": "ReplaceParagraphByIndex",
      "target": "1",  // 目标段落索引 (0-based)
      "payload": "Updated content via index."
    }
  ]
}
```

### 2.3 使用 XPath 定位 (`ReplaceParagraphByXPath`)
如果已知确切的 XML 路径，可以使用 XPath 进行绝对定位。

```json
{
  "ops": [
    {
      "op": "ReplaceParagraphByXPath",
      "target": "/w:document/w:body/w:p[5]",
      "payload": "Updated via XPath."
    }
  ]
}
```

## 3. 安全预检 (Dry Run)

在对文档进行实质性修改之前，**务必**使用 `--dry-run` 模式。这不仅能防止意外破坏，还能帮你确认“我想改的内容是否真的会被改到”。

### 用法
所有编辑命令（`replace-text`, `execute` 等）均支持 `--dry-run`。

```bash
officellm replace-text -i doc.docx --find "old" --replace "new" --dry-run
```

**返回结果**将包含：
- `total_changes`: 预计修改的数量。
- `changes`: 变更详情列表（包括匹配到的 XPath、原文预览等）。

### Agent 检查清单
1. 执行 `--dry-run`。
2. 检查 `total_changes` 是否符合预期（例如：预期替换 1 处，结果为 0 表示没找到，结果为 10 表示匹配太宽泛）。
3. 如果符合预期，再去掉 `--dry-run` 执行真实命令。

## 4. 原子化批量执行 (Atomic Batch Execution)

相比于连续执行多次 `replace-text`（每次都会重新读写文件，效率低且容易因文件锁定出错），建议使用 `execute` 命令一次性完成多个操作。

```bash
officellm execute -f plan.json -i doc.docx
```

`execute` 命令会：
1. 一次性加载文档。
2. 在内存中按顺序应用所有操作。
3. 只有所有操作都成功（或遇到非致命错误）后才保存文件。
