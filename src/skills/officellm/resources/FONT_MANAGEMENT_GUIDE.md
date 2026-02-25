# Font Management & CJK Rendering Guide

## Introduction
Word documents handle fonts through explicit family names in OpenXML (`w:rFonts`). For CJK (Chinese, Japanese, Korean) characters, the `w:eastAsia` attribute must be set correctly, or Word will fall back to a default font (often SimSun or Calibri), even if the Ascii font is specified.

OfficeLLM uses a unified **Font Resolver** to handle these complexities for you.

## 🛠️ The Font Resolver
The resolver maps **Font IDs** or **Aliases** to internal Word font family names and ensures the correct attributes are set.

### Built-in Font IDs (Deterministic)
Agents should prefer using these IDs for predictable results:

| ID | Font Name | Display (CN) |
|----|-----------|--------------|
| `cn-fangsong` | FangSong | 仿宋 |
| `cn-simsun` | SimSun | 宋体 |
| `cn-simhei` | SimHei | 黑体 |
| `cn-kaiti` | KaiTi | 楷体 |
| `cn-ms-yahei` | Microsoft YaHei | 微软雅黑 |
| `cn-dengxian` | DengXian | 等线 |

## 🔍 Discovery
Always check available fonts before applying formatting to avoid using unknown strings.

```bash
# List all registered fonts and their aliases
officellm list-fonts
```

## 🏗️ External Configuration (`fonts.json`)
If you need to use a font not in the built-in list, you can manage a local `fonts.json` file.

### Initialization
Create a base configuration file in your current directory:
```bash
officellm font init
```

### Registering a New Font
If you detect a system font you want to use, register it with an ID:
```bash
officellm font add --id "my-custom" --name "Arial Unicode MS" --display "Arial Unicode" --east-asia true
```

## 💡 Best Practices for Agents

1. **Use IDs**: Instead of `font: "仿宋"`, use `font: "cn-fangsong"`. This bypasses alias resolution and is more robust.
2. **EastAsia Attribute**: If you are dealing with Chinese characters, ensure `RequiresEastAsia` is `true` in the font definition. OfficeLLM handles the XML injection automatically if this is set.
3. **Scan then Register**: If the user asks for a font you don't recognize, try to find it via system tools (like `fc-list` on Linux/Mac) and then `font add` it to the local config for future use.
4. **Global Font Replacement**: To normalize an entire document's font (e.g., for Chinese government compliance), use `apply-format` without the `--find` parameter.
   ```bash
   # Make everything FangSong (main body, headers, footers)
   officellm apply-format -i input.docx --font "cn-fangsong"
   ```
5. **Style over Direct Formatting**: Whenever possible, use `modify-style` to set fonts globally rather than applying them to individual paragraphs/cells.

## 🔴 Common Issues

### Characters showing as hollow boxes or incorrect font
**Cause**: The `w:eastAsia` attribute in `w:rFonts` is likely missing or pointing to the wrong font name.
**Solution**: Use a recognized Font ID or Alias from `officellm list-fonts`. Ensuring you use the correct Word-internal name (e.g., `FangSong` not `仿宋-GB2312`) is critical.
