import { useState, useEffect, useRef } from "react";
import { Brain, ChevronDown, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { MarkdownContent } from "@/components/chat/MarkdownContent";

/** 单段推理（与 tool call 交错时使用），可折叠；后面出现 tool/text 或流结束即视为完成，变为 "Thought" 并同时折叠 */
export function ReasoningSegment({
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
            <MarkdownContent source={text} className="text-[12px] leading-[1.875] tracking-[0.02em]" />
          </div>
        </div>
      </div>
    </div>
  );
}
