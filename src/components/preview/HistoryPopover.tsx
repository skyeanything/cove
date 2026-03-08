import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Clock, RotateCcw } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";

interface VersionEntry {
  snapshotPath: string;
  timestampMs: number;
  sizeBytes: number;
}

interface HistoryPopoverProps {
  /** Absolute path of the file being edited (workspaceRoot + "/" + relativePath) */
  originalPath: string;
  /** Called with the restored content so the parent can load it into the editor */
  onRestore: (content: string) => void;
}

function formatTime(ms: number): string {
  const d = new Date(ms);
  return d.toLocaleString(undefined, {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  return `${(bytes / 1024).toFixed(1)} KB`;
}

export function HistoryPopover({ originalPath, onRestore }: HistoryPopoverProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [versions, setVersions] = useState<VersionEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [restoringPath, setRestoringPath] = useState<string | null>(null);

  const handleOpen = (isOpen: boolean) => {
    setOpen(isOpen);
    if (isOpen) {
      setLoading(true);
      void invoke<VersionEntry[]>("list_file_versions", { originalPath })
        .then(setVersions)
        .finally(() => setLoading(false));
    }
  };

  const handleRestore = (entry: VersionEntry) => {
    setRestoringPath(entry.snapshotPath);
    void invoke<string>("read_file_version", { snapshotPath: entry.snapshotPath })
      .then((content) => {
        onRestore(content);
        setOpen(false);
      })
      .finally(() => setRestoringPath(null));
  };

  return (
    <Popover open={open} onOpenChange={handleOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          title={t("preview.history")}
          className="flex items-center justify-center rounded-md p-1 text-foreground-secondary hover:bg-background-tertiary hover:text-foreground"
        >
          <Clock className="size-4" strokeWidth={1.5} />
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72 p-0">
        <div className="border-b border-border px-3 py-2 text-[12px] font-medium text-foreground">
          {t("preview.history")}
        </div>
        <div className="max-h-64 overflow-y-auto">
          {loading && (
            <div className="px-3 py-4 text-center text-[12px] text-foreground-tertiary">
              {t("preview.loading")}
            </div>
          )}
          {!loading && versions.length === 0 && (
            <div className="px-3 py-4 text-center text-[12px] text-foreground-tertiary">
              {t("preview.historyEmpty")}
            </div>
          )}
          {!loading &&
            versions.map((v) => (
              <div
                key={v.snapshotPath}
                className="flex items-center justify-between gap-2 px-3 py-2 hover:bg-background-tertiary"
              >
                <div className="min-w-0">
                  <div className="text-[12px] text-foreground">{formatTime(v.timestampMs)}</div>
                  <div className="text-[11px] text-foreground-tertiary">{formatSize(v.sizeBytes)}</div>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 shrink-0 px-2 text-[11px]"
                  disabled={restoringPath === v.snapshotPath}
                  onClick={() => handleRestore(v)}
                >
                  <RotateCcw className="mr-1 size-3" strokeWidth={1.5} />
                  {t("preview.restore")}
                </Button>
              </div>
            ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}
