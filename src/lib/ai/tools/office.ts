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

interface SessionInfo {
  documentPath: string;
  pid: number;
  uptimeSecs: number;
}

export const officeTool = tool({
  description:
    "Operate on Office documents (DOCX/PPTX/XLSX) via officellm. Actions: detect (check if installed), doctor (check external dependency status — libreoffice, pdftoppm, quarto), open (start session for a document), call (execute a command on the open document), save (save the document), close (end session), status (query session info).",
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
      .array(z.string())
      .optional()
      .describe("CLI-style arguments for 'call', e.g. ['--limit', '50', '--page', '2']. For CLI mode without an open session, include '--input' and the file path."),
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
            return `Error running doctor: ${result.error ?? "unknown"}`;
          }
          return JSON.stringify(result.data);
        }

        case "open": {
          if (!path) return "Error: 'path' is required for the 'open' action.";
          const workspaceRoot = useWorkspaceStore.getState().activeWorkspace?.path;
          const absPath =
            workspaceRoot && !path.startsWith("/")
              ? `${workspaceRoot}/${path}`
              : path;
          await invoke<void>("officellm_open", { path: absPath });
          return `Session opened for: ${absPath}`;
        }

        case "call": {
          if (!command) return "Error: 'command' is required for the 'call' action.";
          const result = await invoke<CommandResult>("officellm_call", {
            cmd: command,
            args: args ?? [],
          });
          if (result.status === "error") {
            return `Error: ${result.error ?? "unknown error"}`;
          }
          return JSON.stringify(result.data);
        }

        case "save": {
          const result = await invoke<CommandResult>("officellm_save", {
            path: path ?? null,
          });
          if (result.status === "error") {
            return `Error: ${result.error ?? "unknown error"}`;
          }
          return path ? `Document saved to: ${path}` : "Document saved.";
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
      return `Office tool error: ${err instanceof Error ? err.message : String(err)}`;
    }
  },
});
