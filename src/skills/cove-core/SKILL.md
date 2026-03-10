---
name: cove-core
description: "Cove core capabilities: built-in JavaScript interpreter, file operations, and core tool usage guide."
emoji: "🏠"
always: true
---

## Tool priority

1. Dedicated tool first (read, write, edit, fetch_url, office, etc.)
2. `cove_interpreter` for computation, data processing, multi-step logic
3. `bash` for system interaction (git, npm, shell, network)

Do NOT wrap a single operation in cove_interpreter when a dedicated tool can do it.
Do NOT use bash for JSON parsing or math — use cove_interpreter.

## cove_interpreter APIs

`workspace.readFile(path)`, `writeFile`, `appendFile`, `listDir`, `exists`, `stat`, `copyFile`, `moveFile`, `remove`, `createDir`, `glob(pattern)`, `officellm(cmd, args)`. Also: `console.*`, `Math.*`, `JSON.*`, `Date`, `RegExp`.

No network, no `fetch/require/import/process/fs`. Memory 64MB, timeout 30s (max 60s). Workspace scope only.

## Before acting

- Read files before editing/overwriting
- Verify workspace is set before file operations
- Destructive operations require user confirmation
- Ambiguous intent: present options, don't guess
