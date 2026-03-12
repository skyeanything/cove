import React from "react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import { FilePathChip } from "@/components/common/FilePathChip";
import { extractFilePathsFromResult, extractPathFromDiffIntro } from "@/lib/extract-file-paths";
import { extractDiffLines } from "./utils";

/** Renders tool result with diff-aware formatting: + lines green, - lines red */
export function ResultContent({ result, toolName }: { result: unknown; toolName?: string }) {
  const { t } = useTranslation();
  const resultTextColorClass = toolName === "bash" ? "text-foreground" : "text-foreground-secondary";

  if (toolName === "parse_document" && typeof result === "string") {
    const parsed = tryParseDocumentResult(result);
    if (parsed) return <ParseDocumentResult parsed={parsed} />;
  }

  if (typeof result !== "string") {
    return (
      <pre className={cn("rounded bg-background-tertiary/50 p-2 text-[11px] overflow-x-auto max-h-[300px] overflow-y-auto", resultTextColorClass)}>
        {JSON.stringify(result, null, 2)}
      </pre>
    );
  }

  const diff = extractDiffLines(result);
  if (!diff) {
    const extractedPaths = toolName ? extractFilePathsFromResult(toolName, result) : [];
    if (extractedPaths.length > 0) {
      return (
        <FilePathResult
          result={result}
          extractedPaths={extractedPaths}
          className={resultTextColorClass}
        />
      );
    }
    return (
      <pre
        className={cn(
          "rounded bg-background-tertiary/50 p-2 text-[11px] overflow-x-auto max-h-[300px] overflow-y-auto whitespace-pre-wrap",
          resultTextColorClass,
        )}
      >
        {result}
      </pre>
    );
  }

  return (
    <div className="space-y-1">
      {diff.intro && (
        <p className="text-[11px] text-muted-foreground mb-1">
          {renderDiffIntro(diff.intro)}
        </p>
      )}
      <div className="mb-1 text-[11px] font-medium uppercase text-foreground-secondary">{t("tool.content")}</div>
      <div
        className={cn(
          "rounded bg-background-tertiary/50 p-2 text-[11px] overflow-x-auto max-h-[300px] overflow-y-auto font-mono",
          resultTextColorClass,
        )}
      >
        {diff.diffLines.map((line, i) => {
          if (line.startsWith("+") && !line.startsWith("+++")) {
            return (
              <div key={i} className={cn("bg-success/15", resultTextColorClass)}>
                {line}
              </div>
            );
          }
          if (line.startsWith("-") && !line.startsWith("---")) {
            return (
              <div key={i} className={cn("bg-destructive/15", resultTextColorClass)}>
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

// ── Internal helpers ──────────────────────────────────────────────────────────

interface ParsedDocResult {
  attachmentId?: string;
  name?: string;
  path?: string;
  mode?: string;
  chunkCount?: number;
  truncated?: boolean;
  warnings?: string[];
  summary?: string;
}

function tryParseDocumentResult(result: string): ParsedDocResult | null {
  try {
    return JSON.parse(result) as ParsedDocResult;
  } catch {
    return null;
  }
}

function ParseDocumentResult({ parsed }: { parsed: ParsedDocResult }) {
  const modeLabel =
    parsed.mode === "summary"
      ? "文档总结"
      : parsed.mode === "chunks"
        ? "分块读取"
        : "文档全文";
  return (
    <div className="space-y-1">
      <div className="rounded bg-background-tertiary/10 p-2 text-[11px] space-y-1">
        <div><span className="text-foreground-secondary">附件 ID：</span>{parsed.attachmentId ?? "—"}</div>
        <div><span className="text-foreground-secondary">文件名：</span>{parsed.name ?? "—"}</div>
        <div className="break-all">
          <span className="text-foreground-secondary">文件路径：</span>
          {parsed.path ? <FilePathChip path={parsed.path} /> : "—"}
        </div>
        <div><span className="text-foreground-secondary">读取模式：</span>{modeLabel}</div>
        <div><span className="text-foreground-secondary">分块数量：</span>{parsed.chunkCount ?? 0}</div>
        <div><span className="text-foreground-secondary">是否截断：</span>{parsed.truncated ? "是" : "否"}</div>
        {parsed.warnings && parsed.warnings.length > 0 && (
          <div><span className="text-foreground-secondary">提示：</span>{parsed.warnings.join("；")}</div>
        )}
      </div>
      {parsed.summary && (
        <>
          <div className="text-[11px] font-medium text-foreground-secondary">摘要预览</div>
          <pre className="rounded bg-background-tertiary/50 p-2 text-[11px] overflow-x-auto max-h-[200px] overflow-y-auto whitespace-pre-wrap">
            {parsed.summary}
          </pre>
        </>
      )}
    </div>
  );
}

interface FilePathResultProps {
  result: string;
  extractedPaths: { path: string; start: number; end: number }[];
  className: string;
}

function FilePathResult({ result, extractedPaths, className }: FilePathResultProps) {
  return (
    <div
      className={cn(
        "rounded bg-background-tertiary/50 p-2 text-[11px] overflow-x-auto max-h-[300px] overflow-y-auto whitespace-pre-wrap",
        className,
      )}
    >
      {extractedPaths.reduce<{ lastEnd: number; nodes: React.ReactNode[] }>(
        (acc, ep, i) => {
          if (ep.start > acc.lastEnd) {
            acc.nodes.push(<span key={`t${i}`}>{result.slice(acc.lastEnd, ep.start)}</span>);
          }
          acc.nodes.push(<FilePathChip key={`p${i}`} path={ep.path} compact />);
          return { lastEnd: ep.end, nodes: acc.nodes };
        },
        { lastEnd: 0, nodes: [] },
      ).nodes}
      {extractedPaths[extractedPaths.length - 1]!.end < result.length && (
        <span>{result.slice(extractedPaths[extractedPaths.length - 1]!.end)}</span>
      )}
    </div>
  );
}

function renderDiffIntro(intro: string): React.ReactNode {
  const introPath = extractPathFromDiffIntro(intro);
  if (!introPath) return intro;
  const idx = intro.indexOf(introPath);
  return (
    <>
      {intro.slice(0, idx)}
      <FilePathChip path={introPath} compact />
      {intro.slice(idx + introPath.length)}
    </>
  );
}
