import { tool } from "ai";
import { z } from "zod/v4";
import { invoke } from "@tauri-apps/api/core";
import { useWorkspaceStore } from "@/stores/workspaceStore";

interface JsExecutionResult {
  output: string;
  result: string;
  error: string | null;
  executionMs: number;
}

export const jsInterpreterTool = tool({
  description:
    "Execute JavaScript in sandboxed QuickJS. For computation, data processing, multi-step logic. " +
    "Has workspace.* file APIs. No network. See cove-core skill for API reference.",
  inputSchema: z.object({
    code: z.string().describe("JavaScript code to execute"),
    description: z
      .string()
      .optional()
      .describe("Short description of what this code does"),
    timeout: z
      .number()
      .optional()
      .describe("Timeout in seconds (default 30, max 60)"),
  }),
  execute: async ({ code, timeout }) => {
    const activeWorkspace = useWorkspaceStore.getState().activeWorkspace;
    if (!activeWorkspace) {
      return "请先在输入框上方选择工作区目录，再使用 cove_interpreter 工具。";
    }
    const workspaceRoot = activeWorkspace.path;
    const timeoutMs = Math.min((timeout ?? 30) * 1000, 60_000);

    try {
      const result = await invoke<JsExecutionResult>("run_js", {
        args: { workspaceRoot, code, timeoutMs },
      });

      const parts: string[] = [];
      if (result.output) parts.push(result.output);
      if (result.result && result.result !== "undefined") {
        parts.push(`→ ${result.result}`);
      }
      if (result.error) parts.push(`[error] ${result.error}`);
      parts.push(`(${result.executionMs}ms)`);
      return parts.join("\n");
    } catch (err) {
      return `执行失败：${err instanceof Error ? err.message : String(err)}`;
    }
  },
});
