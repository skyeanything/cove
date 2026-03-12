import { tool } from "ai";
import { z } from "zod/v4";
import { invoke } from "@tauri-apps/api/core";
import { useWorkspaceStore } from "@/stores/workspaceStore";

interface LuaExecutionResult {
  output: string;
  result: string;
  error: string | null;
  executionMs: number;
}

export const interpreterTool = tool({
  description:
    "Execute Lua code in sandboxed interpreter. For computation, data processing, multi-step logic. " +
    "Has workspace.* file APIs. No network. See cove-core skill for API reference.",
  inputSchema: z.object({
    code: z.string().optional().describe("Lua code to execute"),
    file: z
      .string()
      .optional()
      .describe("Path to a .lua file in the workspace to execute (mutually exclusive with code)"),
    description: z
      .string()
      .optional()
      .describe("Short description of what this code does"),
    timeout: z
      .number()
      .optional()
      .describe("Timeout in seconds (default 30, max 60)"),
  }),
  execute: async ({ code, file, timeout }) => {
    if (!code && !file) {
      return "Either 'code' or 'file' must be provided.";
    }
    if (code && file) {
      return "'code' and 'file' are mutually exclusive. Provide only one.";
    }
    const activeWorkspace = useWorkspaceStore.getState().activeWorkspace;
    if (!activeWorkspace) {
      return "Please select a workspace directory above the input box before using cove_interpreter.";
    }
    const workspaceRoot = activeWorkspace.path;
    const timeoutMs = Math.min((timeout ?? 30) * 1000, 60_000);

    try {
      const result = await invoke<LuaExecutionResult>("run_lua", {
        args: { workspaceRoot, code: code ?? null, file: file ?? null, timeoutMs },
      });

      const parts: string[] = [];
      if (result.output) parts.push(result.output);
      if (result.result && result.result !== "nil") {
        parts.push(`-> ${result.result}`);
      }
      if (result.error) parts.push(`[error] ${result.error}`);
      parts.push(`(${result.executionMs}ms)`);
      return parts.join("\n");
    } catch (err) {
      return `Execution failed: ${err instanceof Error ? err.message : String(err)}`;
    }
  },
});
