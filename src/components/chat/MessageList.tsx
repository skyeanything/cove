import {
  Pencil,
  Check,
  X,
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
import { useAutoScroll } from "@/hooks/useAutoScroll";
import { ScrollToBottomButton } from "./ScrollToBottomButton";

const EMPTY_ATTACHMENTS: Attachment[] = [];

export function MessageList() {
  const messages = useChatStore((s) => s.messages);
  const isStreaming = useChatStore((s) => s.isStreaming);
  const streamingContent = useChatStore((s) => s.streamingContent);
  const streamingReasoning = useChatStore((s) => s.streamingReasoning);
  const streamingToolCalls = useChatStore((s) => s.streamingToolCalls);
  const streamingParts = useChatStore((s) => s.streamingParts);

  const hasOrderedStreamingParts = streamingParts.length > 0;
  const renderedContent = streamingContent;
  const renderedReasoning = streamingReasoning;
  const renderedParts = hasOrderedStreamingParts ? streamingParts : undefined;

  const { scrollRef, isDetached, scrollToBottom } = useAutoScroll({
    isStreaming,
    contentDeps: [messages, renderedContent, renderedReasoning, streamingToolCalls, renderedParts],
  });

  if (messages.length === 0 && !isStreaming) {
    return <EmptyState />;
  }

  return (
    <div className="relative min-h-0 flex-1">
      <div ref={scrollRef} className="absolute inset-0 overflow-y-auto">
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
      <ScrollToBottomButton visible={isDetached} onClick={scrollToBottom} />
    </div>
  );
}

function MessageBubble({ message }: { message: Message }) {
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
