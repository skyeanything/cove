# OfficeLLM 错误排查指南

## 常见错误及解决方案

### 1. REPLACE_ERROR - 文档有修订追踪

**错误信息:**
```json
{
  "success": false,
  "command": "replace-text",
  "error_code": "REPLACE_ERROR",
  "message": "Document has revisions enabled..."
}
```

**原因:** 目标文档启用了修订追踪 (Track Changes)，文本被分割在多个 XML 节点中。

**解决方案:**
```bash
# 先接受所有修订
officellm accept-revisions -i document.docx -o clean.docx

# 然后执行替换
officellm replace-text -i clean.docx -o output.docx --find "old" --replace "new"
```

---

### 2. FILE_NOT_FOUND - 文件不存在

**错误信息:**
```json
{
  "success": false,
  "error_code": "FILE_NOT_FOUND",
  "message": "Input file does not exist: /path/to/file.docx"
}
```

**解决方案:**
- 检查文件路径是否正确
- 确认文件扩展名是 `.docx` 而非 `.doc`
- 使用绝对路径

---

### 3. INVALID_DOCX - 无效的文档格式

**错误信息:**
```json
{
  "success": false,
  "error_code": "INVALID_DOCX",
  "message": "The file is not a valid DOCX document"
}
```

**原因:** 文件损坏或不是有效的 OpenXML 格式。

**解决方案:**
- 确认文件是 `.docx` 格式 (Office 2007+)
- 如果是 `.doc` 格式，需先转换
- 尝试用 Word 打开并重新保存

---

### 4. XPATH_NOT_FOUND - XPath 定位失败

**错误信息:**
```json
{
  "success": false,
  "error_code": "XPATH_NOT_FOUND",
  "message": "Cannot locate element with XPath: ..."
}
```

**解决方案:**
```bash
# 使用 search 命令获取正确的 XPath
officellm search -i document.docx --find "目标文本"

# 使用 list-structure 查看文档结构
officellm list-structure -i document.docx
```

---

### 5. PERMISSION_DENIED - 权限不足

**错误信息:**
```json
{
  "success": false,
  "error_code": "PERMISSION_DENIED",
  "message": "Cannot write to output file..."
}
```

**解决方案:**
- 检查输出目录是否存在
- 确认有写入权限
- 确保文件未被其他程序打开

---

## 🛡️ 预防错误的最佳实践

### 使用 --dry-run 预检模式

在执行修改操作前，**强烈建议**先使用 `--dry-run` 预览变更：

```bash
# ❌ 不推荐：直接执行可能出错
officellm replace-text -i doc.docx --find "old" --replace "new"

# ✅ 推荐：先预览，确认无误后再执行
# Step 1: 预览
officellm replace-text -i doc.docx --find "old" --replace "new" --dry-run

# Step 2: 检查返回的 totalChanges 和 changes 列表
# Step 3: 确认无误后执行
officellm replace-text -i doc.docx --find "old" --replace "new" -o output.docx
```

**--dry-run 可以帮你避免:**
- ✅ 替换了错误的内容（匹配数量不符预期）
- ✅ 影响了不该修改的段落
- ✅ XPath 定位错误
- ✅ 大小写匹配问题
- ✅ 正则表达式匹配范围过大

---

## 调试技巧

### 获取详细日志

```bash
# 使用 raw-xml 查看原始 XML 结构
officellm raw-xml -i document.docx --path "w:document/w:body"

# 使用 list-structure 获取文档概览
officellm list-structure -i document.docx
```

### 验证文档完整性

```bash
# 简化 markup 去除多余格式
officellm simplify-markup -i complex.docx -o simplified.docx

# 提取纯文本检查内容
officellm extract-text -i document.docx
```

## 错误码速查表

| 错误码 | 说明 | 常见原因 |
|--------|------|----------|
| `FILE_NOT_FOUND` | 文件不存在 | 路径错误 |
| `INVALID_DOCX` | 无效文档 | 格式错误/损坏 |
| `REPLACE_ERROR` | 替换失败 | 修订追踪/复杂格式 |
| `XPATH_NOT_FOUND` | 定位失败 | XPath 错误 |
| `PERMISSION_DENIED` | 权限不足 | 文件锁定/权限 |
| `VALIDATION_ERROR` | 参数验证失败 | 参数缺失/无效 |

---

## 🚨 自动崩溃报告 (Automatic Crash Reporting)

从 **v1.0** (Issue #76) 开始，`officellm` 引入了自动崩溃报告机制。

如果 `officellm` 遇到未处理的异常 (Unhandled Exception)，它将：
1.  自动在临时目录创建一个崩溃报告文件夹。
2.  包含错误堆栈 (`error.txt`)、环境信息 (`env.json`)、命令行参数 (`args.txt`) 以及可能的输入文件副本。
3.  返回包含 `crash_report_path` 的 JSON 错误信息。

**错误输出示例:**
```json
{
  "Status": "failure",
  "Error": {
    "Code": "UNEXPECTED_ERROR",
    "Message": "Object reference not set to an instance of an object.",
    "Details": {
      "crash_report_path": "/tmp/officellm/crashes/20260123-100833-ae038771"
    }
  }
}
```

**如何处理:**
- **Agent 优先级**:
  1. **首要任务**: 尝试用其他方法继续完成用户任务（例如：简化操作、分步执行、使用替代命令）
  2. **次要任务**: 只在任务完成或用户明确放弃后，询问用户是否需要报告此bug
  3. **报告时**: 提供 `crash_report_path`，建议用户检查该目录下的 `error.txt`
- **User**: 可以检查该目录下的 `error.txt` 了解详细错误信息。

**Agent 响应示例:**
```
我在处理文档时遇到了一次崩溃，但已经使用替代方法完成了任务。

备注：初次尝试时发生了崩溃。您是否需要我帮助报告这个bug？
崩溃报告位于：/tmp/officellm/crashes/20260123-100833-ae038771
```


---

### 6. PROGRAM_HANGS - 程序启动无响应 (macOS)

**症状:** 运行 \`officellm\` 命令后无反应，终端长时间卡住，无任何输出 (特别是 \`officellm --version\` 卡住)。

**原因:** 
1. **原生 AppHost 死锁**: 在 macOS 上，如果系统中有僵尸进程 (Zombie Processes) 或其他程序 (如 IDE) 锁定了 \`officellm\` 二进制文件，新的 AppHost 启动器可能会进入死锁等待状态 (Uninterruptible Sleep)。
2. **文件锁冲突**: 开发环境特有的热更新冲突。

**解决方案:**

**方案 A: 强制清理进程**
尝试杀死所有可能持有锁的进程：
\`\`\`bash
# 查找并杀死所有 officellm 进程
pkill -9 -f officellm
\`\`\`
如果进程状态为 \`UE\` (Uninterruptible Sleep)，可能需要重启系统才能清除。

**方案 B: 使用单文件发布版本 (最佳实践)**
使用 \`PublishSingleFile\` 模式发布的二进制文件具有不同的加载机制，通常能绕过 AppHost 死锁，且文件结构更整洁。

\`\`\`bash
# 构建单文件版本 (以 macOS arm64 为例)
dotnet publish OfficeLlm.Cli -c Release -r osx-arm64 -p:PublishSingleFile=true --self-contained false -o publish_output

# 替换现有安装
rm -rf ~/.officellm/bin/*
cp publish_output/officellm ~/.officellm/bin/
\`\`\`

**方案 C: 使用 Shell 包装器 (临时 Workaround)**
如果无法重启系统且急需使用，可以使用 Shell 脚本直接调用 DLL，绕过原生启动器：

1. 删除 \`~/.local/bin/officellm\` 原生文件/链接
2. 创建同名脚本：
\`\`\`bash
#!/bin/bash
# Bypass native AppHost to avoid locking issues
exec dotnet "$HOME/.officellm/bin/officellm.dll" "\$@" # (注意：仅适用于非 SingleFile 版本)
\`\`\`
3. 赋予执行权限 \`chmod +x\`
