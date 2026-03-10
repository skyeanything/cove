import { X, FolderOpen, FileText } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useFilePreviewStore } from "@/stores/filePreviewStore";

export function ContextAnchorBanner() {
  const { t } = useTranslation();
  const selectedEntries = useFilePreviewStore((s) => s.selectedEntries);
  const clearSelection = useFilePreviewStore((s) => s.clearSelection);

  if (selectedEntries.length === 0) return null;

  const firstEntry = selectedEntries[0];
  if (!firstEntry) return null;

  const label =
    selectedEntries.length === 1
      ? firstEntry.name
      : t("context.multipleItems", "{{count}} items selected", { count: selectedEntries.length });

  return (
    <div className="flex shrink-0 items-center gap-1.5 border-t border-border bg-background-secondary px-3 py-1.5">
      {selectedEntries.length === 1 ? (
        firstEntry.isDir ? (
          <FolderOpen className="size-3 shrink-0 text-foreground-secondary" strokeWidth={1.5} />
        ) : (
          <FileText className="size-3 shrink-0 text-foreground-secondary" strokeWidth={1.5} />
        )
      ) : (
        <FolderOpen className="size-3 shrink-0 text-foreground-secondary" strokeWidth={1.5} />
      )}
      <span className="shrink-0 text-[11px] text-foreground-secondary">
        {t("context.label", "Context")}
      </span>
      <span
        className="min-w-0 truncate text-[11px] font-medium text-foreground"
        title={selectedEntries.map((e) => e.path || e.name).join(", ")}
      >
        {label}
      </span>
      <button
        type="button"
        onClick={clearSelection}
        className="ml-auto rounded p-0.5 text-foreground-tertiary transition-colors hover:text-foreground"
        title={t("context.clear", "Clear")}
      >
        <X className="size-3" strokeWidth={1.5} />
      </button>
    </div>
  );
}
