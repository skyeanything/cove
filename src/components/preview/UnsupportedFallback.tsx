import { useEffect, useState } from "react";
import { ExternalLink, FileQuestion } from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import { useTranslation } from "react-i18next";
import { getClassWithColor } from "file-icons-js";

interface StatResult {
  size: number;
  mtimeSecs: number;
  isDir: boolean;
  isBinary: boolean;
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

function formatDate(epochSecs: number): string {
  if (!epochSecs) return "";
  return new Date(epochSecs * 1000).toLocaleString();
}

interface UnsupportedFallbackProps {
  path: string;
  workspaceRoot: string | null;
  onOpenExternal: () => void;
}

export function UnsupportedFallback({ path, workspaceRoot, onOpenExternal }: UnsupportedFallbackProps) {
  const { t } = useTranslation();
  const [stat, setStat] = useState<StatResult | null>(null);

  const filename = path.split("/").pop() ?? path;
  const ext = filename.includes(".") ? filename.replace(/^.*\./, "").toLowerCase() : "";
  const iconClass = getClassWithColor(`file.${ext || "txt"}`) || "text-icon";

  useEffect(() => {
    // stat_file requires workspace-relative paths; skip for absolute paths
    if (!workspaceRoot || path.startsWith("/")) return;
    invoke<StatResult>("stat_file", { args: { workspaceRoot, path } })
      .then(setStat)
      .catch(() => {});
  }, [path, workspaceRoot]);

  return (
    <div className="flex flex-1 items-center justify-center p-6">
      <div className="flex flex-col items-center gap-4 text-center">
        <div className="flex size-16 items-center justify-center rounded-xl bg-background-tertiary">
          {ext ? (
            <i className={`icon ${iconClass} text-2xl`} aria-hidden />
          ) : (
            <FileQuestion className="size-8 text-muted-foreground" strokeWidth={1.5} />
          )}
        </div>

        <div className="space-y-1">
          <p className="text-sm font-medium text-foreground">{filename}</p>
          {ext && (
            <span className="inline-block rounded-md bg-background-tertiary px-2 py-0.5 text-[11px] font-medium uppercase text-muted-foreground">
              {ext}
            </span>
          )}
        </div>

        {stat && (
          <div className="space-y-0.5 text-[12px] text-muted-foreground">
            <p>{formatFileSize(stat.size)}</p>
            {stat.mtimeSecs > 0 && <p>{formatDate(stat.mtimeSecs)}</p>}
          </div>
        )}

        <button
          type="button"
          onClick={onOpenExternal}
          className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-[12px] text-foreground-secondary hover:bg-background-tertiary hover:text-foreground"
        >
          <ExternalLink className="size-3.5" strokeWidth={1.5} />
          {t("preview.openDefault")}
        </button>
      </div>
    </div>
  );
}
