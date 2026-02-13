import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Bot,
  Copy,
  RotateCcw,
  Pencil,
  ChevronDown,
  ChevronRight,
  Wrench,
  Check,
  X,
  CircleCheck,
  CircleX,
  Circle,
  Clock,
  SquareTerminal,
  FileDiff,
  FileSearch,
  FilePenLine,
  Brain,
  CircleGauge,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useEffect, useRef, useState, useCallback, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useChatStore } from "@/stores/chatStore";
import type { ToolCallInfo, MessagePart } from "@/stores/chatStore";
import { useTypewriter } from "@/hooks/useTypewriter";
import type { Message } from "@/db/types";
import { usePermissionStore } from "@/stores/permissionStore";
import type { PendingPermission } from "@/stores/permissionStore";
import { ProviderIcon } from "@/components/common/ProviderIcon";
import { cn, stripMarkdown } from "@/lib/utils";
import { Component, lazy, Suspense } from "react";
import { splitThinkBlocks } from "@/lib/splitThinkBlocks";

const MarkdownContent = lazy(() =>
  import("@/components/chat/MarkdownContent").then((m) => ({ default: m.MarkdownContent })),
);

/** Markdown 渲染出错时回退显示纯文本，避免白屏 */
class MarkdownErrorBoundary extends Component<
  { fallback: string; children: React.ReactNode },
  { hasError: boolean }
> {
  state = { hasError: false };
  static getDerivedStateFromError = () => ({ hasError: true });
  render() {
    if (this.state.hasError)
      return (
        <div className="text-[14px] leading-relaxed whitespace-pre-wrap">
          {this.props.fallback}
        </div>
      );
    return this.props.children;
  }
}

/** Truncate the last text part by `charDelta` characters to keep parts in sync with the typewriter. */
function truncateLastTextPart(parts: MessagePart[], charDelta: number): MessagePart[] {
  if (charDelta <= 0 || parts.length === 0) return parts;
  const result = [...parts];
  for (let i = result.length - 1; i >= 0; i--) {
    const part = result[i]!;
    if (part.type === "text" && part.text) {
      const newLen = Math.max(0, part.text.length - charDelta);
      if (newLen !== part.text.length) {
        result[i] = { ...part, text: part.text.slice(0, newLen) };
      }
      break;
    }
  }
  return result;
}

export function MessageList() {
  const scrollRef = useRef<HTMLDivElement>(null);
  const messages = useChatStore((s) => s.messages);
  const isStreaming = useChatStore((s) => s.isStreaming);
  const streamingContent = useChatStore((s) => s.streamingContent);
  const streamingReasoning = useChatStore((s) => s.streamingReasoning);
  const streamingToolCalls = useChatStore((s) => s.streamingToolCalls);
  const streamingParts = useChatStore((s) => s.streamingParts);

  // Smooth typewriter: reveals streaming text at a uniform rate
  const smoothedContent = useTypewriter(streamingContent, isStreaming);
  const charDelta = streamingContent.length - smoothedContent.length;
  const smoothedParts = useMemo(
    () => truncateLastTextPart(streamingParts, charDelta),
    [streamingParts, charDelta],
  );

  // 仅当用户已在底部附近时才自动滚到底部，避免上滑阅读时被拉回导致抖动
  const AUTO_SCROLL_THRESHOLD_PX = 120;
  useEffect(() => {
    const root = scrollRef.current;
    const viewport = root?.querySelector("[data-slot=scroll-area-viewport]") as HTMLElement | null;
    if (!viewport) return;
    const distanceFromBottom = viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight;
    if (distanceFromBottom <= AUTO_SCROLL_THRESHOLD_PX) {
      viewport.scrollTop = viewport.scrollHeight;
    }
  }, [messages, smoothedContent, streamingReasoning, streamingToolCalls, smoothedParts]);

  if (messages.length === 0 && !isStreaming) {
    return <EmptyState />;
  }

  return (
    <div ref={scrollRef} className="min-h-0 flex-1 overflow-hidden">
      <ScrollArea className="h-full">
        <div className="mx-auto max-w-[896px] px-4 py-6">
          {messages.map((msg) => (
            <MessageBubble key={msg.id} message={msg} />
          ))}
          {isStreaming && (
            <AssistantMessage
              content={smoothedContent}
              reasoning={streamingReasoning}
              toolCalls={streamingToolCalls}
              parts={smoothedParts}
              isStreaming
            />
          )}
        </div>
      </ScrollArea>
    </div>
  );
}

function MessageBubble({ message }: { message: Message }) {
  if (message.role === "user") {
    return <UserMessage messageId={message.id} content={message.content ?? ""} />;
  }
  if (message.role === "assistant") {
    let parts: MessagePart[] | undefined;
    let toolCalls: ToolCallInfo[] | undefined;
    if (message.parts) {
      try {
        const parsed = JSON.parse(message.parts) as unknown;
        if (Array.isArray(parsed) && parsed.length > 0 && isMessagePart(parsed[0])) {
          parts = parsed as MessagePart[];
        } else if (Array.isArray(parsed)) {
          toolCalls = parsed as ToolCallInfo[];
        }
      } catch {
        // ignore
      }
    }
    return (
      <AssistantMessage
        messageId={message.id}
        content={message.content ?? ""}
        reasoning={message.reasoning}
        toolCalls={toolCalls}
        parts={parts}
        tokensInput={message.tokens_input}
        tokensOutput={message.tokens_output}
      />
    );
  }
  return null;
}

const COPY_FEEDBACK_MS = 1500;

function UserMessage({ messageId, content }: { messageId: string; content: string }) {
  const [isEditing, setIsEditing] = useState(false);
  const [editContent, setEditContent] = useState(content);
  const [copied, setCopied] = useState(false);
  const editAndResend = useChatStore((s) => s.editAndResend);
  const isStreaming = useChatStore((s) => s.isStreaming);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(content).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), COPY_FEEDBACK_MS);
    });
  }, [content]);

  const handleEdit = useCallback(() => {
    setEditContent(content);
    setIsEditing(true);
  }, [content]);

  const handleCancel = useCallback(() => {
    setIsEditing(false);
    setEditContent(content);
  }, [content]);

  const handleConfirm = useCallback(() => {
    if (!editContent.trim() || isStreaming) return;
    setIsEditing(false);
    editAndResend(messageId, editContent.trim());
  }, [editContent, isStreaming, editAndResend, messageId]);

  // Auto-resize textarea and focus
  useEffect(() => {
    if (isEditing && textareaRef.current) {
      const ta = textareaRef.current;
      ta.focus();
      ta.style.height = "auto";
      ta.style.height = `${ta.scrollHeight}px`;
    }
  }, [isEditing, editContent]);

  if (isEditing) {
    return (
      <div className="mb-6 flex justify-end">
        <div className="max-w-[85%] w-full">
          <textarea
            ref={textareaRef}
            value={editContent}
            onChange={(e) => {
              setEditContent(e.target.value);
              e.target.style.height = "auto";
              e.target.style.height = `${e.target.scrollHeight}px`;
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                if (e.nativeEvent.isComposing) return;
                e.preventDefault();
                handleConfirm();
              } else if (e.key === "Escape") {
                handleCancel();
              }
            }}
            className="w-full resize-none rounded-[4px] bg-background-tertiary px-3 py-1.5 text-[14px] leading-relaxed outline-none ring-2 ring-accent"
            rows={1}
          />
          <div className="mt-1.5 flex justify-end gap-1">
            <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={handleCancel}>
              <X className="mr-1 size-3" strokeWidth={1.5} />
              Cancel
            </Button>
            <Button size="sm" className="h-7 px-2 text-xs" onClick={handleConfirm} disabled={!editContent.trim()}>
              <Check className="mr-1 size-3" strokeWidth={1.5} />
              Send
            </Button>
          </div>
        </div>
      </div>
    );
  }

  const [hovered, setHovered] = useState(false);
  return (
    <div
      className="mb-6 flex justify-end"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <div className="flex max-w-[85%] flex-col items-end">
        <div className="rounded-[4px] bg-background-tertiary px-3 py-1.5 text-[14px] leading-relaxed whitespace-pre-wrap">
          {content}
        </div>
        {/* 操作图标：仅悬停时渲染 DOM，避免 CSS 被覆盖导致不隐藏 */}
        <div className="mt-1 mb-2 min-h-8">
          {hovered && (
            <div className="flex gap-0.5">
              <ActionButton
                icon={<CopyFeedbackIcon copied={copied} iconClass="size-3" />}
                title={copied ? "" : "Copy"}
                onClick={handleCopy}
              />
              <ActionButton icon={<Pencil className="size-3" />} title="Edit" onClick={handleEdit} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/** 格式化 token 数：过千显示 1.2k */
function formatTokenCount(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(n);
}

function AssistantMessage({
  messageId,
  content,
  reasoning,
  toolCalls,
  parts: orderedParts,
  isStreaming: streaming,
  tokensInput,
  tokensOutput,
}: {
  messageId?: string;
  content: string;
  reasoning?: string;
  toolCalls?: ToolCallInfo[];
  parts?: MessagePart[];
  isStreaming?: boolean;
  tokensInput?: number;
  tokensOutput?: number;
}) {
  const { t } = useTranslation();
  const [reasoningOpen, setReasoningOpen] = useState(!!reasoning);
  const [thinkingLabelHover, setThinkingLabelHover] = useState(false);
  const [messageHovered, setMessageHovered] = useState(false);
  const [copiedWhich, setCopiedWhich] = useState<"plain" | "markdown" | null>(null);
  const regenerateMessage = useChatStore((s) => s.regenerateMessage);
  const isStreaming = useChatStore((s) => s.isStreaming);
  const showTokens = (tokensInput != null && tokensInput > 0) || (tokensOutput != null && tokensOutput > 0);

  const handleRegenerate = useCallback(() => {
    if (!messageId || isStreaming) return;
    regenerateMessage(messageId);
  }, [messageId, isStreaming, regenerateMessage]);

  const pendingAsk = usePermissionStore((s) => s.pendingAsk);

  // 每个 event 追加时给流式块加短暂动效类
  const [justAppended, setJustAppended] = useState(false);
  const prevContentLenRef = useRef(0);
  useEffect(() => {
    if (!streaming) {
      prevContentLenRef.current = 0;
      return;
    }
    const len = content.length;
    if (len > prevContentLenRef.current) {
      setJustAppended(true);
      prevContentLenRef.current = len;
      const t = setTimeout(() => setJustAppended(false), 120);
      return () => clearTimeout(t);
    }
    prevContentLenRef.current = len;
  }, [streaming, content]);

  const handleCopy = useCallback((text: string, as: "plain" | "markdown") => {
    navigator.clipboard.writeText(text).then(() => {
      setCopiedWhich(as);
      setTimeout(() => setCopiedWhich(null), COPY_FEEDBACK_MS);
    });
  }, []);

  // 按序渲染：有 parts 时正文与工具调用交错展示；否则兼容旧数据（先工具块再正文）
  const hasOrderedParts = orderedParts && orderedParts.length > 0;
  const copyContent = hasOrderedParts
    ? orderedParts.filter((p): p is MessagePart & { type: "text" } => p.type === "text").map((p) => p.text).join("")
    : content;

  return (
    <div
      className="flex items-start gap-3"
      onMouseEnter={() => setMessageHovered(true)}
      onMouseLeave={() => setMessageHovered(false)}
    >
      <div className="-mt-1 flex size-8 shrink-0 overflow-hidden rounded-full bg-white">
          <img src="/logo.png" alt="" className="size-full object-cover" />
        </div>

        <div className="min-w-0 flex-1 max-w-2xl w-full">
          {/* 无有序 parts 时才显示顶部整块 reasoning（兼容旧数据/无工具场景） */}
          {!hasOrderedParts && reasoning && (
            <div className="mb-2">
              <button
                onClick={() => setReasoningOpen(!reasoningOpen)}
                className="flex items-center gap-1 text-[12px] text-muted-foreground hover:text-foreground transition-colors"
              >
                <Brain className="size-3 shrink-0" strokeWidth={1.5} />
                <span
                  className="inline-flex cursor-pointer items-center gap-1"
                  onMouseEnter={() => setThinkingLabelHover(true)}
                  onMouseLeave={() => setThinkingLabelHover(false)}
                >
                  Thinking{streaming ? "..." : ""}
                  <span
                    className={cn(
                      "transition-opacity duration-150",
                      thinkingLabelHover ? "visible opacity-100" : "invisible opacity-0",
                    )}
                  >
                    {reasoningOpen ? (
                      <ChevronDown className="size-3" strokeWidth={1.5} />
                    ) : (
                      <ChevronRight className="size-3" strokeWidth={1.5} />
                    )}
                  </span>
                </span>
              </button>
              {reasoningOpen && (
                <div className="mt-0.5 px-2 py-1 text-[12px] leading-[1.875] tracking-[0.02em] text-muted-foreground/80 whitespace-pre-wrap">
                  {reasoning}
                </div>
              )}
            </div>
          )}

          <MarkdownErrorBoundary fallback={content ?? ""}>
            <Suspense
              fallback={
                <div className="text-[14px] leading-relaxed whitespace-pre-wrap">{content}</div>
              }
            >
              <div
                className={cn(
                  streaming && "streaming-content",
                  justAppended && "streaming-just-appended",
                )}
              >
              {hasOrderedParts ? (
              <div className="space-y-2">
                {orderedParts!.map((part, index) =>
                  part.type === "text" ? (
                    part.text ? (
                      <div key={index} className="text-[14px] leading-relaxed">
                        {renderMessageContent(part.text, !!streaming, index === orderedParts!.length - 1)}
                      </div>
                    ) : null
                  ) : part.type === "reasoning" ? (
                    part.text ? (
                      <ReasoningSegment
                        key={`reasoning-${index}`}
                        text={part.text}
                        isStreaming={streaming}
                        isComplete={!streaming || index < orderedParts!.length - 1}
                      />
                    ) : null
                  ) : (
                    <div key={part.id} className="space-y-1.5">
                      <ToolCallBlock toolCall={part} pendingAsk={pendingAsk} />
                    </div>
                  )
                )}
                {content?.trim() && copyContent !== content && (
                  <div className="mt-1 text-[14px] leading-relaxed">
                    {renderMessageContent(content, !!streaming, true)}
                  </div>
                )}
              </div>
            ) : (
              <>
                {toolCalls && toolCalls.length > 0 && (
                  <div className="mb-3 space-y-1.5">
                    {toolCalls.map((tc) => (
                      <ToolCallBlock key={tc.id} toolCall={tc} pendingAsk={pendingAsk} />
                    ))}
                  </div>
                )}
                <div className="text-[14px] leading-relaxed">
                  {renderMessageContent(content ?? "", !!streaming, true)}
                  {streaming && !content && (toolCalls?.length ?? 0) === 0 && (
                    <span className="cursor-blink ml-0.5 inline-block h-4 w-0.5 bg-brand align-middle" aria-hidden />
                  )}
                </div>
              </>
            )}
              </div>
            </Suspense>
          </MarkdownErrorBoundary>

          {!streaming && (copyContent || showTokens) && (
            <div className={cn(
              "mb-2 -ml-1 min-h-8",
              // markdown-body has mb-4; compensate with -mt-4 to stay tight.
              // But when the last visible element is a tool call block, there's
              // no mb-4, so use mt-1 to avoid overlapping the card border.
              hasOrderedParts
                ? (orderedParts![orderedParts!.length - 1]?.type === "tool" && !(content?.trim() && copyContent !== content))
                  ? "mt-1" : "-mt-4"
                : (toolCalls?.length && !content?.trim())
                  ? "mt-1" : "-mt-4",
            )}>
              {messageHovered && (
                <div className="flex items-center gap-1">
                  {copyContent && (
                    <>
                      <ActionButton
                        icon={<CopyFeedbackIcon copied={copiedWhich === "plain"} />}
                        title={copiedWhich === "plain" ? "" : t("chat.copyTip")}
                        onClick={() => handleCopy(stripMarkdown(copyContent), "plain")}
                      />
                      <ActionButton icon={<RotateCcw />} title={t("chat.regenerateTip")} onClick={handleRegenerate} />
                    </>
                  )}
                  {showTokens && (
                    <span
                      className="inline-flex h-8 min-h-8 items-center gap-0.5 text-[11px] text-muted-foreground"
                      title={t("chat.tokensTooltip", {
                        input: formatTokenCount(tokensInput ?? 0),
                        output: formatTokenCount(tokensOutput ?? 0),
                      })}
                    >
                      <span className={TOKEN_ICON}>
                        <CircleGauge strokeWidth={2} />
                      </span>
                      <span className="-ml-3.5">{formatTokenCount(tokensInput ?? 0)} in</span>
                      <span className="text-muted-foreground/70">·</span>
                      <span>{formatTokenCount(tokensOutput ?? 0)} out</span>
                    </span>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
  );
}

/** 单段推理（与 tool call 交错时使用），可折叠；后面出现 tool/text 或流结束即视为完成，变为 "Thought" 并同时折叠 */
function ReasoningSegment({
  text,
  isStreaming,
  isComplete,
}: {
  text: string;
  isStreaming?: boolean;
  /** 为 true 时表示本段后已有 tool call 或 text，或流已结束，应显示 Thought 并折叠 */
  isComplete?: boolean;
}) {
  const done = isComplete ?? !isStreaming;
  const [open, setOpen] = useState(!done);
  const [labelHover, setLabelHover] = useState(false);
  const startRef = useRef<number | null>(null);
  const [durationMs, setDurationMs] = useState<number | null>(null);

  useEffect(() => {
    if (isStreaming && !isComplete && startRef.current === null) startRef.current = Date.now();
    if (isComplete) {
      if (startRef.current != null && durationMs === null)
        setDurationMs(Date.now() - startRef.current);
      setOpen(false);
    } else if (!isComplete && isStreaming) {
      setOpen(true);
    }
  }, [isStreaming, isComplete, durationMs]);

  const label = done
    ? durationMs != null
      ? `Thought ${(durationMs / 1000).toFixed(0)}s`
      : "Thought"
    : "Thinking...";

  return (
    <div className="mb-1.5">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1 text-[12px] text-muted-foreground hover:text-foreground transition-colors duration-150"
      >
        <Brain className="size-3 shrink-0" strokeWidth={1.5} />
        <span
          className="inline-flex cursor-pointer items-center gap-1"
          onMouseEnter={() => setLabelHover(true)}
          onMouseLeave={() => setLabelHover(false)}
        >
          {label}
          <span
            className={cn(
              "transition-opacity duration-150",
              labelHover ? "visible opacity-100" : "invisible opacity-0",
            )}
          >
            {open ? (
              <ChevronDown className="size-3 transition-transform duration-200 ease-out" strokeWidth={1.5} />
            ) : (
              <ChevronRight className="size-3 transition-transform duration-200 ease-out" strokeWidth={1.5} />
            )}
          </span>
        </span>
      </button>
      <div
        className="grid transition-[grid-template-rows] duration-200 ease-out"
        style={{ gridTemplateRows: open ? "1fr" : "0fr" }}
      >
        <div className="min-h-0 overflow-hidden">
          <div className="mt-0.5 px-2 py-1 text-[12px] leading-[1.875] tracking-[0.02em] text-muted-foreground/80">
            <Suspense fallback={<span className="whitespace-pre-wrap">{text}</span>}>
              <MarkdownContent source={text} className="text-[12px] leading-[1.875] tracking-[0.02em]" />
            </Suspense>
          </div>
        </div>
      </div>
    </div>
  );
}

function isMessagePart(x: unknown): x is MessagePart {
  const p = x as MessagePart;
  return typeof x === "object" && x !== null && "type" in x && (p.type === "text" || p.type === "reasoning" || p.type === "tool");
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

/** 耗时超过此值（毫秒）才在 UI 展示 */
const DURATION_THRESHOLD_MS = 1000;

function formatDuration(ms: number): string {
  if (ms >= 1000) return `${(ms / 1000).toFixed(1)} s`;
  return `${ms} ms`;
}

/** 判断是否为 write/edit 返回的带 diff 的结果（含 --- Diff ---） */
function extractDiffLines(text: string): { intro: string; diffLines: string[] } | null {
  const idx = text.indexOf("--- Diff ---");
  if (idx === -1) return null;
  const intro = text.slice(0, idx).trim();
  const after = text.slice(idx + "--- Diff ---".length).trimStart();
  const diffLines = after.split("\n");
  return { intro, diffLines };
}

/** 文件操作结果用 diff 样式渲染：+ 行绿底，- 行红底 */
function ResultContent({ result }: { result: unknown }) {
  const { t } = useTranslation();
  if (typeof result !== "string") {
    return (
      <pre className="rounded bg-background-tertiary p-2 text-[11px] overflow-x-auto max-h-[300px] overflow-y-auto">
        {JSON.stringify(result, null, 2)}
      </pre>
    );
  }
  const diff = extractDiffLines(result);
  if (!diff) {
    return (
      <pre className="rounded bg-background-tertiary p-2 text-[11px] overflow-x-auto max-h-[300px] overflow-y-auto whitespace-pre-wrap">
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
      <div className="rounded bg-background-tertiary p-2 text-[11px] overflow-x-auto max-h-[300px] overflow-y-auto font-mono">
        {diff.diffLines.map((line, i) => {
          if (line.startsWith("+") && !line.startsWith("+++")) {
            return (
              <div key={i} className="bg-success/15 text-foreground">
                {line}
              </div>
            );
          }
          if (line.startsWith("-") && !line.startsWith("---")) {
            return (
              <div key={i} className="bg-destructive/15 text-foreground">
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

/** 工具返回结果是否表示用户拒绝（未执行） */
function isToolResultRejected(result: unknown): boolean {
  if (typeof result !== "string") return false;
  const s = result.toLowerCase();
  return s.includes("拒绝") || s.includes("denied") || s.includes("rejected");
}

const TOOL_ICON_MAP: Record<string, typeof Wrench> = {
  bash: SquareTerminal,
  edit: FileDiff,
  read: FileSearch,
  write: FilePenLine,
};
function ToolCallIcon({ toolName }: { toolName: string }) {
  const Icon = TOOL_ICON_MAP[toolName] ?? Wrench;
  return <Icon className="size-3.5 shrink-0 text-muted-foreground" strokeWidth={1.5} />;
}

/** 流式展示文本：按行逐行显示，模拟输出效果 */
function StreamRevealText({ text, className = "" }: { text: string; className?: string }) {
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
function ToolCallArgsDisplay({
  toolName,
  args,
  streamReveal,
}: {
  toolName: string;
  args: Record<string, unknown>;
  streamReveal?: boolean;
}) {
  const { t } = useTranslation();
  const preClass = "rounded bg-background-tertiary p-2 text-[11px] overflow-x-auto font-mono";
  const renderPre = (content: string, extraClass = "") =>
    streamReveal ? (
      <StreamRevealText text={content} className={cn(preClass, extraClass)} />
    ) : (
      <pre className={cn(preClass, extraClass)}>{content}</pre>
    );

  if (toolName === "bash") {
    const description = args.description as string | undefined;
    const command = (args.command as string) ?? "—";
    return (
      <div className="mb-2 space-y-1">
        {description && (
          <div className="text-[11px] font-medium text-foreground-secondary font-mono">
            {streamReveal ? <StreamRevealText text={`# ${description}`} className="" /> : `# ${description}`}
          </div>
        )}
        {streamReveal ? (
          <StreamRevealText text={command} className={preClass} />
        ) : (
          <pre className={preClass}>{command}</pre>
        )}
      </div>
    );
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
  if (toolName === "write") {
    const filePath = (args.filePath as string) ?? "—";
    return (
      <div className="mb-2 space-y-1">
        <div className="text-[11px] font-medium text-foreground-secondary">{t("tool.path")}</div>
        {streamReveal ? <StreamRevealText text={filePath} className={preClass} /> : <pre className={preClass}>{filePath}</pre>}
      </div>
    );
  }
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

function ToolCallBlock({ toolCall, pendingAsk }: { toolCall: ToolCallInfo; pendingAsk: PendingPermission | null }) {
  const [open, setOpen] = useState(true);
  const { t } = useTranslation();
  const respond = usePermissionStore((s) => s.respond);
  const toolDisplayName = (typeof toolCall.toolName === "string" ? toolCall.toolName : "tool").replace(/_/g, " ");
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
        <span className="font-medium capitalize">{toolDisplayName}</span>
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
                    <ResultContent result={toolCall.result} />
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

/** 按 <think> 与 Markdown 片段渲染；思考块用 ReasoningSegment，其余用 MarkdownContent；流式时最后一格可带文末光标 */
function renderMessageContent(
  text: string | undefined,
  isStreaming: boolean,
  isLastSegment: boolean,
) {
  const blocks = splitThinkBlocks(text ?? "");
  return (
    <>
      {blocks.map((block, i) => {
        if (block.type === "think") {
          const isLastThink = isLastSegment && i === blocks.length - 1;
          return (
            <ReasoningSegment
              key={`think-${i}`}
              text={block.content}
              isStreaming={isStreaming}
              isComplete={!isStreaming || !isLastThink}
            />
          );
        }
        const isLast = isLastSegment && i === blocks.length - 1;
        return (
          <MarkdownContent
            key={`md-${i}`}
            source={block.content}
            trailingCursor={isStreaming && isLast}
          />
        );
      })}
    </>
  );
}

/** 消息操作区图标统一尺寸：外层 size-8，图标 size-4 */
const MSG_ICON_WRAPPER = "inline-flex size-8 shrink-0 items-center justify-center [&_svg]:!size-4";
/** token 行用：图标 size-4 与复制/重新生成视觉一致 */
const TOKEN_ICON = "inline-flex size-8 shrink-0 items-center [&_svg]:!size-4 ml-1";

const ICON_TRANSITION = "transition-opacity duration-150 ease-out";

/** 复制按钮图标：打勾/复制用透明度过渡，避免切换时空白闪烁；固定容器与居中保证图标始终可见 */
function CopyFeedbackIcon({ copied, iconClass = "size-4" }: { copied: boolean; iconClass?: string }) {
  return (
    <span className="relative inline-flex min-w-4 min-h-4 w-4 h-4 shrink-0 items-center justify-center [&_svg]:absolute [&_svg]:inset-0 [&_svg]:m-auto [&_svg]:shrink-0">
      <Copy
        className={cn(iconClass, ICON_TRANSITION, copied ? "opacity-0" : "opacity-100")}
        aria-hidden
      />
      <Check
        className={cn(iconClass, ICON_TRANSITION, copied ? "opacity-100" : "opacity-0")}
        aria-hidden
      />
    </span>
  );
}

function ActionButton({
  icon,
  title,
  onClick,
}: {
  icon: React.ReactNode;
  title: string;
  onClick?: () => void;
}) {
  return (
    <Button
      variant="ghost"
      size="icon-sm"
      className="text-muted-foreground hover:text-foreground cursor-pointer p-0 min-w-8 min-h-8 inline-flex items-center justify-center"
      title={title}
      onClick={onClick}
    >
      <span className={cn(MSG_ICON_WRAPPER, "min-w-8 min-h-8")}>{icon}</span>
    </Button>
  );
}

function EmptyState() {
  const providerType = useChatStore((s) => s.providerType);
  return (
    <div className="flex flex-1 items-center justify-center">
      <div className="text-center">
        <div className="mx-auto mb-4 flex size-12 items-center justify-center rounded-2xl bg-brand/10">
          {providerType ? (
            <ProviderIcon type={providerType} className="size-6 text-brand" />
          ) : (
            <Bot className="size-6 text-brand" />
          )}
        </div>
        <h2 className="text-lg font-semibold">Start a conversation</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Choose a model and send a message to get started.
        </p>
      </div>
    </div>
  );
}
