# Server Mode Guide

> **Relationship**: This guide expands on [SKILL.md Section 6](../SKILL.md) (Programmatic Usage → Server Mode). For the full command index, see SKILL.md.

Server mode keeps an OfficeLLM process resident and documents loaded in memory, eliminating per-command startup and file-load overhead (~200 ms each). Use it when you need **4+ sequential commands on the same document**, or when managing **multiple documents concurrently**.

## When to Use CLI vs Server Mode

| Scenario | Recommended | Why |
|----------|-------------|-----|
| Single command | CLI | No overhead to amortize |
| 2–3 commands, same file | CLI | Simpler; overhead savings are small |
| 4+ commands, same file | **Server** | Saves ~200 ms × N calls |
| Multiple documents in parallel | **Server (multi-session)** | Each session holds one document independently |
| CI/CD pipeline | CLI | Stateless, easier to parallelize |

## Protocol

Server mode uses **JSON-RPC 2.0 over stdio** (newline-delimited JSON). The server reads requests from stdin and writes responses to its protocol output stream.

### Request format

```json
{"jsonrpc": "2.0", "id": 1, "method": "open", "params": {"path": "doc.docx"}}
```

### Response format

```json
{"jsonrpc": "2.0", "id": 1, "result": {"has_document": true, "file_path": "/abs/doc.docx", "file_size": 12345, "dirty": false}}
```

Error responses replace `result` with `error`:

```json
{"jsonrpc": "2.0", "id": 1, "error": {"code": -32000, "message": "No document is currently open."}}
```

## Multi-Session Support

Each server process can manage **multiple named sessions** simultaneously. Every session holds an independent document instance — operations on one session do not affect others.

| Scenario | Recommended approach |
|----------|---------------------|
| Edit multiple documents at once | One named session per document |
| Agent processes different chapters in parallel | Multiple sessions with concurrent `call` requests |
| Single-document sequential editing | Default session (omit `session_id`) |

**Default session**: If you omit `session_id` from any method, the request is routed to the `"default"` session. This is equivalent to the single-document behavior of older versions.

**Named sessions**: Supply any string as `session_id` to create or reuse a named session. Sessions are created implicitly on `open` and removed from tracking on `close`.

## Session Lifecycle

```
[No Document] ──open()──→ [Document Open] ──call()──→ [Modified]
      ↑                         │                          │
      └────────close()──────────┘           save()─────────┘
```

1. **Start server**: `officellm serve`
2. **Open** a document: `open(path, session_id?)` — loads into memory
3. **Call** commands: `call(command, args[], session_id?)` — executes against in-memory document
4. **Save** changes: `save(path?, session_id?)` — writes to disk
5. **Close** document: `close(session_id?)` — frees memory
6. **Shutdown** server: `shutdown()` — exits process (all sessions closed)

## Methods Reference

| Method | Parameters | Returns | Description |
|--------|-----------|---------|-------------|
| `open` | `path` (string, required), `session_id` (string, optional) | `SessionInfo` | Load document into session. |
| `call` | `command` (string), `args` (string[]), `session_id` (string, optional) | `CallResult` | Execute any CLI command on the session's document. |
| `save` | `path` (string, optional), `session_id` (string, optional) | `SessionInfo` | Write document to disk. Omit `path` to overwrite original. |
| `close` | `session_id` (string, optional) | `SessionInfo` | Release document from memory and remove session. |
| `status` | — | `{"sessions": {...}}` | Query all active sessions without side effects. |
| `shutdown` | — | `{"status": "ok"}` | Stop the server process (all sessions closed). |

### SessionInfo

```json
{
  "has_document": true,
  "file_path": "/absolute/path/to/doc.docx",
  "file_size": 12345,
  "dirty": true
}
```

### status Response

`status` returns the state of all active sessions:

```json
{
  "sessions": {
    "default": {
      "has_document": true,
      "file_path": "/path/to/default.docx",
      "file_size": 8192,
      "dirty": false
    },
    "doc1": {
      "has_document": true,
      "file_path": "/path/to/chapter1.docx",
      "file_size": 4096,
      "dirty": true
    }
  }
}
```

### CallResult

```json
{
  "exit_code": 0,
  "output": { "...command JSON output..." }
}
```

## Error Codes

| Code | Name | Cause |
|------|------|-------|
| -32700 | Parse error | Request is not valid JSON |
| -32600 | Invalid request | Missing `method` or `jsonrpc` != "2.0" |
| -32601 | Method not found | Unknown method name |
| -32602 | Invalid params | Required parameter missing or wrong type |
| -32603 | Internal error | Unhandled exception during execution |
| -32000 | No document / File not found | Command requires a document but none is open, or file path doesn't exist |
| -32001 | Document already open | Called `open` on a session that already has a document — `close` first |
| -32002 | Session not found | Referenced `session_id` does not exist or has been closed |

## Examples

### Python — Single Session

```python
import subprocess, json

proc = subprocess.Popen(
    ["officellm", "serve"],
    stdin=subprocess.PIPE, stdout=subprocess.PIPE, text=True
)

def rpc(method, params=None, req_id=1):
    req = {"jsonrpc": "2.0", "id": req_id, "method": method}
    if params:
        req["params"] = params
    proc.stdin.write(json.dumps(req) + "\n")
    proc.stdin.flush()
    resp = json.loads(proc.stdout.readline())
    if "error" in resp:
        raise RuntimeError(f"RPC error {resp['error']['code']}: {resp['error']['message']}")
    return resp["result"]

rpc("open", {"path": "report.docx"})
rpc("call", {"command": "replace-text", "args": ["--find", "2024", "--replace", "2025"]})
rpc("call", {"command": "replace-text", "args": ["--find", "Draft", "--replace", "Final"]})
rpc("call", {"command": "apply-format", "args": ["--xpath", "//w:p[1]", "--bold", "true"]})
rpc("save")
rpc("close")
rpc("shutdown")
proc.wait()
```

### Python — Multi-Session (Two Documents Concurrently)

```python
import subprocess, json

proc = subprocess.Popen(
    ["officellm", "serve"],
    stdin=subprocess.PIPE, stdout=subprocess.PIPE, text=True
)

_req_id = 0

def rpc(method, params=None):
    global _req_id
    _req_id += 1
    req = {"jsonrpc": "2.0", "id": _req_id, "method": method}
    if params:
        req["params"] = params
    proc.stdin.write(json.dumps(req) + "\n")
    proc.stdin.flush()
    resp = json.loads(proc.stdout.readline())
    if "error" in resp:
        raise RuntimeError(f"RPC error {resp['error']['code']}: {resp['error']['message']}")
    return resp["result"]

# Open two documents in separate sessions
rpc("open", {"path": "chapter1.docx", "session_id": "ch1"})
rpc("open", {"path": "chapter2.docx", "session_id": "ch2"})

# Edit each independently
rpc("call", {"command": "replace-text", "args": ["--find", "DRAFT", "--replace", "v1.0"], "session_id": "ch1"})
rpc("call", {"command": "replace-text", "args": ["--find", "DRAFT", "--replace", "v1.0"], "session_id": "ch2"})

# Check all session states
print(rpc("status"))

# Save and close each
rpc("save", {"session_id": "ch1"})
rpc("save", {"session_id": "ch2"})
rpc("close", {"session_id": "ch1"})
rpc("close", {"session_id": "ch2"})
rpc("shutdown")
proc.wait()
```

### Bash (using jq)

```bash
#!/bin/bash
FIFO_IN=$(mktemp -u)
mkfifo "$FIFO_IN"
officellm serve < "$FIFO_IN" &
SERVER_PID=$!
exec 3>"$FIFO_IN"

rpc() {
  echo "{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"$1\",\"params\":$2}" >&3
}

rpc "open" '{"path":"report.docx"}'
rpc "call" '{"command":"replace-text","args":["--find","2024","--replace","2025"]}'
rpc "save" '{}'
rpc "shutdown" '{}'
wait $SERVER_PID
rm "$FIFO_IN"
```

### Node.js — Single Session

```javascript
const { spawn } = require("child_process");
const readline = require("readline");

const proc = spawn("officellm", ["serve"], { stdio: ["pipe", "pipe", "inherit"] });
const rl = readline.createInterface({ input: proc.stdout });

function rpc(method, params = {}) {
  return new Promise((resolve, reject) => {
    rl.once("line", (line) => {
      const resp = JSON.parse(line);
      resp.error ? reject(new Error(resp.error.message)) : resolve(resp.result);
    });
    proc.stdin.write(JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }) + "\n");
  });
}

(async () => {
  await rpc("open", { path: "report.docx" });
  await rpc("call", { command: "replace-text", args: ["--find", "old", "--replace", "new"] });
  await rpc("save");
  await rpc("shutdown");
})();
```

### Node.js — Multi-Session

```javascript
// Reuse the rpc() helper from above

// Multi-session: two documents concurrently
(async () => {
  await rpc("open", { path: "doc1.docx", session_id: "s1" });
  await rpc("open", { path: "doc2.docx", session_id: "s2" });
  await rpc("call", { command: "replace-text", args: ["--find", "old", "--replace", "new"], session_id: "s1" });
  await rpc("call", { command: "replace-text", args: ["--find", "old", "--replace", "new"], session_id: "s2" });
  await rpc("save", { session_id: "s1" });
  await rpc("save", { session_id: "s2" });
  await rpc("shutdown");
})();
```

## Concurrency Notes

- **Single-threaded**: The server processes one request at a time, sequentially.
- **Multiple sessions**: Each session is independent — open, edit, and save multiple documents without closing between them.
- **No parallel requests**: Send a request, wait for the response, then send the next.
- **Default session**: Omitting `session_id` routes to `"default"`. Explicitly naming `"default"` and omitting it are equivalent.
- **Multiple server instances**: Each `officellm serve` process is independent. Running multiple instances is an alternative for true parallelism, though multi-session within one process is usually sufficient.
