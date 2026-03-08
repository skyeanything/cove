import { useRef } from "react";
import { cn } from "@/lib/utils";

interface TextEditorProps {
  value: string;
  onChange: (value: string) => void;
  /** Status text shown in footer (e.g. "自动保存中…" or "已保存 14:30") */
  statusMessage?: string | null;
  /** When true, statusMessage is rendered in destructive color */
  statusError?: boolean;
  className?: string;
}

export function TextEditor({ value, onChange, statusMessage, statusError, className }: TextEditorProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key !== "Tab") return;
    e.preventDefault();
    const ta = e.currentTarget;
    const start = ta.selectionStart;
    const end = ta.selectionEnd;
    const updated = value.slice(0, start) + "  " + value.slice(end);
    onChange(updated);
    // Restore cursor position after React re-renders the controlled value
    requestAnimationFrame(() => {
      ta.selectionStart = ta.selectionEnd = start + 2;
    });
  };

  const lineCount = value.split("\n").length;

  return (
    <div className={cn("flex min-h-0 flex-col", className)}>
      <textarea
        ref={textareaRef}
        className="min-h-0 flex-1 resize-none bg-background p-4 font-mono text-[13px] leading-relaxed text-foreground outline-none"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={handleKeyDown}
        spellCheck={false}
        autoCapitalize="off"
        autoCorrect="off"
      />
      <div className="flex shrink-0 items-center justify-between border-t border-border px-3 py-1">
        {statusMessage ? (
          <span className={cn("text-[11px]", statusError ? "text-destructive" : "text-foreground-tertiary")}>
            {statusMessage}
          </span>
        ) : (
          <span />
        )}
        <span className="text-[11px] text-foreground-tertiary">
          {lineCount} 行 · {value.length} 字符
        </span>
      </div>
    </div>
  );
}
