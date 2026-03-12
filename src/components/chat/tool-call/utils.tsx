import React from "react";
import {
  Wrench,
  SquareTerminal,
  FileDiff,
  FileSearch,
  FilePenLine,
  Code,
} from "lucide-react";
import { FilePathChip } from "@/components/common/FilePathChip";

/** Prism theme for bash syntax highlighting in tool call display */
export const BASH_HIGHLIGHT_THEME = {
  plain: {
    color: "#9ca3af",
    backgroundColor: "transparent",
  },
  styles: [
    {
      types: ["comment"],
      style: { color: "#9ca3af" },
    },
    {
      types: ["keyword", "builtin", "function"],
      style: { color: "#2563eb", fontWeight: "600" as const },
    },
    {
      types: ["string", "attr-value", "char"],
      style: { color: "#15803d" },
    },
    {
      types: ["operator", "punctuation"],
      style: { color: "#8b95a7" },
    },
    {
      types: ["number", "boolean", "constant"],
      style: { color: "#7c3aed" },
    },
  ],
};

/** Duration threshold in ms — only show timing above this */
export const DURATION_THRESHOLD_MS = 1000;

/** Tool result prefixes indicating user rejection (not executed) */
export const REJECTED_PREFIXES = [
  "用户拒绝了",
  "该命令被拒绝执行",
  "该工具执行被拒绝",
  "tool execution denied",
  "this skill is not enabled",
];

/** Map tool names to lucide icons */
export const TOOL_ICON_MAP: Record<string, typeof Wrench> = {
  bash: SquareTerminal,
  edit: FileDiff,
  read: FileSearch,
  write: FilePenLine,
  cove_interpreter: Code,
};

export function ToolCallIcon({ toolName }: { toolName: string }) {
  const Icon = TOOL_ICON_MAP[toolName] ?? Wrench;
  return <Icon className="size-3.5 shrink-0 text-muted-foreground" strokeWidth={1.5} />;
}

/** Header summary: lets user see at a glance what the tool is working on */
export function getToolHeaderSummary(
  toolName: string,
  args: Record<string, unknown> | undefined,
): React.ReactNode | null {
  if (!args) return null;
  if (toolName === "bash") {
    const desc = args.description;
    return typeof desc === "string" && desc.trim() ? desc.trim() : null;
  }
  if (toolName === "read" || toolName === "edit" || toolName === "write") {
    const path = args.filePath;
    if (typeof path === "string" && path.trim()) {
      return <FilePathChip path={path.trim()} compact />;
    }
    return null;
  }
  if (toolName === "cove_interpreter") {
    const desc = args.description;
    return typeof desc === "string" && desc.trim() ? desc.trim() : null;
  }
  return null;
}

/** Check if bash result contains the sandboxed marker */
export function isBashSandboxed(result: unknown): boolean {
  return typeof result === "string" && result.startsWith("[sandboxed]");
}

/** Check if tool result indicates user rejection */
export function isToolResultRejected(result: unknown): boolean {
  if (typeof result !== "string") return false;
  const s = result.toLowerCase();
  return REJECTED_PREFIXES.some((p) => s.startsWith(p.toLowerCase()));
}

/** Extract diff marker and split into intro + diff lines */
export function extractDiffLines(text: string): { intro: string; diffLines: string[] } | null {
  const idx = text.indexOf("--- Diff ---");
  if (idx === -1) return null;
  const intro = text.slice(0, idx).trim();
  const after = text.slice(idx + "--- Diff ---".length).trimStart();
  const diffLines = after.split("\n");
  return { intro, diffLines };
}

export function formatDuration(ms: number): string {
  if (ms >= 1000) return `${(ms / 1000).toFixed(1)} s`;
  return `${ms} ms`;
}
