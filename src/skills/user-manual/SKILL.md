---
name: user-manual
description: "Cove 应用使用手册。当用户询问如何使用本应用、有哪些功能、快捷键、工具用途、设置选项、@mention 用法等问题时使用此技能。When users ask 'how to use this app', 'what features', 'keyboard shortcuts', 'what tools are available', 'settings', '@mention', use this skill."
emoji: "📖"
always: false
---

# Cove User Manual

Desktop AI chat client. Tauri 2 + React. Local SQLite storage. Multi-provider, multi-tool, extensible via skills.

## Conversations

- `Cmd+N` creates a new conversation
- Conversations persist in local SQLite
- Each conversation tracks model, messages, and attachments
- Sidebar context menu: rename, delete

## Providers

21 providers supported. Configure API keys in Settings > Providers.

Anthropic, OpenAI, Google AI, Azure OpenAI, DeepSeek, Groq, Mistral, Moonshot, Alibaba Cloud, Tencent Cloud, Volcengine Ark, MiniMax, Perplexity, Together, xAI, AWS Bedrock, GitHub Copilot, GitHub Models, OpenRouter, Ollama, OpenAI Compatible.

Switch models mid-conversation with `Cmd+/` or the model selector in the toolbar.

## Tools

All tools are available by default. Category determines gating.

### Built-in (always available)

| Tool | Description |
|------|-------------|
| Read File | Read file contents from the workspace |
| Write File | Create or overwrite a file |
| Edit File | Apply targeted edits to an existing file |
| Shell Command | Execute a shell command |
| Fetch URL | Fetch content from a URL as text |
| Parse Document | Parse document files into structured text |
| Cove Interpreter | Run JS in a sandboxed QuickJS interpreter |
| Settings | Read and modify application settings via chat |
| Recall | Search conversation archive by topic (internal, not user-visible) |
| Recall Detail | Retrieve original messages from a past conversation (internal, not user-visible) |

### Skill-bundled (available when parent skill is enabled)

| Tool | Skill | Description |
|------|-------|-------------|
| Office | OfficeLLM | Interact with office documents (DOCX/PPTX/XLSX) |
| Diagram | OfficeLLM | Render diagrams to images |
| Create Skill | skill-creator | Save a skill to user's Cove skill directory |

View all tools in Settings > Tools.

## @Mention

Type `@` in the chat input to trigger autocomplete. Three categories:

- **Tools** — e.g. `@tool:bash`. Guides the AI toward using a specific tool.
- **Skills** — e.g. `@skill:skill-creator`. Loads a skill's instructions.
- **Files** — e.g. `@file:src/main.ts`. Includes file content in the message.

`@` must appear at line start or after whitespace. Popover closes on space within the query.

## Skills

Modular capability packs. Each skill is a `SKILL.md` file with YAML frontmatter.

- Enable/disable in Settings > Skills
- Three sources: built-in (bundled in app), user (`~/.cove/skills/`), discovered (from other tools)
- `cove-core` core skill is always active (provides JS interpreter rules)
- Create custom skills by enabling `skill-creator` and asking the AI

## Settings

Open with `Cmd+,` or app menu.

| Tab | Content |
|-----|---------|
| Providers | API keys and endpoints |
| General | Language, default model |
| Skills | Browse, enable/disable, edit, delete skills |
| Tools | View available tools |
| Appearance | Theme (not yet implemented) |
| Workspaces | Manage workspace directories |

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Cmd+N` | New conversation |
| `Cmd+B` | Toggle left sidebar |
| `Cmd+,` | Open settings |
| `Cmd+/` | Open model selector |
| `Cmd+Shift+F` | Search messages |

## Workspace and File Panel

- Bind a directory as workspace in Settings > Workspaces
- Toggle file panel from toolbar to browse workspace files
- Supported preview: text, code, images, PDF, Markdown
- Files auto-refresh on external modification

## Attachments

Three methods to attach files:

1. Paste images or files into chat input
2. Drag and drop from Finder
3. Toolbar attachment button

Supported: images (PNG, JPG, GIF, WebP), PDF, text files, office documents (via Office tool).
