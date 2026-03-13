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

interface CommandErrorDetail {
  code?: string | null;
  message?: string | null;
  suggestions?: string[];
  details?: unknown;
}

interface CommandResult {
  status: string;
  code?: string | null;
  message?: string | null;
  data: unknown;
  error?: string | null;
  errors?: CommandErrorDetail[];
  meta?: unknown;
  metrics?: unknown;
}

interface LuaExecutionResult {
  output: string;
  result: string;
  error: string | null;
  executionMs: number;
}

interface WrapperCommandSpec {
  description: string;
  usage: string;
  requiresWorkspace: boolean;
  args?: Array<{ name: string; required: boolean; description: string }>;
  notes?: string[];
}

const WRAPPER_COMMANDS: Record<string, WrapperCommandSpec> = {
  help: {
    description: "Show bundled office discovery guidance or inspect one command schema.",
    usage: 'office(command: "help", args?: { name: "<command>" })',
    requiresWorkspace: false,
    args: [{ name: "name", required: false, description: "Wrapper or OfficeLLM command name to inspect." }],
    notes: ["Use this before guessing a document command.", "Wrapper names are Cove-specific; document commands come from OfficeLLM."],
  },
  detect: {
    description: "Check whether the bundled office sidecar is available.",
    usage: 'office(command: "detect")',
    requiresWorkspace: false,
  },
  doctor: {
    description: "Run dependency diagnostics for the bundled office stack.",
    usage: 'office(command: "doctor")',
    requiresWorkspace: false,
  },
  "list-commands": {
    description: "List OfficeLLM document commands from the real runtime, optionally filtered by category.",
    usage: 'office(command: "list-commands", args?: { category: "Editing" })',
    requiresWorkspace: false,
    args: [{ name: "category", required: false, description: "Optional OfficeLLM category filter, e.g. Editing or Tables." }],
  },
  "get-command-schema": {
    description: "Fetch the real schema for one OfficeLLM document command.",
    usage: 'office(command: "get-command-schema", args: { name: "replace-text" })',
    requiresWorkspace: false,
    args: [{ name: "name", required: true, description: "OfficeLLM command name to inspect." }],
  },
  open: {
    description: "Open a workspace file and start a shared office session.",
    usage: 'office(command: "open", args: { path: "report.docx" })',
    requiresWorkspace: true,
    args: [{ name: "path", required: true, description: "Workspace-relative Office document path." }],
  },
  create: {
    description: "Create a new in-memory document session from markdown/html/template input.",
    usage: 'office(command: "create", args?: { markdown: "# Title" })',
    requiresWorkspace: true,
    args: [
      { name: "markdown", required: false, description: "Markdown source for a new document." },
      { name: "html", required: false, description: "HTML source for a new document." },
      { name: "template", required: false, description: "Workspace-relative template path." },
    ],
  },
  save: {
    description: "Save the active office session, optionally to a new workspace path.",
    usage: 'office(command: "save", args?: { path: "report-final.docx" })',
    requiresWorkspace: true,
    args: [{ name: "path", required: false, description: "Optional workspace-relative save-as path." }],
  },
  close: {
    description: "Close the active shared office session.",
    usage: 'office(command: "close")',
    requiresWorkspace: true,
  },
  status: {
    description: "Inspect the active shared office session.",
    usage: 'office(command: "status")',
    requiresWorkspace: true,
    notes: ["Run this before open if you are unsure whether another document is already active."],
  },
};

// These wrapper/discovery commands bypass Lua so they can work without an active workspace.
const NO_WORKSPACE_COMMANDS = new Set(["help", "detect", "doctor", "list-commands", "get-command-schema"]);

const COMMAND_NAME_MAPPINGS = [
  "read-document -> extract-text",
  "insert-content -> insert",
  "convert-markdown -> from-markdown",
  "batch edit -> execute",
];

/** Escape a string for Lua string literal. */
function luaStr(s: string): string {
  return '"' + s.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, "\\n") + '"';
}

/** Build a Lua table literal from a Record<string, string>. */
function buildLuaTable(obj: Record<string, string>): string {
  const entries = Object.entries(obj).map(([k, v]) => `[${luaStr(k)}] = ${luaStr(v)}`);
  return "{" + entries.join(", ") + "}";
}

function formatWrapperCommand(name: string, spec: WrapperCommandSpec): string {
  return JSON.stringify({
    source: "cove-office-wrapper",
    name,
    description: spec.description,
    usage: spec.usage,
    requiresWorkspace: spec.requiresWorkspace,
    args: spec.args ?? [],
    notes: spec.notes ?? [],
  });
}

function formatOfficeHelp(): string {
  return [
    "Bundled office command discovery",
    "",
    `Wrapper commands: ${Object.keys(WRAPPER_COMMANDS).join(", ")}`,
    "",
    "Discover document commands before executing them:",
    '- office(command: "help")',
    '- office(command: "list-commands")',
    '- office(command: "list-commands", args: { category: "Editing" })',
    '- office(command: "get-command-schema", args: { name: "replace-text" })',
    '- office(command: "help", args: { name: "save" })',
    "",
    "Common naming differences:",
    ...COMMAND_NAME_MAPPINGS.map((mapping) => `- ${mapping}`),
  ].join("\n");
}

function formatResultObject(result: CommandResult): string {
  return JSON.stringify({
    status: result.status,
    code: result.code ?? null,
    message: result.message ?? null,
    error: result.error ?? null,
    errors: result.errors ?? [],
    data: result.data ?? null,
    meta: result.meta ?? null,
    metrics: result.metrics ?? null,
  });
}

function formatCommandResult(command: string, result: CommandResult): string {
  if (command === "status" && result.status === "success" && (result.data === null || result.data === undefined)) {
    return "No active document session.";
  }

  if (result.status !== "success") {
    return formatResultObject(result);
  }

  if (command === "save" && typeof result.data === "string") {
    return `Document saved to: ${result.data}`;
  }

  if (result.data !== undefined && result.data !== null) {
    return typeof result.data === "string" ? result.data : JSON.stringify(result.data);
  }

  return `${command}: ${result.status || "done"}`;
}

function formatRawOfficellmOutput(command: string, raw: string): string {
  try {
    return formatCommandResult(command, JSON.parse(raw) as CommandResult);
  } catch {
    return raw || `${command}: done`;
  }
}

function commandNameFromArgs(args?: Record<string, string>): string | undefined {
  return args?.name ?? args?.command;
}

async function invokeDiscoveryCommand(command: string, args?: Record<string, string>): Promise<string> {
  if (command === "help") {
    const name = commandNameFromArgs(args);
    if (!name) return formatOfficeHelp();
    const wrapper = WRAPPER_COMMANDS[name];
    if (wrapper) return formatWrapperCommand(name, wrapper);
    const result = await invoke<CommandResult>("officellm_get_command_schema", { command: name });
    return formatCommandResult("get-command-schema", result);
  }

  if (command === "list-commands") {
    const result = await invoke<CommandResult>("officellm_list_commands", { category: args?.category });
    return formatCommandResult(command, result);
  }

  if (command === "get-command-schema") {
    const name = commandNameFromArgs(args);
    if (!name) {
      return 'Error: get-command-schema requires args.name';
    }
    const result = await invoke<CommandResult>("officellm_get_command_schema", { command: name });
    return formatCommandResult(command, result);
  }

  throw new Error(`unsupported discovery command: ${command}`);
}

export const officeTool = tool({
  description:
    "Operate on Office documents (DOCX/PPTX/XLSX). Pass command + args. " +
    "Use command='help' before guessing a document command.",
  inputSchema: z.object({
    command: z
      .string()
      .describe(
        "office wrapper or OfficeLLM command: help, detect, doctor, list-commands, get-command-schema, open, create, save, close, status, or a document command",
      ),
    args: z
      .record(z.string(), z.string())
      .optional()
      .describe("Command arguments as key-value pairs, e.g. {path: 'doc.docx'}"),
  }),
  execute: async ({ command, args }) => {
    if (command === "detect") {
      try {
        const result = await invoke<DetectResult>("officellm_detect");
        if (!result.available) return "Office tool is not installed.";
        return `Office tool available: version=${result.version}, path=${result.path}, bundled=${result.bundled}`;
      } catch (err) {
        return `detect failed: ${err instanceof Error ? err.message : String(err)}`;
      }
    }

    if (command === "doctor") {
      try {
        const result = await invoke<CommandResult>("officellm_doctor");
        return formatCommandResult(command, result);
      } catch (err) {
        return `doctor failed: ${err instanceof Error ? err.message : String(err)}`;
      }
    }

    if (NO_WORKSPACE_COMMANDS.has(command)) {
      try {
        return await invokeDiscoveryCommand(command, args);
      } catch (err) {
        return `office error: ${err instanceof Error ? err.message : String(err)}`;
      }
    }

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
      return formatRawOfficellmOutput(command, result.output.trim());
    } catch (err) {
      return `office error: ${err instanceof Error ? err.message : String(err)}`;
    }
  },
});
