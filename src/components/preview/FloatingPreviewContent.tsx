import { useTranslation } from "react-i18next";
import { MarkdownContent } from "@/components/chat/MarkdownContent";
import { CodeViewer } from "@/components/preview/CodeViewer";
import { CsvViewer } from "@/components/preview/CsvViewer";
import { HtmlViewer } from "@/components/preview/HtmlViewer";
import { PdfViewer } from "@/components/preview/PdfViewer";
import { DocxViewer } from "@/components/preview/DocxViewer";
import { XlsxViewer } from "@/components/preview/XlsxViewer";
import { PptxViewer } from "@/components/preview/PptxViewer";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useWorkspaceStore } from "@/stores/workspaceStore";
import { getPreviewKind } from "@/lib/preview-types";
import { usePreviewContent } from "@/hooks/usePreviewContent";

export interface FloatingPreviewContentProps {
  path: string;
  /** Override workspace root (used by standalone preview window) */
  workspaceRoot?: string | null;
}

export function FloatingPreviewContent({
  path,
  workspaceRoot: workspaceRootProp,
}: FloatingPreviewContentProps) {
  const { t } = useTranslation();
  const storeRoot = useWorkspaceStore(
    (s) => s.activeWorkspace?.path ?? null,
  );
  const workspaceRoot = workspaceRootProp !== undefined ? workspaceRootProp : storeRoot;
  const { cached, loading, error } = usePreviewContent(path, workspaceRoot);
  const kind = getPreviewKind(path);

  if (loading) {
    return (
      <div className="flex flex-1 items-center justify-center p-6 text-sm text-muted-foreground">
        {t("preview.loading")}
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-2 p-6 text-center text-sm text-destructive">
        <span>{error}</span>
      </div>
    );
  }

  if (kind === "txt" && cached?.type === "text" && cached.text !== undefined) {
    const lines = cached.text.split("\n");
    return (
      <ScrollArea className="min-h-0 flex-1 p-1.5">
        <div className="file-preview-code">
          <pre className="m-0 overflow-auto pt-1 pb-1 text-[13px] leading-relaxed text-foreground">
            <code>
              {lines.map((line, i) => (
                <span key={i} className="flex">
                  <span className="file-preview-line-num mr-3 inline-block w-6 shrink-0 select-none text-right">
                    {i + 1}
                  </span>
                  <span className="min-w-0 flex-1 whitespace-pre-wrap break-words">
                    {line || "\n"}
                  </span>
                </span>
              ))}
            </code>
          </pre>
        </div>
      </ScrollArea>
    );
  }

  if (kind === "csv" && cached?.type === "text" && cached.text !== undefined) {
    return (
      <ScrollArea className="min-h-0 flex-1 p-1.5">
        <CsvViewer text={cached.text} />
      </ScrollArea>
    );
  }

  if (kind === "html" && cached?.type === "text" && cached.text !== undefined) {
    return <HtmlViewer code={cached.text} path={path} />;
  }

  if (kind === "md" && cached?.type === "text" && cached.text !== undefined) {
    return (
      <ScrollArea className="min-h-0 flex-1 p-1.5">
        <MarkdownContent source={cached.text} className="text-[14px]" />
      </ScrollArea>
    );
  }

  if (kind === "code" && cached?.type === "text" && cached.text !== undefined) {
    return (
      <ScrollArea className="min-h-0 flex-1 p-1.5">
        <CodeViewer
          path={path}
          code={cached.text}
          className="file-preview-code"
        />
      </ScrollArea>
    );
  }

  if (kind === "image" && cached?.type === "dataUrl" && cached.dataUrl) {
    return (
      <ScrollArea className="min-h-0 flex-1 p-1.5">
        <div className="flex items-center justify-center p-4">
          <img
            src={cached.dataUrl}
            alt={path}
            className="max-h-[55vh] max-w-full rounded object-contain"
          />
        </div>
      </ScrollArea>
    );
  }

  if (kind === "pdf" && cached?.type === "dataUrl" && cached.dataUrl) {
    return <PdfViewer dataUrl={cached.dataUrl} />;
  }

  if (kind === "office" && cached?.type === "dataUrl" && cached.dataUrl) {
    const ext = path.replace(/^.*\./, "").toLowerCase();
    if (ext === "docx") {
      return <DocxViewer dataUrl={cached.dataUrl} className="flex-1" />;
    }
    if (ext === "xlsx") {
      return (
        <ScrollArea className="min-h-0 flex-1 p-1.5">
          <XlsxViewer dataUrl={cached.dataUrl} />
        </ScrollArea>
      );
    }
    if (ext === "pptx" || ext === "ppt") {
      return (
        <ScrollArea className="min-h-0 flex-1 p-1.5">
          <PptxViewer dataUrl={cached.dataUrl} />
        </ScrollArea>
      );
    }
  }

  return (
    <div className="flex flex-1 items-center justify-center p-6 text-sm text-muted-foreground">
      {t("preview.loading")}
    </div>
  );
}
