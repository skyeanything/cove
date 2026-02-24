import { useTranslation } from "react-i18next";
import { useLayoutStore } from "@/stores/layoutStore";
import { Separator } from "@/components/ui/separator";
import { X } from "lucide-react";

/** 目录树与预览共用的「文件」标题栏，贯通两栏 */
export function FilePanelHeader() {
  const { t } = useTranslation();
  const toggleFilePanel = useLayoutStore((s) => s.toggleFilePanel);

  return (
    <div className="shrink-0">
      <div
        data-tauri-drag-region
        className="flex h-[52px] items-center justify-between gap-2 px-3"
      >
        <span className="text-[13px] font-semibold text-foreground-secondary">
          {t("preview.workspace")}
        </span>
        <button
          type="button"
          onClick={toggleFilePanel}
          className="rounded p-1 text-muted-foreground hover:bg-background-tertiary hover:text-foreground transition-colors duration-150"
          title={t("preview.closeFilePanel")}
        >
          <X className="size-4" strokeWidth={1.5} />
        </button>
      </div>
      <Separator />
    </div>
  );
}
