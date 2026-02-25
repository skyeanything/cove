import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Code, Eye } from "lucide-react";
import { MarkdownContent } from "@/components/chat/MarkdownContent";
import { CodeViewer } from "@/components/preview/CodeViewer";
import { DocxViewer } from "@/components/preview/DocxViewer";
import { XlsxViewer } from "@/components/preview/XlsxViewer";
import { PptxViewer } from "@/components/preview/PptxViewer";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useFilePreviewStore } from "@/stores/filePreviewStore";
import { useWorkspaceStore } from "@/stores/workspaceStore";
import { getPreviewKind } from "@/lib/preview-types";
import { cn } from "@/lib/utils";
import { PreviewFileHeader, OpenExternallyButton, useDetectOfficeApps } from "./PreviewFileHeader";
import { usePreviewContent } from "@/hooks/usePreviewContent";

export function FilePreviewPanel() {
  const { t } = useTranslation();
  const selectedPath = useFilePreviewStore((s) => s.selectedPath);
  const previewError = useFilePreviewStore((s) => s.previewError);
  const workspaceRoot = useWorkspaceStore((s) => s.activeWorkspace?.path ?? null);
  const { cached, loading, error } = usePreviewContent(selectedPath, workspaceRoot);
  const [mdViewMode, setMdViewMode] = useState<"preview" | "code">("preview");
  const officeApps = useDetectOfficeApps();
  const headerProps = { workspaceRoot, officeApps };

  if (!selectedPath) {
    return (
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-background">
        <div className="flex flex-1 items-center justify-center p-6 text-center text-sm text-muted-foreground">
          {previewError === "file-deleted" ? t("preview.fileDeleted") : t("preview.selectFile")}
        </div>
      </div>
    );
  }

  const kind = getPreviewKind(selectedPath);

  if (loading) {
    return (
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-background">
        <PreviewFileHeader path={selectedPath} {...headerProps} />
        <div className="flex flex-1 items-center justify-center p-6 text-sm text-muted-foreground">
          {t("preview.loading")}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-background">
        <PreviewFileHeader path={selectedPath} {...headerProps} />
        <div className="flex flex-1 flex-col items-center justify-center gap-2 p-6 text-center text-sm text-destructive">
          <span>{error}</span>
        </div>
      </div>
    );
  }

  if (kind === "unsupported") {
    return (
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-background">
        <PreviewFileHeader path={selectedPath} {...headerProps} />
        <div className="flex flex-1 items-center justify-center p-6 text-center text-sm text-muted-foreground">
          {t("preview.unsupported")}
        </div>
      </div>
    );
  }

  // 有缓存且类型匹配
  if (kind === "txt" && cached?.type === "text" && cached.text !== undefined) {
    const lines = cached.text.split("\n");
    return (
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-background">
        <PreviewFileHeader path={selectedPath} {...headerProps} />
        <ScrollArea className="flex-1 p-1.5">
          <div className="file-preview-code">
            <pre className="m-0 overflow-auto pt-1 pb-1 text-[13px] leading-relaxed text-foreground">
              <code>
                {lines.map((line, i) => (
                  <span key={i} className="flex">
                    <span className="file-preview-line-num mr-3 inline-block w-6 shrink-0 select-none text-right">
                      {i + 1}
                    </span>
                    <span className="min-w-0 flex-1 whitespace-pre-wrap break-words">{line || "\n"}</span>
                  </span>
                ))}
              </code>
            </pre>
          </div>
        </ScrollArea>
      </div>
    );
  }

  if (kind === "md" && cached?.type === "text" && cached.text !== undefined) {
    return (
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-background">
        <div className="flex h-10 shrink-0 items-center justify-between gap-2 border-b border-border bg-background px-3">
          <div className="min-w-0 truncate text-[12px] text-foreground-secondary" title={selectedPath}>
            {selectedPath}
          </div>
          <div className="flex shrink-0 items-center gap-1">
          <OpenExternallyButton workspaceRoot={workspaceRoot} path={selectedPath} />
          <div className="flex rounded-lg border">
            <button
              type="button"
              onClick={() => setMdViewMode("preview")}
              className={cn(
                "flex items-center gap-1.5 rounded-md px-2 py-1 text-[10px]",
                mdViewMode === "preview"
                  ? "bg-background/80 text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              <Eye className="size-3.5" strokeWidth={1.5} />
              {t("preview.previewTab")}
            </button>
            <button
              type="button"
              onClick={() => setMdViewMode("code")}
              className={cn(
                "flex items-center gap-1.5 rounded-md px-2 py-1 text-[10px]",
                mdViewMode === "code"
                  ? "bg-background/80 text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              <Code className="size-3.5" strokeWidth={1.5} />
              {t("preview.codeTab")}
            </button>
          </div>
          </div>
        </div>
        <ScrollArea className="min-h-0 flex-1 p-1.5">
          {mdViewMode === "preview" ? (
            <MarkdownContent source={cached.text} className="text-[14px]" />
          ) : (
            <CodeViewer path={selectedPath} code={cached.text} className="file-preview-code" />
          )}
        </ScrollArea>
      </div>
    );
  }

  if (kind === "code" && cached?.type === "text" && cached.text !== undefined) {
    return (
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-background">
        <PreviewFileHeader path={selectedPath} {...headerProps} />
        <ScrollArea className="min-h-0 flex-1 p-1.5">
          <CodeViewer path={selectedPath} code={cached.text} className="file-preview-code" />
        </ScrollArea>
      </div>
    );
  }

  if (kind === "image" && cached?.type === "dataUrl" && cached.dataUrl) {
    return (
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-background">
        <PreviewFileHeader path={selectedPath} {...headerProps} />
        <ScrollArea className="min-h-0 flex-1 p-1.5">
          <div className="flex min-w-0 w-full justify-center">
            <img
              src={cached.dataUrl}
              alt={selectedPath}
              className="max-h-full w-full max-w-full object-contain"
            />
          </div>
        </ScrollArea>
      </div>
    );
  }

  // PDF
  if (kind === "pdf" && cached?.type === "dataUrl" && cached.dataUrl) {
    return (
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-background">
        <PreviewFileHeader path={selectedPath} {...headerProps} />
        <ScrollArea className="flex-1 p-1.5">
          <embed
            src={cached.dataUrl}
            type="application/pdf"
            className="h-[80vh] w-full"
            title="PDF"
          />
        </ScrollArea>
      </div>
    );
  }

  // XLSX / PPTX / DOCX 等 Office
  if (kind === "office" && cached?.type === "dataUrl" && cached.dataUrl) {
    const officeExt = selectedPath.replace(/^.*\./, "").toLowerCase();

    if (officeExt === "docx") {
      return (
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-background">
          <PreviewFileHeader path={selectedPath} {...headerProps} />
          <DocxViewer dataUrl={cached.dataUrl} className="flex-1" />
        </div>
      );
    }

    return (
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-background">
        <PreviewFileHeader path={selectedPath} {...headerProps} />
        <ScrollArea className="min-h-0 flex-1 p-1.5">
          {officeExt === "xlsx" && <XlsxViewer dataUrl={cached.dataUrl} />}
          {(officeExt === "pptx" || officeExt === "ppt") && <PptxViewer dataUrl={cached.dataUrl} />}
          {!["xlsx", "pptx", "ppt"].includes(officeExt) && (
            <div className="py-6 text-center text-sm text-muted-foreground">
              {t("preview.unsupported")}
            </div>
          )}
        </ScrollArea>
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-background">
      <div className="flex flex-1 items-center justify-center p-6 text-sm text-muted-foreground">
        {t("preview.loading")}
      </div>
    </div>
  );
}
