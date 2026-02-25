import React, { useState, useCallback } from "react";
import Prism from "prismjs";
import { Highlight } from "prism-react-renderer";
import { Copy, Check, Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

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

export const COPY_FEEDBACK_MS = 1500;

/** 将 React 子节点安全转为字符串，避免对象被渲染成 [object Object] */
export function reactNodeToDisplayString(node: React.ReactNode): string {
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
export function getCodeAndLangFromPreChildren(children: React.ReactNode): { code: string; className?: string } {
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
export function CodeHighlight({ lang, code, showLineNumbers }: { lang: string; code: string; showLineNumbers?: boolean }) {
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
export function CodeBlock({
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
