import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { ChevronDown, Code, ExternalLink, Eye } from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
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

// ---------------------------------------------------------------------------
// Office app detection
// ---------------------------------------------------------------------------

interface OfficeAppInfo {
  id: string;
  name: string;
  path: string;
}

/** 检测已安装的 Office 应用（结果缓存） */
function useDetectOfficeApps() {
  const [apps, setApps] = useState<OfficeAppInfo[]>([]);
  const fetched = useRef(false);

  useEffect(() => {
    if (fetched.current) return;
    fetched.current = true;
    invoke<OfficeAppInfo[]>("detect_office_apps").then(setApps).catch(() => {});
  }, []);

  return apps;
}

/** 用外部应用打开文件 */
function useOpenExternally(workspaceRoot: string | null, path: string | null) {
  return useCallback(
    (openWith?: string) => {
      if (!workspaceRoot || !path) return;
      invoke("open_with_app", {
        args: { workspaceRoot, path, openWith: openWith ?? null },
      }).catch((e) => {
        console.error("open_with_app failed:", e);
      });
    },
    [workspaceRoot, path],
  );
}

// ---------------------------------------------------------------------------
// Office 文件扩展名 → 匹配的 app
// ---------------------------------------------------------------------------

const OFFICE_EXT_APP_MAP: Record<string, string[]> = {
  docx: ["wpsoffice", "Microsoft Word", "LibreOffice"],
  xlsx: ["wpsoffice", "Microsoft Excel", "LibreOffice"],
  pptx: ["wpsoffice", "Microsoft PowerPoint", "LibreOffice"],
  ppt: ["wpsoffice", "Microsoft PowerPoint", "LibreOffice"],
};

function getMatchingApps(path: string, allApps: OfficeAppInfo[]): OfficeAppInfo[] {
  const ext = path.replace(/^.*\./, "").toLowerCase();
  const ids = OFFICE_EXT_APP_MAP[ext];
  if (!ids) return [];
  return allApps.filter((a) => ids.includes(a.id));
}

// ---------------------------------------------------------------------------
// 小型"外部打开"按钮（用于非 PreviewFileHeader 的场景，如 MD 头部）
// ---------------------------------------------------------------------------

function OpenExternallyButton({ workspaceRoot, path }: { workspaceRoot: string | null; path: string }) {
  const { t } = useTranslation();
  const openExternally = useOpenExternally(workspaceRoot, path);
  return (
    <button
      type="button"
      onClick={() => openExternally()}
      className="rounded-md p-1 text-muted-foreground hover:bg-background-tertiary hover:text-foreground"
      title={t("preview.openDefault")}
    >
      <ExternalLink className="size-3" strokeWidth={1.5} />
    </button>
  );
}

// ---------------------------------------------------------------------------
// PreviewFileHeader（含"外部打开"按钮）
// ---------------------------------------------------------------------------

function PreviewFileHeader({
  path,
  workspaceRoot,
  officeApps,
}: {
  path: string;
  workspaceRoot: string | null;
  officeApps: OfficeAppInfo[];
}) {
  const { t } = useTranslation();
  const openExternally = useOpenExternally(workspaceRoot, path);
  const matchingApps = getMatchingApps(path, officeApps);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // 点击外部关闭下拉
  useEffect(() => {
    if (!dropdownOpen) return;
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [dropdownOpen]);

  return (
    <div className="flex h-10 shrink-0 items-center justify-between gap-2 border-b border-border bg-background px-3">
      <div className="file-preview-header-path min-w-0 truncate text-[13px] text-foreground-secondary" title={path}>
        {path}
      </div>
      <div className="relative flex shrink-0 items-center gap-1" ref={dropdownRef}>
        {matchingApps.length > 0 && matchingApps[0] ? (
          <>
            {/* 主按钮：用第一个匹配的 app 打开 */}
            <button
              type="button"
              onClick={() => openExternally(matchingApps[0]!.id)}
              className="flex items-center gap-1 rounded-md px-2 py-1 text-[11px] text-muted-foreground hover:bg-background-tertiary hover:text-foreground"
              title={t("preview.openInApp", { app: matchingApps[0]!.name })}
            >
              <ExternalLink className="size-3" strokeWidth={1.5} />
              <span className="whitespace-nowrap">
                {t("preview.openInApp", { app: matchingApps[0]!.name })}
              </span>
            </button>
            {/* 有多个 app 时显示下拉箭头 */}
            {matchingApps.length > 1 && (
              <button
                type="button"
                onClick={() => setDropdownOpen((v) => !v)}
                className="rounded-md p-1 text-muted-foreground hover:bg-background-tertiary hover:text-foreground"
              >
                <ChevronDown className="size-3" strokeWidth={1.5} />
              </button>
            )}
            {/* 下拉菜单 */}
            {dropdownOpen && matchingApps.length > 1 && (
              <div className="absolute top-full right-0 z-50 mt-1 min-w-[160px] rounded-lg border border-border bg-background py-1 shadow-lg">
                {matchingApps.map((app) => (
                  <button
                    key={app.id}
                    type="button"
                    onClick={() => {
                      openExternally(app.id);
                      setDropdownOpen(false);
                    }}
                    className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-[12px] text-foreground hover:bg-background-tertiary"
                  >
                    <ExternalLink className="size-3 shrink-0 text-muted-foreground" strokeWidth={1.5} />
                    {app.name}
                  </button>
                ))}
                <div className="my-1 border-t border-border" />
                <button
                  type="button"
                  onClick={() => {
                    openExternally();
                    setDropdownOpen(false);
                  }}
                  className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-[12px] text-foreground hover:bg-background-tertiary"
                >
                  <ExternalLink className="size-3 shrink-0 text-muted-foreground" strokeWidth={1.5} />
                  {t("preview.openDefault")}
                </button>
              </div>
            )}
          </>
        ) : (
          /* 非 Office 或无检测到的 app：仅显示默认打开按钮 */
          <button
            type="button"
            onClick={() => openExternally()}
            className="file-preview-header-path flex items-center gap-1 rounded-md px-2 py-1 text-[11px] text-muted-foreground hover:bg-background-tertiary hover:text-foreground"
            title={t("preview.openDefault")}
          >
            <ExternalLink className="size-3" strokeWidth={1.5} />
          </button>
        )}
      </div>
    </div>
  );
}

function isTextKind(k: string): k is "txt" | "md" | "code" {
  return k === "txt" || k === "md" || k === "code";
}
function isDataUrlKind(k: string): k is "image" | "pdf" | "office" {
  return k === "image" || k === "pdf" || k === "office";
}

function usePreviewContent(path: string | null, workspaceRoot: string | null) {
  const contentCache = useFilePreviewStore((s) => s.contentCache);
  const setContent = useFilePreviewStore((s) => s.setContent);
  const invalidate = useFilePreviewStore((s) => s.invalidate);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!path || !workspaceRoot) {
      setError(null);
      return;
    }
    /* 从 store 快照读取，避免把 contentCache 放进 deps 导致无限循环 */
    const cached = useFilePreviewStore.getState().contentCache[path];
    if (cached) {
      setLoading(false);
      setError(null);
      return;
    }
    const kind = getPreviewKind(path);
    setLoading(true);
    setError(null);

    const handleError = (e: unknown) => {
      let msg: string;
      if (typeof e === "string") {
        msg = e;
      } else if (e && typeof e === "object") {
        const fe = e as { kind?: string; message?: string };
        msg = fe.message || fe.kind || "读取失败";
      } else {
        msg = String(e);
      }
      console.error("[FilePreview] load failed:", path, e);
      setError(msg);
      invalidate(path);
    };

    if (isTextKind(kind)) {
      invoke<string>("read_file_raw", { args: { workspaceRoot, path } })
        .then((text) => {
          setContent(path, { path, type: "text", text, mtime: Date.now() });
        })
        .catch(handleError)
        .finally(() => setLoading(false));
    } else if (isDataUrlKind(kind)) {
      invoke<{ dataUrl: string }>("read_file_as_data_url", { args: { workspaceRoot, path } })
        .then(({ dataUrl }) => {
          setContent(path, { path, type: "dataUrl", dataUrl, mtime: Date.now() });
        })
        .catch(handleError)
        .finally(() => setLoading(false));
    } else {
      setLoading(false);
      setError(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path, workspaceRoot, setContent, invalidate]);

  return { cached: path ? contentCache[path] : null, loading, error };
}

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
