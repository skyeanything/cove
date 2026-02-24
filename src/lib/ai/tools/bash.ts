import { tool } from "ai";
import { z } from "zod/v4";
import { invoke } from "@tauri-apps/api/core";
import { useWorkspaceStore } from "@/stores/workspaceStore";
import { useDataStore } from "@/stores/dataStore";
import { usePermissionStore, getBashCommandPattern } from "@/stores/permissionStore";

const MAX_TIMEOUT_MS = 600_000;
const MAX_OUTPUT_CHARS = 30_000;
const HEAD_CHARS = 15_000;
const TAIL_CHARS = 15_000;

/** safe：只读/构建类，直接执行 */
const SAFE_PREFIXES = [
  "ls ", "ls\n", "cat ", "head ", "tail ", "wc ",
  "git status", "git log", "git diff", "git show",
  "npm test", "npm run", "pnpm ", "pnpm test", "pnpm run",
  "cargo build", "cargo test", "python -c", "node -e",
  "officellm ",
];

/** block：拒绝执行 */
const BLOCK_PREFIXES = ["nc ", "telnet ", "nc\n", "telnet\n", "rm -rf /", "mkfs.", "dd if="];

function getBashLevel(cmd: string): "safe" | "confirm" | "block" {
  const t = cmd.trim().toLowerCase();
  if (BLOCK_PREFIXES.some((p) => t.startsWith(p.toLowerCase()))) return "block";
  if (SAFE_PREFIXES.some((p) => t.startsWith(p.toLowerCase()))) return "safe";
  return "confirm"; // curl, wget, npm install 等需确认
}

function isBlocked(cmd: string): boolean {
  return getBashLevel(cmd) === "block";
}

function isSafe(cmd: string): boolean {
  return getBashLevel(cmd) === "safe";
}

function truncateOutput(text: string): string {
  const total = text.length;
  if (total <= MAX_OUTPUT_CHARS) return text;
  const head = text.slice(0, HEAD_CHARS);
  const tail = text.slice(total - TAIL_CHARS);
  const omitted = total - HEAD_CHARS - TAIL_CHARS;
  return `${head}\n\n[... ${omitted} chars omitted ...]\n\n${tail}`;
}

interface RunCommandResult {
  stdout: string;
  stderr: string;
  exitCode: number;
  timedOut: boolean;
}

export const bashTool = tool({
  description:
    "Run a shell command in the workspace directory. Read-only commands (e.g. git status, ls, cargo build) run without confirmation; other commands may require user approval. Timeout 120s default, max 600s.",
  inputSchema: z.object({
    command: z.string().describe("Shell command to run"),
    timeout: z.number().optional().describe("Timeout in seconds (default 120, max 600)"),
    description: z.string().optional().describe("Short description of what this command does"),
  }),
  execute: async ({ command, timeout }) => {
    const activeWorkspace = useWorkspaceStore.getState().activeWorkspace;
    if (!activeWorkspace) {
      return "请先在输入框上方选择工作区目录，再使用 bash 工具。";
    }
    const workspaceRoot = activeWorkspace.path;

    if (isBlocked(command)) {
      return "该命令被拒绝执行（安全策略）。不允许的指令：nc, telnet, rm -rf / 等危险操作。";
    }

    if (!isSafe(command)) {
      const conversationId = useDataStore.getState().activeConversationId ?? "";
      const pattern = getBashCommandPattern(command);
      const allowed = await usePermissionStore.getState().ask(
        conversationId,
        "bash",
        command,
        { bashPattern: pattern },
      );
      if (!allowed) return "用户拒绝了命令执行。";
    }

    const timeoutMs = Math.min(
      (timeout ?? 120) * 1000,
      MAX_TIMEOUT_MS,
    );

    try {
      const result = await invoke<RunCommandResult>("run_command", {
        args: {
          workspaceRoot,
          command,
          workdir: undefined,
          timeoutMs,
        },
      });
      const out = result.stdout + (result.stderr ? `\n[stderr]\n${result.stderr}` : "");
      const truncated = truncateOutput(out);
      const header = [
        result.timedOut ? "[命令已超时终止]" : "",
        `exit code: ${result.exitCode}`,
      ]
        .filter(Boolean)
        .join(" ");
      return header ? `${header}\n\n${truncated}` : truncated;
    } catch (err) {
      return `执行失败：${err instanceof Error ? err.message : String(err)}`;
    }
  },
});
