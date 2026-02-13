import "katex/dist/katex.min.css";
import React, { useCallback, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkBreaks from "remark-breaks";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import remarkDirective from "remark-directive";
import remarkDirectiveRehype from "remark-directive-rehype";
import Prism from "prismjs";
import { Highlight } from "prism-react-renderer";
import type { Components } from "react-markdown";
import { ChevronDown, ChevronRight, Copy, Check, Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

// 引入 Prism 语言（按需可扩展），会挂到上面导入的 Prism 实例上
import "prismjs/components/prism-bash";
import "prismjs/components/prism-json";
import "prismjs/components/prism-typescript";
import "prismjs/components/prism-javascript";
import "prismjs/components/prism-jsx";
import "prismjs/components/prism-tsx";
import "prismjs/components/prism-css";
import "prismjs/components/prism-python";
import "prismjs/components/prism-yaml";
import "prismjs/components/prism-markdown";

const COPY_FEEDBACK_MS = 1500;

const remarkPlugins = [remarkGfm, remarkBreaks, remarkMath, remarkDirective, remarkDirectiveRehype];
const rehypePluginsBase = [rehypeKatex];

/** 将 React 子节点安全转为字符串，避免对象被渲染成 [object Object] */
function reactNodeToDisplayString(node: React.ReactNode): string {
  if (node == null) return "";
  if (typeof node === "string") return node;
  if (typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(reactNodeToDisplayString).join("");
  if (typeof node === "object" && !React.isValidElement(node))
    return JSON.stringify(node, null, 2);
  if (React.isValidElement(node) && typeof (node.props as { children?: unknown }).children !== "undefined")
    return reactNodeToDisplayString((node.props as { children: React.ReactNode }).children);
  return String(node);
}

/** 从 pre 的 children（即 code 元素）中提取原始代码字符串与 language class */
function getCodeAndLangFromPreChildren(children: React.ReactNode): { code: string; className?: string } {
  const c = React.Children.toArray(children)[0];
  if (React.isValidElement(c) && c.type === "code") {
    const props = c.props as { children?: unknown; className?: string };
    const raw = props.children;
    const code =
      typeof raw === "string"
        ? raw.replace(/\n$/, "")
        : reactNodeToDisplayString(children).replace(/\n$/, "");
    return { code, className: props.className };
  }
  return { code: reactNodeToDisplayString(children).replace(/\n$/, "") };
}

/** 安全语法高亮：未知语言时回退为纯文本。text/plaintext 不显示行号，避免单行换行后只显示一个 "1" */
function CodeHighlight({ lang, code, showLineNumbers }: { lang: string; code: string; showLineNumbers?: boolean }) {
  const showNum = showLineNumbers !== false && lang !== "text" && lang !== "plaintext";
  try {
    return (
      <Highlight prism={Prism} language={lang} code={code}>
        {({ tokens, getLineProps, getTokenProps }) => (
          <span className="block">
            {tokens.map((line, i) => (
              <span key={i} {...getLineProps({ line })} className="block">
                {showNum && (
                  <span className="mr-3 inline-block w-6 select-none text-right text-muted-foreground/70">
                    {i + 1}
                  </span>
                )}
                {line.map((token, k) => (
                  <span key={k} {...getTokenProps({ token })} />
                ))}
              </span>
            ))}
          </span>
        )}
      </Highlight>
    );
  } catch {
    return (
      <span className="block">
        {code.split("\n").map((line, i) => (
          <span key={i} className="block">
            {showNum && (
              <span className="mr-3 inline-block w-6 select-none text-right text-muted-foreground/70">
                {i + 1}
              </span>
            )}
            {line}
          </span>
        ))}
      </span>
    );
  }
}

/** 代码块：语法高亮 + 语言标签 + 复制 + 行号；html/mermaid 支持 Play 预览 */
function CodeBlock({
  className,
  children,
  ...props
}: React.HTMLAttributes<HTMLPreElement> & { node?: unknown }) {
  const { code, className: codeClassName } = getCodeAndLangFromPreChildren(children);
  const match = /language-(\w+)/.exec(codeClassName ?? className ?? "");
  const lang = match?.[1] ?? "text";
  const [copied, setCopied] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [mermaidError, setMermaidError] = useState<string | null>(null);

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(code).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), COPY_FEEDBACK_MS);
    });
  }, [code]);

  const isHtml = lang.toLowerCase() === "html";
  const isMermaid = lang.toLowerCase() === "mermaid";

  const renderPreview = useCallback(() => {
    if (isHtml) {
      try {
        return (
          <div
            className="mt-2 rounded-lg border border-border bg-background p-3 min-h-[80px] overflow-auto [&_script]:hidden"
            dangerouslySetInnerHTML={{ __html: code }}
          />
        );
      } catch {
        return <p className="text-destructive text-sm">HTML 预览失败</p>;
      }
    }
    if (isMermaid) {
      const MermaidPreview = () => {
        const ref = React.useRef<HTMLDivElement>(null);
        React.useEffect(() => {
          if (!ref.current || !showPreview) return;
          let cancelled = false;
          import("mermaid").then((m) => {
            if (cancelled) return;
            const run = (m as { run?: (opts: { nodes: Node[]; suppressErrors?: boolean }) => Promise<void> }).run;
            if (run) run({ nodes: [ref.current!], suppressErrors: true }).catch((err: Error) => setMermaidError(err.message));
          });
          return () => { cancelled = true; };
        }, [showPreview]);
        return <div ref={ref} className="mermaid mt-2 flex justify-center bg-background p-3" data-code={code}>{code}</div>;
      };
      return <MermaidPreview />;
    }
    return null;
  }, [isHtml, isMermaid, code, showPreview]);

  return (
    <div className="my-3 overflow-hidden rounded-lg border border-border bg-background-secondary">
      <div className="flex items-center justify-between gap-2 border-b border-border px-2 py-1.5 text-[12px]">
        <span className="font-medium text-muted-foreground">{lang}</span>
        <div className="flex items-center gap-0.5">
          {(isHtml || isMermaid) && (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 px-1.5 text-muted-foreground hover:text-foreground"
              onClick={() => setShowPreview((v) => !v)}
            >
              <Play className="size-3" strokeWidth={1.5} />
              <span className="ml-0.5">{showPreview ? "隐藏" : "预览"}</span>
            </Button>
          )}
          <Button
            variant="ghost"
            size="sm"
            className="h-7 px-1.5 text-muted-foreground hover:text-foreground"
            onClick={handleCopy}
          >
            {copied ? <Check className="size-3" /> : <Copy className="size-3" />}
          </Button>
        </div>
      </div>
      <pre className={cn("p-3 text-[13px] leading-snug font-mono whitespace-pre-wrap break-words overflow-x-auto", className)} {...props}>
        <code className="block">
          <CodeHighlight lang={lang} code={code} showLineNumbers={lang !== "text" && lang !== "plaintext"} />
        </code>
      </pre>
      {showPreview && (isHtml || isMermaid) && (
        <>
          {mermaidError && isMermaid && (
            <p className="px-3 text-destructive text-[12px]">{mermaidError}</p>
          )}
          {renderPreview()}
        </>
      )}
    </div>
  );
}

/** Collapsible directive：:::collapsible{title="..."} ... ::: */
function CollapsibleDirective({
  title,
  children,
}: {
  title?: string;
  children?: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const label = title ?? "折叠";
  return (
    <div className="my-2 rounded-lg border border-border overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-1.5 px-3 py-2 text-left text-[13px] text-foreground hover:bg-background-tertiary/50 transition-colors duration-150"
      >
        {open ? (
          <ChevronDown className="size-3.5 shrink-0" strokeWidth={1.5} />
        ) : (
          <ChevronRight className="size-3.5 shrink-0" strokeWidth={1.5} />
        )}
        <span className="font-medium">{label}</span>
      </button>
      <div
        className="grid transition-[grid-template-rows] duration-200 ease-out"
        style={{ gridTemplateRows: open ? "1fr" : "0fr" }}
      >
        <div className="min-h-0 overflow-hidden">
          <div className="border-t border-border px-3 py-2 text-[14px] leading-relaxed [&>*:first-child]:mt-0 [&>*:last-child]:mb-0">
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}

const markdownComponents: Components & { collapsible?: React.ComponentType<{ title?: string; children?: React.ReactNode }> } = {
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
  // remark-directive-rehype 将 :::collapsible{title="..."} 转为 <collapsible title="...">
  collapsible: ({ title, children }: { title?: string; children?: React.ReactNode }) => (
    <CollapsibleDirective title={title}>{children}</CollapsibleDirective>
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

export function MarkdownContent({ source, className, trailingCursor }: MarkdownContentProps) {
  const hasVisibleContent = source.trim().length > 0;
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
    const lastNl = source.lastIndexOf("\n");

    if (lastNl >= 0) {
      const settled = source.slice(0, lastNl + 1);
      const pending = source.slice(lastNl + 1);

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
          {source}
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
      >
        {source}
      </ReactMarkdown>
    </div>
  );
}

export type { ThinkBlock } from "@/lib/splitThinkBlocks";
export { splitThinkBlocks } from "@/lib/splitThinkBlocks";
