import { tool } from "ai";
import { z } from "zod/v4";
import { invoke } from "@tauri-apps/api/core";
import { useWorkspaceStore } from "@/stores/workspaceStore";
import { enhanceOfficeError } from "./office-errors";

interface DetectResult {
  available: boolean;
  version: string | null;
  path: string | null;
  bundled: boolean;
}

interface CommandResult {
  status: string;
  data: unknown;
  error: string | null;
  metrics: unknown;
}

interface SessionInfo {
  documentPath: string;
  pid: number;
  uptimeSecs: number;
}

/** Convert args (object or array) to CLI-style string[] for Rust IPC. */
function toCliArgs(args?: Record<string, string> | string[]): string[] {
  if (!args) return [];
  if (Array.isArray(args)) return args;
  return Object.entries(args).flatMap(([k, v]) => [
    k.length === 1 ? `-${k}` : `--${k}`,
    v,
  ]);
}

/** Check if a path is absolute (Unix / or Windows drive letter / UNC). */
function isAbsolutePath(p: string): boolean {
  return p.startsWith("/") || /^[A-Za-z]:[\\/]/.test(p) || p.startsWith("\\\\");
}

/** Known arg keys that hold file paths (mirrors js_interpreter.rs logic). */
const PATH_ARG_KEYS = new Set([
  "i", "input", "path", "o", "output", "from", "to", "base", "target",
]);

/** Resolve relative file-path args to absolute using workspace root. */
function resolvePathArgs(
  args: Record<string, string> | string[] | undefined,
  workspaceRoot: string | undefined,
): Record<string, string> | string[] | undefined {
  if (!args || !workspaceRoot) return args;
  if (Array.isArray(args)) return args;
  const resolved = { ...args };
  for (const [k, v] of Object.entries(resolved)) {
    if (PATH_ARG_KEYS.has(k) && v && !isAbsolutePath(v)) {
      resolved[k] = `${workspaceRoot}/${v}`;
    }
  }
  return resolved;
}

export const officeTool = tool({
  description:
    "Operate on Office documents (DOCX/PPTX/XLSX) via officellm. Actions: detect (check if installed), doctor (check external dependency status), open (start session for a document), call (execute a command), save (save the document), close (end session), status (query session info). IMPORTANT: Before using 'call', load the OfficeLLM skill via the skill tool to get correct command names and parameters. Pass args as key-value object, e.g. {title: 'New Slide', position: '2'}.",
  inputSchema: z.object({
    action: z
      .enum(["detect", "doctor", "open", "call", "save", "close", "status"])
      .describe("The office action to perform"),
    path: z
      .string()
      .optional()
      .describe("Document path (required for 'open'; optional for 'save' to save-as)"),
    command: z
      .string()
      .optional()
      .describe("Command name (required for 'call', e.g. 'addSlide', 'setText')"),
    args: z
      .union([
        z.record(z.string(), z.string()),
        z.array(z.string()),
      ])
      .optional()
      .describe(
        "Command arguments as key-value object (preferred), e.g. {title: 'New Slide', position: '2'}. Legacy CLI-style array also accepted.",
      ),
  }),
  execute: async ({ action, path, command, args }) => {
    try {
      switch (action) {
        case "detect": {
          const result = await invoke<DetectResult>("officellm_detect");
          if (!result.available) return "Office tool is not installed.";
          return `Office tool available: version=${result.version}, path=${result.path}, bundled=${result.bundled}`;
        }

        case "doctor": {
          const result = await invoke<CommandResult>("officellm_doctor");
          if (result.status === "error") {
            const raw = result.error ?? "unknown";
            return `Error running doctor: ${enhanceOfficeError("doctor", undefined, raw)}`;
          }
          return JSON.stringify(result.data);
        }

        case "open": {
          if (!path) return "Error: 'path' is required for the 'open' action.";
          // Pre-check: reject if session already active
          const existing = await invoke<SessionInfo | null>("officellm_status");
          if (existing) {
            return `Error: A session is already active for '${existing.documentPath}' (pid=${existing.pid}, uptime=${existing.uptimeSecs}s). Call action:'close' first, then action:'open' the new document.`;
          }
          const workspaceRoot = useWorkspaceStore.getState().activeWorkspace?.path;
          const absPath =
            workspaceRoot && !isAbsolutePath(path)
              ? `${workspaceRoot}/${path}`
              : path;
          await invoke<void>("officellm_open", { path: absPath });
          return `Session opened for: ${absPath}`;
        }

        case "call": {
          if (!command) return "Error: 'command' is required for the 'call' action.";
          const workspaceRoot = useWorkspaceStore.getState().activeWorkspace?.path;
          const resolvedArgs = resolvePathArgs(args, workspaceRoot);
          const result = await invoke<CommandResult>("officellm_call", {
            cmd: command,
            args: toCliArgs(resolvedArgs),
            workdir: workspaceRoot ?? "/",
          });
          if (result.status === "error") {
            const raw = result.error ?? "unknown error";
            return `Error: ${enhanceOfficeError("call", command, raw)}`;
          }
          return JSON.stringify(result.data);
        }

        case "save": {
          const workspaceRoot = useWorkspaceStore.getState().activeWorkspace?.path;
          const absPath =
            path && workspaceRoot && !isAbsolutePath(path)
              ? `${workspaceRoot}/${path}`
              : path;
          const result = await invoke<CommandResult>("officellm_save", {
            path: absPath ?? null,
          });
          if (result.status === "error") {
            return `Error: ${result.error ?? "unknown error"}`;
          }
          return absPath ? `Document saved to: ${absPath}` : "Document saved.";
        }

        case "close": {
          await invoke<void>("officellm_close");
          return "Session closed.";
        }

        case "status": {
          const info = await invoke<SessionInfo | null>("officellm_status");
          if (!info) return "No active office session.";
          return `Active session: document=${info.documentPath}, pid=${info.pid}, uptime=${info.uptimeSecs}s`;
        }
      }
    } catch (err) {
      const raw = err instanceof Error ? err.message : String(err);
      return `Office tool error: ${enhanceOfficeError("unknown", undefined, raw)}`;
    }
  },
});
