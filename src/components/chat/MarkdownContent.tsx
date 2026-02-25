import "katex/dist/katex.min.css";
import React, { useEffect } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkBreaks from "remark-breaks";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import type { Components } from "react-markdown";
import { CodeBlock, reactNodeToDisplayString } from "./CodeBlock";

const remarkPlugins = [remarkGfm, remarkBreaks, remarkMath];
const rehypePluginsBase = [rehypeKatex];

const markdownComponents: Components = {
  p: ({ children }) => <p className="mb-2 last:mb-0">{children}</p>,
  h1: ({ children }) => <h1 className="mb-2 mt-4 text-xl font-semibold">{children}</h1>,
  h2: ({ children }) => <h2 className="mb-2 mt-3 text-lg font-semibold">{children}</h2>,
  h3: ({ children }) => <h3 className="mb-1.5 mt-2 text-base font-semibold">{children}</h3>,
  ul: ({ children }) => <ul className="mb-2 list-disc pl-6 [&>li]:my-1">{children}</ul>,
  ol: ({ children }) => <ol className="mb-2 list-decimal pl-6 [&>li]:my-1">{children}</ol>,
  blockquote: ({ children }) => (
    <blockquote className="border-l-4 border-border pl-3 my-2 text-muted-foreground">
      {children}
    </blockquote>
  ),
  table: ({ children }) => (
    <div className="my-3 overflow-x-auto">
      <table className="w-full border-collapse text-[14px]">{children}</table>
    </div>
  ),
  thead: ({ children }) => <thead className="bg-background-tertiary">{children}</thead>,
  th: ({ children }) => (
    <th className="border border-border px-2 py-1.5 text-left font-medium">{children}</th>
  ),
  td: ({ children }) => <td className="border border-border px-2 py-1.5">{children}</td>,
  tr: ({ children }) => <tr className="border-b border-border">{children}</tr>,
  pre: CodeBlock as unknown as Components["pre"],
  code: ({ className, children, ...props }) => {
    const isInline = !className;
    const safeChildren =
      typeof children === "string" ? children : reactNodeToDisplayString(children ?? "");
    if (isInline) {
      return (
        <code
          className="rounded bg-background-tertiary px-1 py-0.5 font-mono text-[13px]"
          {...props}
        >
          {safeChildren}
        </code>
      );
    }
    return <code {...props}>{safeChildren}</code>;
  },
  a: ({ href, children }) => (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="text-brand hover:underline"
    >
      {children}
    </a>
  ),
  span: ({ className, children, ...props }: { className?: string; children?: React.ReactNode }) => {
    if (className?.includes("streaming-cursor-placeholder")) {
      return (
        <span className="cursor-blink ml-0.5 inline-block h-4 w-0.5 bg-brand align-middle" aria-hidden />
      );
    }
    return <span className={className} {...props}>{children}</span>;
  },
};

export interface MarkdownContentProps {
  source: string;
  className?: string;
  /** 流式时在文末渲染打字机光标（紧跟文字） */
  trailingCursor?: boolean;
}

/**
 * Memoized markdown renderer for the "settled" portion (complete lines).
 * Only re-parses when the settled text actually changes — i.e. when a new
 * `\n` enters the typewriter output — not on every frame.
 */
const SettledMarkdown = React.memo(function SettledMarkdown({ source }: { source: string }) {
  return (
    <ReactMarkdown
      remarkPlugins={remarkPlugins}
      rehypePlugins={rehypePluginsBase}
      components={markdownComponents as Components}
      skipHtml
    >
      {source}
    </ReactMarkdown>
  );
});

const CURSOR_EL = (
  <span
    className="cursor-blink ml-0.5 inline-block h-4 w-0.5 bg-brand align-middle"
    aria-hidden
  />
);

/**
 * 某些模型会把 markdown 强调符转义成 \*\*text\*\*，导致前端显示字面量 **。
 * 这里做一层保守修正：仅在"非代码块"文本中恢复常见强调标记。
 */
function normalizeEscapedMarkdown(source: string): string {
  if (!source) return source;
  // 包含 fenced code 时不做修正，避免改坏代码片段
  if (source.includes("```")) return source;
  return source
    .replace(/\\\*\\\*(.+?)\\\*\\\*/g, "**$1**")
    .replace(/\\\*(.+?)\\\*/g, "*$1*");
}

/**
 * 防御性处理：把明显非法的 HTML 标签（如 <54>）转义为纯文本，
 * 避免 React 创建元素时抛出 InvalidCharacterError。
 */
function sanitizeInvalidHtmlLikeTags(source: string): string {
  if (!source) return source;
  return source.replace(/<\s*\/?\s*([0-9][^>]*)>/g, (_, inner: string) => `&lt;${inner}&gt;`);
}

import { cn } from "@/lib/utils";

export function MarkdownContent({ source, className, trailingCursor }: MarkdownContentProps) {
  const normalizedSource = sanitizeInvalidHtmlLikeTags(normalizeEscapedMarkdown(source));
  const hasVisibleContent = normalizedSource.trim().length > 0;

  useEffect(() => {
    if (!hasVisibleContent) return;
    if (!import.meta.env.DEV) return;
    if (source !== normalizedSource) {
      console.debug("[MarkdownContent] 检测到转义 markdown，已标准化", {
        sourcePreview: source.slice(0, 160),
        normalizedPreview: normalizedSource.slice(0, 160),
        trailingCursor: !!trailingCursor,
      });
    }
    if (/<\s*[0-9][^>]*>/.test(source)) {
      console.warn("[MarkdownContent] 检测到疑似非法 HTML 标签，已转义处理", {
        sourcePreview: source.slice(0, 160),
      });
    }
  }, [hasVisibleContent, source, normalizedSource, trailingCursor]);

  if (!hasVisibleContent) return null;

  const wrapperCls = cn(
    "markdown-body mb-4 text-[14px] leading-relaxed select-text",
    className,
  );

  /*
   * Streaming mode (trailingCursor): split content into two layers.
   *
   * 1. **Settled** — everything up to the last `\n`. Rendered with full
   *    Markdown. Only re-parses when a new line completes → huge perf win.
   * 2. **Pending** — the current partial line. Rendered as plain text so
   *    the user sees a smooth character-by-character typewriter and never
   *    encounters broken markdown syntax (unclosed `**`, partial ```).
   *
   * 当首行尚未出现 `\n` 时，优先纯文本渲染，避免高频全量 markdown parse。
   */
  if (trailingCursor) {
    const lastNl = normalizedSource.lastIndexOf("\n");

    if (lastNl >= 0) {
      const settled = normalizedSource.slice(0, lastNl + 1);
      const pending = normalizedSource.slice(lastNl + 1);

      return (
        <div className={wrapperCls} data-md>
          <SettledMarkdown source={settled} />
          {pending ? (
            <p className="mb-0 last:mb-0">
              {pending}
              {CURSOR_EL}
            </p>
          ) : (
            CURSOR_EL
          )}
        </div>
      );
    }

    // 还没有换行时，先按纯文本渲染，避免每个字符都触发完整 Markdown 解析导致卡顿
    return (
      <div className={wrapperCls} data-md>
        <p className="mb-0 last:mb-0 whitespace-pre-wrap break-words">
          {normalizedSource}
          {CURSOR_EL}
        </p>
      </div>
    );
  }

  // Not streaming — render everything with full markdown
  return (
    <div className={wrapperCls} data-md>
      <ReactMarkdown
        remarkPlugins={remarkPlugins}
        rehypePlugins={rehypePluginsBase}
        components={markdownComponents as Components}
        skipHtml
      >
        {normalizedSource}
      </ReactMarkdown>
    </div>
  );
}

export type { ThinkBlock } from "@/lib/splitThinkBlocks";
export { splitThinkBlocks } from "@/lib/splitThinkBlocks";
