// FILE_SIZE_EXCEPTION: complex editor + auto-save + version history logic across multiple file types
import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Code, Eye, Languages, PanelLeftClose, PanelLeft } from "lucide-react";
import { useLayoutStore } from "@/stores/layoutStore";
import { invoke } from "@tauri-apps/api/core";
import { MarkdownContent } from "@/components/chat/MarkdownContent";
import { CodeViewer } from "@/components/preview/CodeViewer";
import { CsvViewer } from "@/components/preview/CsvViewer";
import { HtmlViewer } from "@/components/preview/HtmlViewer";
import { ImageViewer } from "@/components/preview/ImageViewer";
import { PdfViewer } from "@/components/preview/PdfViewer";
import { DocxViewer } from "@/components/preview/DocxViewer";
import { XlsxViewer } from "@/components/preview/XlsxViewer";
import { PptxViewer } from "@/components/preview/PptxViewer";
import { UnsupportedFallback } from "@/components/preview/UnsupportedFallback";
import { TextEditor } from "@/components/preview/TextEditor";
import { HistoryPopover } from "@/components/preview/HistoryPopover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useFilePreviewStore } from "@/stores/filePreviewStore";
import { useWorkspaceStore } from "@/stores/workspaceStore";
import { getPreviewKind } from "@/lib/preview-types";
import { DirPreview } from "./DirPreview";
import { cn } from "@/lib/utils";
import {
  PreviewFileHeader,
  OpenExternallyButton,
  useDetectOfficeApps,
  useOpenExternally,
} from "./PreviewFileHeader";
import { usePreviewContent } from "@/hooks/usePreviewContent";
import { useTranslatePreview } from "@/hooks/useTranslatePreview";

const AUTO_SAVE_DELAY_MS = 1500;
const SAVED_INDICATOR_DURATION_MS = 3000;

type AutoSaveStatus = "idle" | "saving" | "saved" | "error";

// ── Shared tab bar (no Save/Cancel — auto-save handles persistence) ───────────

function ViewTabBar({
  viewMode,
  onPreview,
  onCode,
  previewLabel,
}: {
  viewMode: "preview" | "code";
  onPreview: () => void;
  onCode: () => void;
  previewLabel: string;
}) {
  const { t } = useTranslation();
  const tabCls = (active: boolean) =>
    cn(
      "flex items-center gap-1.5 rounded-md px-2 py-1 text-[10px]",
      active ? "bg-background/80 text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
    );
  return (
    <div className="flex rounded-lg border">
      <button type="button" onClick={onPreview} className={tabCls(viewMode === "preview")}>
        <Eye className="size-3.5" strokeWidth={1.5} />
        {previewLabel}
      </button>
      <button type="button" onClick={onCode} className={tabCls(viewMode === "code")}>
        <Code className="size-3.5" strokeWidth={1.5} />
        {t("preview.codeTab")}
      </button>
    </div>
  );
}

// ── Translate button ──────────────────────────────────────────────────────────

function TranslateButton({
  isActive,
  loading,
  onClick,
}: {
  isActive: boolean;
  loading: boolean;
  onClick: () => void;
}) {
  const { t } = useTranslation();
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={loading}
      title={isActive ? t("preview.translateOff") : t("preview.translateOn")}
      className={cn(
        "flex items-center gap-1 rounded-md px-2 py-1 text-[11px] transition-colors",
        isActive
          ? "bg-accent text-accent-foreground"
          : "text-muted-foreground hover:bg-background-tertiary hover:text-foreground",
        loading && "opacity-60",
      )}
    >
      <Languages className="size-3" strokeWidth={1.5} />
      {loading
        ? t("preview.translating")
        : isActive
          ? t("preview.showOriginal")
          : t("preview.translate")}
    </button>
  );
}

// ── Main panel ───────────────────────────────────────────────────────────────

export function FilePreviewPanel() {
  const { t } = useTranslation();
  const activePage = useLayoutStore((s) => s.activePage);
  const wsFileTreeVisible = useLayoutStore((s) => s.wsFileTreeVisible);
  const toggleWsFileTree = useLayoutStore((s) => s.toggleWsFileTree);
  const selectedPath = useFilePreviewStore((s) => s.selectedPath);
  const selectedIsDir = useFilePreviewStore((s) => s.selectedIsDir);
  const previewError = useFilePreviewStore((s) => s.previewError);
  const selectedWorkspaceRoot = useFilePreviewStore((s) => s.selectedWorkspaceRoot);
  const activeWorkspaceRoot = useWorkspaceStore((s) => s.activeWorkspace?.path ?? null);
  const workspaceRoot = selectedWorkspaceRoot ?? activeWorkspaceRoot;
  const { cached, loading, error } = usePreviewContent(selectedPath, workspaceRoot);

  const [viewMode, setViewMode] = useState<"preview" | "code">("preview");
  const [draft, setDraft] = useState<string | null>(null);
  const [autoSaveStatus, setAutoSaveStatus] = useState<AutoSaveStatus>("idle");
  const [autoSaveError, setAutoSaveError] = useState<string | null>(null);
  const { isTranslateMode, translating, translated, toggleTranslate, reset: resetTranslate } =
    useTranslatePreview();

  // Refs for cleanup effect (stale closure avoidance)
  const autoSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const savedIndicatorTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const draftRef = useRef<string | null>(null);
  const workspaceRootRef = useRef<string | null>(null);
  const selectedPathRef = useRef<string | null>(null);
  // Only true when the user has actually typed (not just opened the code tab)
  const isDirtyRef = useRef(false);

  // Keep refs in sync with state
  useEffect(() => { draftRef.current = draft; }, [draft]);
  useEffect(() => { workspaceRootRef.current = workspaceRoot; }, [workspaceRoot]);
  useEffect(() => { selectedPathRef.current = selectedPath; }, [selectedPath]);

  // Flush pending auto-save and save a history snapshot when leaving a file
  useEffect(() => {
    return () => {
      if (autoSaveTimer.current) {
        clearTimeout(autoSaveTimer.current);
        autoSaveTimer.current = null;
      }
      if (savedIndicatorTimer.current) {
        clearTimeout(savedIndicatorTimer.current);
        savedIndicatorTimer.current = null;
      }
      const currentDraft = draftRef.current;
      const root = workspaceRootRef.current;
      const path = selectedPathRef.current;
      if (isDirtyRef.current && currentDraft !== null && root && path) {
        // Flush draft to disk immediately (fire-and-forget)
        void invoke("write_file", { args: { workspaceRoot: root, path, content: currentDraft } });
        // Save history snapshot
        const absPath = `${root}/${path}`;
        void invoke("save_file_version", { originalPath: absPath, content: currentDraft });
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedPath]);

  // Reset edit state when switching to a different file
  useEffect(() => {
    setViewMode("preview");
    setDraft(null);
    setAutoSaveStatus("idle");
    setAutoSaveError(null);
    isDirtyRef.current = false;
    resetTranslate();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedPath]);

  const savedText = cached?.type === "text" ? (cached.text ?? "") : "";

  // Debounced auto-save — only fires if content actually changed
  const triggerAutoSave = useCallback(
    (content: string) => {
      if (!workspaceRoot || !selectedPath) return;
      if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
      if (savedIndicatorTimer.current) clearTimeout(savedIndicatorTimer.current);
      autoSaveTimer.current = setTimeout(() => {
        setAutoSaveStatus("saving");
        void invoke("write_file", { args: { workspaceRoot, path: selectedPath, content } })
          .then(() => {
            setAutoSaveStatus("saved");
            savedIndicatorTimer.current = setTimeout(
              () => setAutoSaveStatus("idle"),
              SAVED_INDICATOR_DURATION_MS,
            );
          })
          .catch((err: unknown) => {
            setAutoSaveError(String(err));
            setAutoSaveStatus("error");
          });
      }, AUTO_SAVE_DELAY_MS);
    },
    [workspaceRoot, selectedPath],
  );

  const handleChange = useCallback(
    (newValue: string) => {
      isDirtyRef.current = true;
      setDraft(newValue);
      triggerAutoSave(newValue);
    },
    [triggerAutoSave],
  );

  const switchToCode = () => {
    setDraft((prev) => prev ?? savedText);
    setViewMode("code");
  };

  const switchToPreview = () => setViewMode("preview");

  const handleRestore = useCallback(
    (content: string) => {
      setDraft(content);
      triggerAutoSave(content);
    },
    [triggerAutoSave],
  );

  // Auto-save status text for TextEditor footer
  const statusMessage =
    autoSaveStatus === "saving"
      ? t("preview.autoSaving")
      : autoSaveStatus === "saved"
        ? t("preview.autoSaved")
        : autoSaveStatus === "error"
          ? (autoSaveError ?? t("preview.autoSaveError"))
          : null;
  const statusError = autoSaveStatus === "error";

  // Absolute path for history API
  const absolutePath = workspaceRoot && selectedPath ? `${workspaceRoot}/${selectedPath}` : "";

  const officeApps = useDetectOfficeApps();
  const openExternally = useOpenExternally(workspaceRoot, selectedPath);

  const headerProps = { workspaceRoot, officeApps };

  const fileTreeToggle = activePage === "workspace" ? (
    <button
      type="button"
      onClick={toggleWsFileTree}
      title={wsFileTreeVisible ? "收起文件树" : "展开文件树"}
      className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-background-tertiary hover:text-foreground"
    >
      {wsFileTreeVisible
        ? <PanelLeftClose className="size-3.5" strokeWidth={1.5} />
        : <PanelLeft className="size-3.5" strokeWidth={1.5} />
      }
    </button>
  ) : null;

  if (!selectedPath) {
    return (
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-background">
        {activePage === "workspace" && (
          <div className="flex h-8 shrink-0 items-center border-b border-border px-3">
            {fileTreeToggle}
          </div>
        )}
        <div className="flex flex-1 items-center justify-center p-6 text-center text-sm text-muted-foreground">
          {previewError === "file-deleted" ? t("preview.fileDeleted") : t("preview.selectFile")}
        </div>
      </div>
    );
  }

  if (selectedIsDir) {
    return <DirPreview dirPath={selectedPath} workspaceRoot={workspaceRoot ?? ""} />;
  }

  const kind = getPreviewKind(selectedPath);

  if (loading) {
    return (
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-background">
        <PreviewFileHeader path={selectedPath} {...headerProps} leftActions={fileTreeToggle} />
        <div className="flex flex-1 items-center justify-center p-6 text-sm text-muted-foreground">
          {t("preview.loading")}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-background">
        <PreviewFileHeader path={selectedPath} {...headerProps} leftActions={fileTreeToggle} />
        <div className="flex flex-1 flex-col items-center justify-center gap-2 p-6 text-center text-sm text-destructive">
          <span>{error}</span>
        </div>
      </div>
    );
  }

  if (kind === "unsupported") {
    return (
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-background">
        <PreviewFileHeader path={selectedPath} {...headerProps} leftActions={fileTreeToggle} />
        <UnsupportedFallback
          path={selectedPath}
          workspaceRoot={workspaceRoot}
          onOpenExternal={() => openExternally()}
        />
      </div>
    );
  }

  // ── txt: always TextEditor, auto-save, history in header ─────────────────
  if (kind === "txt" && cached?.type === "text" && cached.text !== undefined) {
    const txtDraft = draft ?? cached.text;
    return (
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-background">
        <PreviewFileHeader path={selectedPath} {...headerProps} leftActions={fileTreeToggle}>
          {absolutePath && (
            <HistoryPopover originalPath={absolutePath} onRestore={handleRestore} />
          )}
          <TranslateButton
            isActive={isTranslateMode}
            loading={translating}
            onClick={() => toggleTranslate(txtDraft)}
          />
        </PreviewFileHeader>
        {isTranslateMode ? (
          <ScrollArea className="min-h-0 flex-1 p-4">
            <MarkdownContent source={translated ?? ""} className="text-[14px]" />
          </ScrollArea>
        ) : (
          <TextEditor
            value={txtDraft}
            onChange={handleChange}
            statusMessage={statusMessage}
            statusError={statusError}
            className="flex-1"
          />
        )}
      </div>
    );
  }

  if (kind === "csv" && cached?.type === "text" && cached.text !== undefined) {
    return (
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-background">
        <PreviewFileHeader path={selectedPath} {...headerProps} leftActions={fileTreeToggle} />
        <ScrollArea className="min-h-0 flex-1 p-4">
          <CsvViewer text={cached.text} />
        </ScrollArea>
      </div>
    );
  }

  if (kind === "html" && cached?.type === "text" && cached.text !== undefined) {
    return (
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-background">
        <PreviewFileHeader path={selectedPath} {...headerProps} leftActions={fileTreeToggle} />
        <HtmlViewer code={cached.text} path={selectedPath} />
      </div>
    );
  }

  // ── md: 预览 tab = MarkdownContent (live draft), 源码 tab = TextEditor ────
  if (kind === "md" && cached?.type === "text" && cached.text !== undefined) {
    const mdDisplayText = draft ?? cached.text;
    return (
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-background">
        <div className="flex h-8 shrink-0 items-center justify-between gap-2 border-b border-border bg-background px-3">
          <div className="flex min-w-0 items-center gap-1">
            {fileTreeToggle}
            <div className="min-w-0 truncate text-[12px] text-foreground-secondary" title={selectedPath}>
              {selectedPath}
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <OpenExternallyButton workspaceRoot={workspaceRoot} path={selectedPath} />
            {absolutePath && (
              <HistoryPopover originalPath={absolutePath} onRestore={handleRestore} />
            )}
            <TranslateButton
              isActive={isTranslateMode}
              loading={translating}
              onClick={() => toggleTranslate(mdDisplayText)}
            />
            <ViewTabBar
              viewMode={viewMode}
              onPreview={switchToPreview}
              onCode={switchToCode}
              previewLabel={t("preview.previewTab")}
            />
          </div>
        </div>
        {viewMode === "code" ? (
          <TextEditor
            value={draft ?? cached.text}
            onChange={handleChange}
            statusMessage={statusMessage}
            statusError={statusError}
            className="flex-1"
          />
        ) : isTranslateMode ? (
          <ScrollArea className="min-h-0 flex-1 p-4">
            <MarkdownContent source={translated ?? ""} className="text-[14px]" />
          </ScrollArea>
        ) : (
          <ScrollArea className="min-h-0 flex-1 p-4">
            <MarkdownContent source={mdDisplayText} className="text-[14px]" />
          </ScrollArea>
        )}
      </div>
    );
  }

  // ── code: 预览 tab = CodeViewer (read-only), 源码 tab = TextEditor ─────────
  if (kind === "code" && cached?.type === "text" && cached.text !== undefined) {
    return (
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-background">
        <div className="flex h-8 shrink-0 items-center justify-between gap-2 border-b border-border bg-background px-3">
          <div className="flex min-w-0 items-center gap-1">
            {fileTreeToggle}
            <div className="file-preview-header-path min-w-0 text-[13px]">
              <OpenExternallyButton workspaceRoot={workspaceRoot} path={selectedPath} />
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            {absolutePath && (
              <HistoryPopover originalPath={absolutePath} onRestore={handleRestore} />
            )}
            <TranslateButton
              isActive={isTranslateMode}
              loading={translating}
              onClick={() => toggleTranslate(draft ?? cached.text ?? "")}
            />
            <ViewTabBar
              viewMode={viewMode}
              onPreview={switchToPreview}
              onCode={switchToCode}
              previewLabel={t("preview.previewTab")}
            />
          </div>
        </div>
        {viewMode === "code" ? (
          <TextEditor
            value={draft ?? cached.text}
            onChange={handleChange}
            statusMessage={statusMessage}
            statusError={statusError}
            className="flex-1"
          />
        ) : isTranslateMode ? (
          <ScrollArea className="min-h-0 flex-1 p-4">
            <MarkdownContent source={translated ?? ""} className="text-[14px]" />
          </ScrollArea>
        ) : (
          <ScrollArea className="min-h-0 flex-1 p-4">
            <CodeViewer path={selectedPath} code={draft ?? cached.text} className="file-preview-code" />
          </ScrollArea>
        )}
      </div>
    );
  }

  if (kind === "image" && cached?.type === "dataUrl" && cached.dataUrl) {
    return (
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-background">
        <PreviewFileHeader path={selectedPath} {...headerProps} leftActions={fileTreeToggle} />
        <ImageViewer src={cached.dataUrl} alt={selectedPath} />
      </div>
    );
  }

  if (kind === "pdf" && cached?.type === "dataUrl" && cached.dataUrl) {
    return (
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-background">
        <PreviewFileHeader path={selectedPath} {...headerProps} leftActions={fileTreeToggle} />
        <PdfViewer dataUrl={cached.dataUrl} />
      </div>
    );
  }

  if (kind === "office" && cached?.type === "dataUrl" && cached.dataUrl) {
    const officeExt = selectedPath.replace(/^.*\./, "").toLowerCase();

    if (officeExt === "docx") {
      return (
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-background">
          <PreviewFileHeader path={selectedPath} {...headerProps} leftActions={fileTreeToggle} />
          <DocxViewer dataUrl={cached.dataUrl} className="flex-1" />
        </div>
      );
    }

    return (
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-background">
        <PreviewFileHeader path={selectedPath} {...headerProps} leftActions={fileTreeToggle} />
        <ScrollArea className="min-h-0 flex-1 p-4">
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
