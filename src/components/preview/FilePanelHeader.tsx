import { useTranslation } from "react-i18next";
import { useLayoutStore } from "@/stores/layoutStore";
import { Separator } from "@/components/ui/separator";
import { PanelLeftClose, PanelLeft, X } from "lucide-react";

/** Header bar shared by the file tree and preview columns */
export function FilePanelHeader() {
  const { t } = useTranslation();
  const toggleFilePanel = useLayoutStore((s) => s.toggleFilePanel);
  const fileTreeOpen = useLayoutStore((s) => s.fileTreeOpen);
  const toggleFileTree = useLayoutStore((s) => s.toggleFileTree);

  return (
    <div className="shrink-0">
      <div
        data-tauri-drag-region
        className="flex h-[52px] items-center justify-between gap-2 px-3"
      >
        <span className="text-[13px] font-semibold text-foreground-secondary">
          {t("preview.workspace")}
        </span>
        <div className="flex items-center gap-0.5">
          <button
            type="button"
            onClick={toggleFileTree}
            className="rounded p-1 text-muted-foreground hover:bg-background-tertiary hover:text-foreground transition-colors duration-150"
            title={t(fileTreeOpen ? "preview.collapseExplorer" : "preview.expandExplorer")}
          >
            {fileTreeOpen ? (
              <PanelLeftClose className="size-4" strokeWidth={1.5} />
            ) : (
              <PanelLeft className="size-4" strokeWidth={1.5} />
            )}
          </button>
          <button
            type="button"
            onClick={toggleFilePanel}
            className="rounded p-1 text-muted-foreground hover:bg-background-tertiary hover:text-foreground transition-colors duration-150"
            title={t("preview.closeFilePanel")}
          >
            <X className="size-4" strokeWidth={1.5} />
          </button>
        </div>
      </div>
      <Separator />
    </div>
  );
}
