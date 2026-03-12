import { tool } from "ai";
import { z } from "zod/v4";
import { invoke } from "@tauri-apps/api/core";
import { useWorkspaceStore } from "@/stores/workspaceStore";

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

interface LuaExecutionResult {
  output: string;
  result: string;
  error: string | null;
  executionMs: number;
}

/** Escape a string for Lua string literal. */
function luaStr(s: string): string {
  return '"' + s.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, "\\n") + '"';
}

/** Build a Lua table literal from a Record<string, string>. */
function buildLuaTable(obj: Record<string, string>): string {
  const entries = Object.entries(obj).map(([k, v]) => `[${luaStr(k)}] = ${luaStr(v)}`);
  return "{" + entries.join(", ") + "}";
}

/** Parse the JSON output from workspace.officellm() and format for agent. */
function formatOfficellmOutput(command: string, raw: string): string {
  try {
    const parsed = JSON.parse(raw) as { status?: string; data?: unknown; error?: string };
    if (parsed.status === "error") {
      return `Error: ${parsed.error ?? "unknown error"}`;
    }
    // status with null data means no active session
    if (command === "status" && (parsed.data === null || parsed.data === undefined)) {
      return "No active document session.";
    }
    if (parsed.data !== undefined && parsed.data !== null) {
      // save: wrap path so UI can extract file chips
      if (command === "save" && typeof parsed.data === "string") {
        return `Document saved to: ${parsed.data}`;
      }
      return typeof parsed.data === "string" ? parsed.data : JSON.stringify(parsed.data);
    }
    return `${command}: success`;
  } catch {
    return raw || `${command}: done`;
  }
}

export const officeTool = tool({
  description:
    "Operate on Office documents (DOCX/PPTX/XLSX). Pass command + args. " +
    "Load OfficeLLM skill first for command reference.",
  inputSchema: z.object({
    command: z
      .string()
      .describe(
        "officellm command: open, create, close, save, status, detect, doctor, or any document command",
      ),
    args: z
      .record(z.string(), z.string())
      .optional()
      .describe("Command arguments as key-value pairs, e.g. {path: 'doc.docx'}"),
  }),
  execute: async ({ command, args }) => {
    // detect: Rust-only binary check, no workspace needed
    if (command === "detect") {
      try {
        const result = await invoke<DetectResult>("officellm_detect");
        if (!result.available) return "Office tool is not installed.";
        return `Office tool available: version=${result.version}, path=${result.path}, bundled=${result.bundled}`;
      } catch (err) {
        return `detect failed: ${err instanceof Error ? err.message : String(err)}`;
      }
    }

    // doctor: special Tauri IPC with home-path injection
    if (command === "doctor") {
      try {
        const result = await invoke<CommandResult>("officellm_doctor");
        if (result.status === "error") {
          return `Error: ${result.error ?? "unknown"}`;
        }
        return JSON.stringify(result.data);
      } catch (err) {
        return `doctor failed: ${err instanceof Error ? err.message : String(err)}`;
      }
    }

    // All other commands: execute via Lua sandbox
    const activeWorkspace = useWorkspaceStore.getState().activeWorkspace;
    if (!activeWorkspace) {
      return "Error: select a workspace directory first.";
    }

    const luaArgs = buildLuaTable(args ?? {});
    const code = `print(workspace.officellm(${luaStr(command)}, ${luaArgs}))`;

    try {
      const result = await invoke<LuaExecutionResult>("run_lua", {
        args: { workspaceRoot: activeWorkspace.path, code, timeoutMs: 30_000 },
      });
      if (result.error) return `Error: ${result.error}`;
      // For save: compute the absolute path directly from args + workspaceRoot.
      // This is reliable regardless of what OfficeLLM returns in its response,
      // because Rust resolves the same path via ensure_inside_workspace_may_not_exist.
      if (command === "save" && args?.path) {
        const p = args.path;
        const absPath = p.startsWith("/")
          ? p.replace(/\/+/g, "/")
          : `${activeWorkspace.path}/${p}`.replace(/\/+/g, "/");
        const fileName = absPath.split("/").pop() ?? p;
        return `已保存文档：[${fileName}](file://${absPath})\n完整路径：${absPath}`;
      }
      return formatOfficellmOutput(command, result.output.trim());
    } catch (err) {
      return `office error: ${err instanceof Error ? err.message : String(err)}`;
    }
  },
});
