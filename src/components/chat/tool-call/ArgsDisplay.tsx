import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import Prism from "prismjs";
import { Highlight } from "prism-react-renderer";
import { cn } from "@/lib/utils";
import { FilePathChip } from "@/components/common/FilePathChip";
import { BASH_HIGHLIGHT_THEME } from "./utils";

import "prismjs/components/prism-bash";

/** Stream-reveal text: displays lines incrementally */
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

/** Per-tool customized arguments display */
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
    return <ParseDocumentArgs args={args} renderPre={renderPre} />;
  }
  if (toolName === "bash") {
    const command = (args.command as string) ?? "—";
    return <div className="mb-2">{renderBashCommand(command)}</div>;
  }
  if (toolName === "cove_interpreter") {
    const code = args.code as string | undefined;
    const file = args.file as string | undefined;
    const label = file ? "Script" : "Lua";
    const content = file ?? code ?? "—";
    return (
      <div className="mb-2 space-y-1">
        <div className="text-[11px] font-medium text-foreground-secondary">{label}</div>
        {file ? (
          <div className="py-0.5"><FilePathChip path={content} /></div>
        ) : (
          renderPre(content)
        )}
      </div>
    );
  }
  if (toolName === "read") {
    return <ReadArgs args={args} t={t} />;
  }
  if (toolName === "write") return null;
  if (toolName === "edit") {
    return <EditArgs args={args} t={t} renderPre={renderPre} />;
  }
  const jsonText = JSON.stringify(args, null, 2);
  return (
    <div className="mb-2">
      <div className="text-[11px] font-medium text-foreground-secondary mb-1">{t("tool.arguments")}</div>
      {streamReveal ? <StreamRevealText text={jsonText} className={preClass} /> : <pre className={preClass}>{jsonText}</pre>}
    </div>
  );
}

// ── Internal per-tool args components ─────────────────────────────────────────

function ParseDocumentArgs({
  args,
  renderPre,
}: {
  args: Record<string, unknown>;
  renderPre: (content: string, extraClass?: string) => React.JSX.Element;
}) {
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

function ReadArgs({ args, t }: { args: Record<string, unknown>; t: (k: string) => string }) {
  const filePath = args.filePath as string | undefined;
  const offset = args.offset as number | undefined;
  const limit = args.limit as number | undefined;
  const extra = [offset != null && `offset: ${offset}`, limit != null && `limit: ${limit}`].filter(Boolean).join(", ");
  return (
    <div className="mb-2 space-y-1">
      <div className="text-[11px] font-medium text-foreground-secondary">{t("tool.path")}</div>
      <div className="py-0.5">
        {filePath ? <FilePathChip path={filePath} /> : <span className="text-[11px] text-foreground-tertiary">—</span>}
        {extra && <span className="ml-1.5 text-[11px] text-foreground-tertiary">({extra})</span>}
      </div>
    </div>
  );
}

function EditArgs({
  args,
  t,
  renderPre,
}: {
  args: Record<string, unknown>;
  t: (k: string) => string;
  renderPre: (content: string, extraClass?: string) => React.JSX.Element;
}) {
  const filePath = args.filePath as string | undefined;
  const oldString = args.oldString as string | undefined;
  const newString = args.newString as string | undefined;
  const snippet = (s: string, max = 80) => (s.length <= max ? s : s.slice(0, max) + "…");
  return (
    <div className="mb-2 space-y-1">
      <div className="text-[11px] font-medium text-foreground-secondary">{t("tool.path")}</div>
      <div className="py-0.5">
        {filePath ? <FilePathChip path={filePath} /> : <span className="text-[11px] text-foreground-tertiary">—</span>}
      </div>
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
