import { useState, useEffect, useRef, useCallback } from "react";
import { useTranslation } from "react-i18next";
import {
  Copy,
  RotateCcw,
  ChevronDown,
  ChevronRight,
  Brain,
  Check,
  CircleGauge,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useChatStore } from "@/stores/chatStore";
import type { ToolCallInfo, MessagePart } from "@/stores/chatStore";
import { usePermissionStore } from "@/stores/permissionStore";
import { cn, stripMarkdown } from "@/lib/utils";
import { splitThinkBlocks } from "@/lib/splitThinkBlocks";
import { MarkdownContent } from "@/components/chat/MarkdownContent";
import { ToolCallBlock } from "./ToolCallBlock";
import { ReasoningSegment } from "./ReasoningSegment";
import { Component } from "react";

export const COPY_FEEDBACK_MS = 1500;

/** 消息操作区图标统一尺寸：外层 size-8，图标 size-4 */
export const MSG_ICON_WRAPPER = "inline-flex size-8 shrink-0 items-center justify-center [&_svg]:!size-4";
/** token 行用：图标 size-4 与复制/重新生成视觉一致 */
export const TOKEN_ICON = "inline-flex size-8 shrink-0 items-center [&_svg]:!size-4 ml-1";

export const ICON_TRANSITION = "transition-opacity duration-150 ease-out";

/** Markdown 渲染出错时回退显示纯文本，避免白屏 */
export class MarkdownErrorBoundary extends Component<
  { fallback: string; children: React.ReactNode },
  { hasError: boolean }
> {
  state = { hasError: false };
  static getDerivedStateFromError = () => ({ hasError: true });
  componentDidUpdate(prevProps: { fallback: string }) {
    if (this.state.hasError && prevProps.fallback !== this.props.fallback) {
      this.setState({ hasError: false });
    }
  }
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

/** 复制按钮图标：打勾/复制用透明度过渡，避免切换时空白闪烁；固定容器与居中保证图标始终可见 */
export function CopyFeedbackIcon({ copied, iconClass = "size-4" }: { copied: boolean; iconClass?: string }) {
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

export function ActionButton({
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

export function formatTokenCount(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(n);
}

/** 按 <think> 与 Markdown 片段渲染；思考块用 ReasoningSegment，其余用 MarkdownContent */
export function renderMessageContent(
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
          <MarkdownErrorBoundary key={`md-${i}`} fallback={block.content ?? ""}>
            <MarkdownContent
              source={block.content}
              trailingCursor={isStreaming && isLast}
            />
          </MarkdownErrorBoundary>
        );
      })}
    </>
  );
}

export function AssistantMessage({
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
                <span className={cn("transition-opacity duration-150", thinkingLabelHover ? "visible opacity-100" : "invisible opacity-0")}>
                  {reasoningOpen ? <ChevronDown className="size-3" strokeWidth={1.5} /> : <ChevronRight className="size-3" strokeWidth={1.5} />}
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

        <div className={cn(streaming && "streaming-content", justAppended && "streaming-just-appended")}>
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

        {!streaming && (copyContent || showTokens) && (
          <div className={cn(
            "mb-2 -ml-1 min-h-8",
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
                    <span className={TOKEN_ICON}><CircleGauge strokeWidth={2} /></span>
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
