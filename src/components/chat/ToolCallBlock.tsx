import { useState, memo } from "react";
import { useTranslation } from "react-i18next";
import {
  CircleCheck,
  CircleX,
  Circle,
  Clock,
  ChevronDown,
  ChevronRight,
  Shield,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { ToolCallInfo } from "@/stores/chatStore";
import { usePermissionStore } from "@/stores/permissionStore";
import type { PendingPermission } from "@/stores/permissionStore";
import { ResultContent } from "./tool-call/ResultContent";
import { ToolCallArgsDisplay } from "./tool-call/ArgsDisplay";
import {
  ToolCallIcon,
  getToolHeaderSummary,
  isBashSandboxed,
  isToolResultRejected,
  formatDuration,
  DURATION_THRESHOLD_MS,
} from "./tool-call/utils";

// Re-export for backward compatibility (tests import from this file)
export { ResultContent } from "./tool-call/ResultContent";
export { ToolCallArgsDisplay, StreamRevealText } from "./tool-call/ArgsDisplay";
export {
  BASH_HIGHLIGHT_THEME,
  DURATION_THRESHOLD_MS,
  REJECTED_PREFIXES,
  TOOL_ICON_MAP,
  ToolCallIcon,
  extractDiffLines,
  getToolHeaderSummary,
  isBashSandboxed,
  isToolResultRejected,
} from "./tool-call/utils";

/** Get path/command from tool args for permission matching */
function getPathOrCommand(toolName: string, args: Record<string, unknown>): string | undefined {
  if (toolName === "write" || toolName === "edit") return args.filePath as string | undefined;
  if (toolName === "bash") return args.command as string | undefined;
  return undefined;
}

function isToolCallPending(toolCall: ToolCallInfo, pendingAsk: PendingPermission | null): boolean {
  if (!pendingAsk) return false;
  if (pendingAsk.operation !== toolCall.toolName) return false;
  const pathOrCmd = getPathOrCommand(toolCall.toolName, toolCall.args ?? {});
  return pathOrCmd !== undefined && pendingAsk.pathOrCommand === pathOrCmd;
}

export const ToolCallBlock = memo(function ToolCallBlock({ toolCall, pendingAsk }: { toolCall: ToolCallInfo; pendingAsk: PendingPermission | null }) {
  const [open, setOpen] = useState(false);
  const { t } = useTranslation();
  const respond = usePermissionStore((s) => s.respond);
  const toolDisplayName = (typeof toolCall.toolName === "string" ? toolCall.toolName : "tool").replace(/_/g, " ");
  const toolSummary = getToolHeaderSummary(toolCall.toolName, toolCall.args);
  const showPermissionBar = toolCall.isLoading && isToolCallPending(toolCall, pendingAsk);
  const isDone = !toolCall.isLoading && toolCall.result !== undefined;
  const isRejected = isDone && isToolResultRejected(toolCall.result);
  const showDuration = isDone && !isRejected && (toolCall.durationMs ?? 0) >= DURATION_THRESHOLD_MS;

  return (
    <div className="w-full max-w-2xl rounded-[4px] border border-border overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="flex min-h-10 w-full items-center gap-2 px-3 py-2 text-[13px] hover:bg-background-tertiary/50 transition-colors"
      >
        <ToolCallIcon toolName={toolCall.toolName} />
        <span className="text-[13px] leading-none font-semibold capitalize">{toolDisplayName}</span>
        {isDone && toolCall.toolName === "bash" && isBashSandboxed(toolCall.result) && (
          <Shield className="size-3 shrink-0 text-success" strokeWidth={1.5} />
        )}
        {toolSummary && (
          <span
            className="min-w-0 max-w-[420px] truncate text-[13px] leading-none font-normal text-foreground-secondary"
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => e.stopPropagation()}
          >
            {toolSummary}
          </span>
        )}
        <div className="flex-1 min-w-0" />
        {toolCall.isLoading ? (
          <span className="inline-flex items-center gap-1.5 rounded-md bg-muted px-2 py-0.5 text-[11px] font-medium text-foreground">
            <Circle className="size-3 shrink-0" strokeWidth={2} />
            {t("tool.pending")}
          </span>
        ) : isDone ? (
          <span className="inline-flex items-center gap-2">
            <span
              className={cn(
                "inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-[11px] font-medium",
                isRejected ? "bg-destructive/10 text-destructive" : "bg-muted text-foreground",
              )}
            >
              {isRejected ? (
                <CircleX className="size-3 shrink-0" strokeWidth={2} />
              ) : (
                <CircleCheck className="size-3 shrink-0 text-success" strokeWidth={2} />
              )}
              <span>{isRejected ? t("tool.rejected") : t("tool.completed")}</span>
            </span>
            {showDuration && toolCall.durationMs != null && (
              <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
                <Clock className="size-3 shrink-0" strokeWidth={1.5} />
                {formatDuration(toolCall.durationMs)}
              </span>
            )}
          </span>
        ) : null}
        {open ? (
          <ChevronDown className="size-3 text-muted-foreground transition-transform duration-200 ease-out" strokeWidth={1.5} />
        ) : (
          <ChevronRight className="size-3 text-muted-foreground transition-transform duration-200 ease-out" strokeWidth={1.5} />
        )}
      </button>
      <div
        className="grid transition-[grid-template-rows] duration-300 ease-out overflow-hidden"
        style={{ gridTemplateRows: open ? "1fr" : "0fr" }}
      >
        <div className="min-h-0 border-t border-border">
          <div className="px-3 py-2 text-[12px]">
            {toolCall.argsJsonStream !== undefined ? (
              <pre className="rounded bg-background-tertiary p-2 text-[11px] font-mono text-muted-foreground min-h-[2rem] whitespace-pre-wrap break-all overflow-x-auto">
                {toolCall.argsJsonStream || "\u00A0"}
              </pre>
            ) : (
              <div style={{ animation: "fade-in 0.4s ease-out" }}>
                {toolCall.toolName === "write" &&
                  toolCall.result === undefined &&
                  typeof toolCall.args?.content === "string" && (
                    <>
                      <div className="mb-1 text-[11px] font-medium uppercase text-foreground-secondary">{t("tool.contentToWrite")}</div>
                      <div className="mb-2 rounded bg-background-tertiary p-2 text-[11px] overflow-x-auto max-h-[240px] overflow-y-auto font-mono">
                        {toolCall.args.content.split("\n").map((line, i) => (
                          <div key={i} className="bg-success/15">
                            +{line || " "}
                          </div>
                        ))}
                      </div>
                    </>
                  )}
                <ToolCallArgsDisplay toolName={toolCall.toolName} args={toolCall.args ?? {}} />
                {toolCall.result !== undefined && (
                  <>
                    <div className="mb-1 text-[11px] font-medium text-foreground-secondary">{t("tool.result")}</div>
                    <ResultContent result={toolCall.result} toolName={toolCall.toolName} />
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
      {showPermissionBar && (
        <div className="px-2 pb-2">
          <div
            className="flex flex-col gap-0 max-w-[200px]"
            role="radiogroup"
            aria-label={t("permission.title")}
          >
            <span className="mb-1.5 px-1 text-[11px] font-medium text-muted-foreground uppercase tracking-wide">
              {t("permission.title")}
            </span>
            {(
              [
                { value: "deny" as const, label: t("permission.deny") },
                { value: "allow" as const, label: t("permission.allow") },
                { value: "always_allow" as const, label: t("permission.alwaysAllow") },
              ] as const
            ).map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => respond(opt.value)}
                className={cn(
                  "flex items-center gap-2 rounded-lg px-2 py-1 text-left text-[11px] transition-colors duration-150 ease-out cursor-pointer",
                  opt.value === "deny" &&
                    "text-muted-foreground hover:bg-background-tertiary/60 hover:text-foreground",
                  opt.value === "allow" &&
                    "text-muted-foreground hover:bg-background-tertiary/60 hover:text-foreground",
                  opt.value === "always_allow" &&
                    "text-brand font-medium hover:bg-brand-muted/50",
                )}
              >
                <span
                  className={cn(
                    "size-3 shrink-0 rounded-full border-2 transition-colors duration-150",
                    opt.value === "always_allow"
                      ? "border-brand bg-brand"
                      : "border-border bg-background",
                  )}
                  aria-hidden
                />
                <span>{opt.label}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
});
