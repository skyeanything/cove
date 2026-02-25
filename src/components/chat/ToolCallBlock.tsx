// FILE_SIZE_EXCEPTION: ToolCallBlock is a complex component with many tightly coupled sub-components
import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import {
  Wrench,
  CircleCheck,
  CircleX,
  Circle,
  Clock,
  SquareTerminal,
  FileDiff,
  FileSearch,
  FilePenLine,
  ChevronDown,
  ChevronRight,
} from "lucide-react";
import Prism from "prismjs";
import { Highlight } from "prism-react-renderer";
import { cn } from "@/lib/utils";
import type { ToolCallInfo } from "@/stores/chatStore";
import { usePermissionStore } from "@/stores/permissionStore";
import type { PendingPermission } from "@/stores/permissionStore";

import "prismjs/components/prism-bash";

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

/** 耗时超过此值（毫秒）才在 UI 展示 */
export const DURATION_THRESHOLD_MS = 1000;

/** 工具返回结果是否表示用户拒绝（未执行）——仅匹配工具实际返回的拒绝前缀 */
export const REJECTED_PREFIXES = [
  "用户拒绝了",
  "该命令被拒绝执行",
  "this skill is not enabled",
];

/** 判断是否为 write/edit 返回的带 diff 的结果（含 --- Diff ---） */
export function extractDiffLines(text: string): { intro: string; diffLines: string[] } | null {
  const idx = text.indexOf("--- Diff ---");
  if (idx === -1) return null;
  const intro = text.slice(0, idx).trim();
  const after = text.slice(idx + "--- Diff ---".length).trimStart();
  const diffLines = after.split("\n");
  return { intro, diffLines };
}

/** 文件操作结果用 diff 样式渲染：+ 行绿底，- 行红底 */
export function ResultContent({ result, toolName }: { result: unknown; toolName?: string }) {
  const { t } = useTranslation();
  const resultTextColorClass = toolName === "bash" ? "text-foreground" : "text-foreground-secondary";
  if (toolName === "parse_document" && typeof result === "string") {
    try {
      const parsed = JSON.parse(result) as {
        attachmentId?: string;
        name?: string;
        path?: string;
        mode?: string;
        chunkCount?: number;
        truncated?: boolean;
        warnings?: string[];
        summary?: string;
      };
      const modeLabel =
        parsed.mode === "summary"
          ? "文档总结"
          : parsed.mode === "chunks"
            ? "分块读取"
            : "文档全文";
      return (
        <div className="space-y-1">
          <div className="rounded bg-background-tertiary/10 p-2 text-[11px] space-y-1">
            <div><span className="text-foreground-secondary">附件 ID：</span>{parsed.attachmentId ?? "—"}</div>
            <div><span className="text-foreground-secondary">文件名：</span>{parsed.name ?? "—"}</div>
            <div className="break-all"><span className="text-foreground-secondary">文件路径：</span>{parsed.path ?? "—"}</div>
            <div><span className="text-foreground-secondary">读取模式：</span>{modeLabel}</div>
            <div><span className="text-foreground-secondary">分块数量：</span>{parsed.chunkCount ?? 0}</div>
            <div><span className="text-foreground-secondary">是否截断：</span>{parsed.truncated ? "是" : "否"}</div>
            {parsed.warnings && parsed.warnings.length > 0 && (
              <div><span className="text-foreground-secondary">提示：</span>{parsed.warnings.join("；")}</div>
            )}
          </div>
          {parsed.summary && (
            <>
              <div className="text-[11px] font-medium text-foreground-secondary">摘要预览</div>
              <pre className="rounded bg-background-tertiary/50 p-2 text-[11px] overflow-x-auto max-h-[200px] overflow-y-auto whitespace-pre-wrap">
                {parsed.summary}
              </pre>
            </>
          )}
        </div>
      );
    } catch {
      // ignore and fallback
    }
  }
  if (typeof result !== "string") {
    return (
      <pre className={cn("rounded bg-background-tertiary/50 p-2 text-[11px] overflow-x-auto max-h-[300px] overflow-y-auto", resultTextColorClass)}>
        {JSON.stringify(result, null, 2)}
      </pre>
    );
  }
  const diff = extractDiffLines(result);
  if (!diff) {
    return (
      <pre
        className={cn(
          "rounded bg-background-tertiary/50 p-2 text-[11px] overflow-x-auto max-h-[300px] overflow-y-auto whitespace-pre-wrap",
          resultTextColorClass,
        )}
      >
        {result}
      </pre>
    );
  }
  return (
    <div className="space-y-1">
      {diff.intro && (
        <p className="text-[11px] text-muted-foreground mb-1">{diff.intro}</p>
      )}
      <div className="mb-1 text-[11px] font-medium uppercase text-foreground-secondary">{t("tool.content")}</div>
      <div
        className={cn(
          "rounded bg-background-tertiary/50 p-2 text-[11px] overflow-x-auto max-h-[300px] overflow-y-auto font-mono",
          resultTextColorClass,
        )}
      >
        {diff.diffLines.map((line, i) => {
          if (line.startsWith("+") && !line.startsWith("+++")) {
            return (
              <div key={i} className={cn("bg-success/15", resultTextColorClass)}>
                {line}
              </div>
            );
          }
          if (line.startsWith("-") && !line.startsWith("---")) {
            return (
              <div key={i} className={cn("bg-destructive/15", resultTextColorClass)}>
                {line}
              </div>
            );
          }
          return <div key={i}>{line}</div>;
        })}
      </div>
    </div>
  );
}

export function isToolResultRejected(result: unknown): boolean {
  if (typeof result !== "string") return false;
  const s = result.toLowerCase();
  return REJECTED_PREFIXES.some((p) => s.startsWith(p.toLowerCase()));
}

export const TOOL_ICON_MAP: Record<string, typeof Wrench> = {
  bash: SquareTerminal,
  edit: FileDiff,
  read: FileSearch,
  write: FilePenLine,
};

export function ToolCallIcon({ toolName }: { toolName: string }) {
  const Icon = TOOL_ICON_MAP[toolName] ?? Wrench;
  return <Icon className="size-3.5 shrink-0 text-muted-foreground" strokeWidth={1.5} />;
}

/** 标题栏摘要：让用户一眼知道工具正在处理什么 */
export function getToolHeaderSummary(toolName: string, args: Record<string, unknown> | undefined): string | null {
  if (!args) return null;
  if (toolName === "bash") {
    const desc = args.description;
    return typeof desc === "string" && desc.trim() ? desc.trim() : null;
  }
  if (toolName === "read" || toolName === "edit") {
    const path = args.filePath;
    return typeof path === "string" && path.trim() ? path.trim() : null;
  }
  return null;
}

/** 流式展示文本：按行逐行显示，模拟输出效果 */
export function StreamRevealText({ text, className = "" }: { text: string; className?: string }) {
  const lines = text.split("\n");
  const [visibleCount, setVisibleCount] = useState(0);

  useEffect(() => {
    if (visibleCount >= lines.length) return;
    const t = setInterval(() => {
      setVisibleCount((n) => Math.min(n + 1, lines.length));
    }, 56);
    return () => clearInterval(t);
  }, [visibleCount, lines.length]);

  const content = lines.slice(0, visibleCount).join("\n");
  return <pre className={className}>{content}</pre>;
}

/** 按工具类型定制展示 arguments，避免整块 JSON；streamReveal 时按行流式展示 */
export function ToolCallArgsDisplay({
  toolName,
  args,
  streamReveal,
}: {
  toolName: string;
  args: Record<string, unknown>;
  streamReveal?: boolean;
}) {
  const { t } = useTranslation();
  const preClass = "rounded bg-background-tertiary p-2 text-[11px] text-foreground-tertiary overflow-x-auto font-mono";
  const bashPreClass =
    "rounded bg-background-tertiary/50 px-3 py-2 text-[13px] leading-relaxed overflow-x-auto font-mono text-foreground-tertiary";
  const renderPre = (content: string, extraClass = "") =>
    streamReveal ? (
      <StreamRevealText text={content} className={cn(preClass, extraClass)} />
    ) : (
      <pre className={cn(preClass, extraClass)}>{content}</pre>
    );
  const renderBashCommand = (command: string) =>
    streamReveal ? (
      <StreamRevealText text={command} className={bashPreClass} />
    ) : (
      <div className={bashPreClass}>
        <Highlight prism={Prism} language="bash" code={command} theme={BASH_HIGHLIGHT_THEME}>
          {({ tokens, getLineProps, getTokenProps }) => (
            <span className="block whitespace-pre-wrap">
              {tokens.map((line, i) => (
                <span key={i} {...getLineProps({ line })} className="block">
                  {line.map((token, k) => (
                    <span key={k} {...getTokenProps({ token })} />
                  ))}
                </span>
              ))}
            </span>
          )}
        </Highlight>
      </div>
    );

  if (toolName === "parse_document") {
    const attachmentId = (args.attachmentId as string | undefined) ?? "—";
    const mode = (args.mode as string | undefined) ?? "full";
    const pageRange = args.pageRange as string | undefined;
    const maxBytes = args.maxBytes as number | undefined;
    const modeLabel =
      mode === "summary"
        ? "文档总结"
        : mode === "chunks"
          ? "分块读取"
          : "文档全文";
    return (
      <div className="mb-2 space-y-1">
        <div className="text-[11px] font-medium text-foreground-secondary">附件 ID</div>
        {renderPre(attachmentId)}
        <div className="text-[11px] font-medium text-foreground-secondary">读取模式</div>
        {renderPre(modeLabel)}
        {pageRange && (
          <>
            <div className="text-[11px] font-medium text-foreground-secondary">页码范围（仅 PDF）</div>
            {renderPre(pageRange)}
          </>
        )}
        {maxBytes != null && (
          <>
            <div className="text-[11px] font-medium text-foreground-secondary">最大读取字节</div>
            {renderPre(String(maxBytes))}
          </>
        )}
      </div>
    );
  }

  if (toolName === "bash") {
    const command = (args.command as string) ?? "—";
    return <div className="mb-2">{renderBashCommand(command)}</div>;
  }
  if (toolName === "read") {
    const filePath = args.filePath as string | undefined;
    const offset = args.offset as number | undefined;
    const limit = args.limit as number | undefined;
    const extra = [offset != null && `offset: ${offset}`, limit != null && `limit: ${limit}`].filter(Boolean).join(", ");
    const pathText = `${filePath ?? "—"}${extra ? ` (${extra})` : ""}`;
    return (
      <div className="mb-2 space-y-1">
        <div className="text-[11px] font-medium text-foreground-secondary">{t("tool.path")}</div>
        {streamReveal ? <StreamRevealText text={pathText} className={preClass} /> : <pre className={preClass}>{pathText}</pre>}
      </div>
    );
  }
  if (toolName === "write") return null;
  if (toolName === "edit") {
    const filePath = args.filePath as string | undefined;
    const oldString = args.oldString as string | undefined;
    const newString = args.newString as string | undefined;
    const snippet = (s: string, max = 80) => (s.length <= max ? s : s.slice(0, max) + "…");
    return (
      <div className="mb-2 space-y-1">
        <div className="text-[11px] font-medium text-foreground-secondary">{t("tool.path")}</div>
        {renderPre(filePath ?? "—")}
        {oldString != null && (
          <>
            <div className="mt-1 text-[11px] font-medium text-foreground-secondary">{t("tool.oldString")}</div>
            {renderPre(snippet(oldString), "whitespace-pre-wrap break-all")}
          </>
        )}
        {newString != null && (
          <>
            <div className="mt-1 text-[11px] font-medium text-foreground-secondary">{t("tool.newString")}</div>
            {renderPre(snippet(newString), "whitespace-pre-wrap break-all")}
          </>
        )}
      </div>
    );
  }
  const jsonText = JSON.stringify(args, null, 2);
  if (toolName === "skill") {
    return (
      <div className="mb-2">
        <div className="text-[11px] font-medium text-foreground-secondary mb-1">{t("tool.arguments")}</div>
        {streamReveal ? <StreamRevealText text={jsonText} className={preClass} /> : <pre className={preClass}>{jsonText}</pre>}
      </div>
    );
  }
  return (
    <div className="mb-2">
      <div className="text-[11px] font-medium text-foreground-secondary mb-1">{t("tool.arguments")}</div>
      {streamReveal ? <StreamRevealText text={jsonText} className={preClass} /> : <pre className={preClass}>{jsonText}</pre>}
    </div>
  );
}

function formatDuration(ms: number): string {
  if (ms >= 1000) return `${(ms / 1000).toFixed(1)} s`;
  return `${ms} ms`;
}

/** 从工具参数取待确认的路径/命令，用于与 pendingAsk 匹配 */
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

export function ToolCallBlock({ toolCall, pendingAsk }: { toolCall: ToolCallInfo; pendingAsk: PendingPermission | null }) {
  const [open, setOpen] = useState(true);
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
        {toolSummary && (
          <span className="min-w-0 max-w-[420px] truncate text-[13px] leading-none font-normal text-foreground-secondary">
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
            {/* 阶段一：参数流式到达时原样展示 JSON */}
            {toolCall.argsJsonStream !== undefined ? (
              <pre className="rounded bg-background-tertiary p-2 text-[11px] font-mono text-muted-foreground min-h-[2rem] whitespace-pre-wrap break-all overflow-x-auto">
                {toolCall.argsJsonStream || "\u00A0"}
              </pre>
            ) : (
              /* 阶段二：流式结束后过渡到格式化展示 */
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
}
