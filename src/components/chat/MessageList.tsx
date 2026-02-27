// FILE_SIZE_EXCEPTION: Added SummaryCard component for context compression
import {
  Pencil,
  Check,
  X,
  ChevronRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useEffect, useRef, useState, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { useChatStore } from "@/stores/chatStore";
import type { MessagePart } from "@/stores/chatStore";
import type { Message, Attachment } from "@/db/types";
import { UserAttachmentList } from "./AttachmentRow";
import {
  AssistantMessage,
  CopyFeedbackIcon,
  ActionButton,
  COPY_FEEDBACK_MS,
} from "./AssistantMessage";

const EMPTY_ATTACHMENTS: Attachment[] = [];

export function MessageList() {
  const scrollRef = useRef<HTMLDivElement>(null);
  const autoScrollRafRef = useRef<number | null>(null);
  const autoScrollLastTsRef = useRef<number | null>(null);
  /** 是否跟随到底：仅在有新内容且用户未主动上滑时为 true，避免加载/切会话时强制贴底 */
  const shouldAutoFollowRef = useRef(false);
  const lastScrollTopRef = useRef(0);
  /** 记录上一次 isStreaming 状态，用于检测「刚开始流式」时机 */
  const prevIsStreamingRef = useRef(false);

  /** 距离底部小于等于此值视为「在底部」，恢复跟随（用户手动滑回底部时） */
  const FOLLOW_AT_BOTTOM_PX = 50;
  const messages = useChatStore((s) => s.messages);
  const isStreaming = useChatStore((s) => s.isStreaming);
  const streamingContent = useChatStore((s) => s.streamingContent);
  const streamingReasoning = useChatStore((s) => s.streamingReasoning);
  const streamingToolCalls = useChatStore((s) => s.streamingToolCalls);
  const streamingParts = useChatStore((s) => s.streamingParts);

  // 不做缓冲/平滑：event 到达即渲染
  const hasOrderedStreamingParts = streamingParts.length > 0;
  const renderedContent = streamingContent;
  const renderedReasoning = streamingReasoning;
  const renderedParts = hasOrderedStreamingParts ? streamingParts : undefined;

  const stopAutoScroll = useCallback(() => {
    if (autoScrollRafRef.current != null) {
      cancelAnimationFrame(autoScrollRafRef.current);
      autoScrollRafRef.current = null;
    }
    autoScrollLastTsRef.current = null;
  }, []);

  const startAutoScroll = useCallback((viewport: HTMLElement) => {
    if (autoScrollRafRef.current != null) return;

    const step = (now: number) => {
      if (!shouldAutoFollowRef.current) {
        autoScrollRafRef.current = null;
        autoScrollLastTsRef.current = null;
        return;
      }
      const targetTop = viewport.scrollHeight - viewport.clientHeight;
      const distance = targetTop - viewport.scrollTop;

      // 距离很小时直接贴底，避免末端抖动
      if (distance <= 0.8) {
        viewport.scrollTop = targetTop;
        autoScrollRafRef.current = null;
        autoScrollLastTsRef.current = null;
        return;
      }

      const prevTs = autoScrollLastTsRef.current ?? now;
      const dt = Math.min(40, Math.max(8, now - prevTs));
      autoScrollLastTsRef.current = now;

      // 时间归一化缓动：更柔和，并且对不同帧率表现一致
      const easing = 1 - Math.exp((-dt / 16) * 0.12);
      const stepPx = Math.min(14, Math.max(0.25, distance * easing));
      viewport.scrollTop += stepPx;
      autoScrollRafRef.current = requestAnimationFrame(step);
    };

    autoScrollRafRef.current = requestAnimationFrame(step);
  }, []);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;

    const updateFollowState = () => {
      const prevTop = lastScrollTopRef.current;
      const currTop = el.scrollTop;
      const scrolledUp = currTop < prevTop - 0.5;
      const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
      // 用 else if：用户正在上滑时，不被「仍在底部附近」条件覆盖
      if (scrolledUp) {
        shouldAutoFollowRef.current = false;
      } else if (distanceFromBottom <= FOLLOW_AT_BOTTOM_PX) {
        shouldAutoFollowRef.current = true;
        // 用户滑回底部时立即重启 RAF，不必等下一个 streaming token
        startAutoScroll(el);
      }
      lastScrollTopRef.current = currTop;
      if (!shouldAutoFollowRef.current) stopAutoScroll();
    };

    const onWheel = (e: WheelEvent) => {
      if (e.deltaY < 0) {
        shouldAutoFollowRef.current = false;
        stopAutoScroll();
      }
    };

    lastScrollTopRef.current = el.scrollTop;
    updateFollowState();
    el.addEventListener("scroll", updateFollowState, { passive: true });
    el.addEventListener("wheel", onWheel, { passive: true, capture: true });
    return () => {
      el.removeEventListener("scroll", updateFollowState);
      el.removeEventListener("wheel", onWheel, { capture: true });
      stopAutoScroll();
    };
  }, [stopAutoScroll, startAutoScroll]);

  // 仅在流式输出时自动滚动。关键：只在「刚开始流式」那一刻判断是否启用跟随，
  // 后续内容更新不再重置用户意愿——这样用户上滑后不会被自动拉回底部。
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    if (!isStreaming) {
      prevIsStreamingRef.current = false;
      return;
    }
    // 流式刚启动（false → true）：若用户在底部则启用跟随
    if (!prevIsStreamingRef.current) {
      const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
      if (distanceFromBottom <= FOLLOW_AT_BOTTOM_PX) {
        shouldAutoFollowRef.current = true;
      }
      prevIsStreamingRef.current = true;
    }
    if (!shouldAutoFollowRef.current) return;
    startAutoScroll(el);
  }, [isStreaming, messages, renderedContent, renderedReasoning, streamingToolCalls, renderedParts, startAutoScroll]);

  if (messages.length === 0 && !isStreaming) {
    return <EmptyState />;
  }

  return (
    <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto">
      <div className="mx-auto w-full max-w-[896px] px-4 py-6">
        {messages.map((msg) => (
          <MessageBubble key={msg.id} message={msg} />
        ))}
        {isStreaming && (
          <AssistantMessage
            content={renderedContent}
            reasoning={renderedReasoning}
            toolCalls={streamingToolCalls}
            parts={renderedParts}
            isStreaming
          />
        )}
      </div>
    </div>
  );
}

function MessageBubble({ message }: { message: Message }) {
  // Summary card for context compression
  if (message.parent_id === "__context_summary__") {
    return <SummaryCard content={message.content ?? ""} />;
  }
  if (message.role === "user") {
    return <UserMessage messageId={message.id} content={message.content ?? ""} />;
  }
  if (message.role === "assistant") {
    let parts: MessagePart[] | undefined;
    let toolCalls: import("@/stores/chatStore").ToolCallInfo[] | undefined;
    if (message.parts) {
      try {
        const parsed = JSON.parse(message.parts) as unknown;
        if (Array.isArray(parsed) && parsed.length > 0 && isMessagePart(parsed[0])) {
          parts = parsed as MessagePart[];
        } else if (Array.isArray(parsed)) {
          toolCalls = parsed as import("@/stores/chatStore").ToolCallInfo[];
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

function UserMessage({ messageId, content }: { messageId: string; content: string }) {
  const { t } = useTranslation();
  const [isEditing, setIsEditing] = useState(false);
  const [editContent, setEditContent] = useState(content);
  const [copied, setCopied] = useState(false);
  const [hovered, setHovered] = useState(false);
  const editAndResend = useChatStore((s) => s.editAndResend);
  const attachments = useChatStore((s) => s.attachmentsByMessage[messageId] ?? EMPTY_ATTACHMENTS);
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
              {t("skills.cancel")}
            </Button>
            <Button size="sm" className="h-7 px-2 text-xs" onClick={handleConfirm} disabled={!editContent.trim()}>
              <Check className="mr-1 size-3" strokeWidth={1.5} />
              {t("chat.send")}
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className="mb-6 flex justify-end"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <div className="flex max-w-[85%] flex-col items-end">
        {attachments.length > 0 && (
          <UserAttachmentList attachments={attachments} />
        )}
        {content.trim() && (
          <div className="rounded-[4px] bg-background-tertiary px-3 py-1.5 text-[14px] leading-relaxed whitespace-pre-wrap">
            {content}
          </div>
        )}
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

function SummaryCard({ content }: { content: string }) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(false);
  return (
    <div className="mb-6">
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="flex w-full cursor-pointer items-center gap-2 rounded-lg border border-border bg-background-tertiary/50 px-3 py-2 text-left text-[13px] text-muted-foreground transition-colors hover:bg-background-tertiary"
      >
        <ChevronRight
          className={`size-3.5 shrink-0 transition-transform duration-150 ${expanded ? "rotate-90" : ""}`}
          strokeWidth={1.5}
        />
        <span className="font-medium">{t("chat.summaryLabel")}</span>
      </button>
      {expanded && (
        <div className="mt-1 rounded-lg border border-border bg-background-tertiary/30 px-3 py-2 text-[13px] leading-relaxed whitespace-pre-wrap text-foreground-secondary">
          {content}
        </div>
      )}
    </div>
  );
}

function isMessagePart(x: unknown): x is MessagePart {
  const p = x as MessagePart;
  return typeof x === "object" && x !== null && "type" in x && (p.type === "text" || p.type === "reasoning" || p.type === "tool");
}

/** 根据当前小时返回时段 key（用于 welcomeGreeting 的 time 插值） */
function getTimeOfDayKey(): string {
  const h = new Date().getHours();
  if (h >= 0 && h < 5) return "timeDawn";
  if (h >= 5 && h < 8) return "timeEarlyMorning";
  if (h >= 8 && h < 10) return "timeMorning";
  if (h >= 10 && h < 12) return "timeLateMorning";
  if (h >= 12 && h < 14) return "timeNoon";
  if (h >= 14 && h < 17) return "timeAfternoon";
  if (h >= 17 && h < 19) return "timeDusk";
  if (h >= 19 && h < 22) return "timeEvening";
  return "timeNight";
}

/** 空状态：产品 logo + 国际化引导语（按时段：上午好/中午好/晚上好等） */
function EmptyState() {
  const { t } = useTranslation();
  const timeKey = getTimeOfDayKey();
  const timeLabel = t(`chat.${timeKey}`);
  const greeting = t("chat.welcomeGreeting", { time: timeLabel });

  return (
    <div className="flex flex-1 items-center justify-center px-6">
      {/* 用 text-center 统一居中 logo 与问候语，保证同一水平中线 */}
      <div className="w-full max-w-sm text-center">
        <div className="-ml-12 mb-4 inline-flex items-center">
          <img
            src="/logo.png"
            alt=""
            className="h-20 w-auto shrink-0 object-contain object-center"
            aria-hidden
          />
          <span
            className="-ml-5 -mt-1 text-3xl font-semibold leading-none"
            style={{ fontFamily: '"Rubik", sans-serif' }}
          >
            <span style={{ color: '#54C2F6' }}>o</span>
            <span style={{ color: '#2563EB' }}>ve</span>
          </span>
        </div>
        <p className="text-xl font-semibold" style={{ color: '#060a26' }}>{greeting}</p>
      </div>
    </div>
  );
}
