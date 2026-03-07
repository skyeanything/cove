import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useTranslation } from "react-i18next";
import { Folder } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useFilePreviewStore } from "@/stores/filePreviewStore";
import { getFileIcon } from "@/lib/file-tree-icons";
import type { ListDirEntry } from "./FileTreeItem";

interface DirPreviewProps {
  dirPath: string;
  workspaceRoot: string;
}

export function DirPreview({ dirPath, workspaceRoot }: DirPreviewProps) {
  const { t } = useTranslation();
  const [entries, setEntries] = useState<ListDirEntry[] | null>(null);
  const setSelected = useFilePreviewStore((s) => s.setSelected);

  useEffect(() => {
    setEntries(null);
    if (!workspaceRoot) return;
    invoke<ListDirEntry[]>("list_dir", {
      args: { workspaceRoot, path: dirPath || "", includeHidden: false },
    })
      .then(setEntries)
      .catch(() => setEntries([]));
  }, [workspaceRoot, dirPath]);

  const displayName = dirPath
    ? (dirPath.split("/").pop() ?? dirPath)
    : (workspaceRoot.split("/").pop() ?? workspaceRoot);

  const dirs = entries?.filter((e) => e.isDir) ?? [];
  const files = entries?.filter((e) => !e.isDir) ?? [];
  const sorted = [...dirs, ...files];

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-background">
      {/* Header */}
      <div className="flex h-8 shrink-0 items-center gap-2 border-b border-border px-3">
        <Folder className="size-4 shrink-0 text-foreground-secondary" strokeWidth={1.5} />
        <span
          className="min-w-0 truncate text-[12px] text-foreground-secondary"
          title={dirPath || workspaceRoot}
        >
          {displayName}
        </span>
        {entries !== null && (
          <span className="ml-auto shrink-0 text-[11px] text-foreground-tertiary">
            {entries.length} {t("preview.dirItems", "items")}
          </span>
        )}
      </div>

      <ScrollArea className="min-h-0 flex-1">
        {entries === null ? (
          <div className="py-6 text-center text-[13px] text-foreground-tertiary">
            {t("preview.loading")}
          </div>
        ) : sorted.length === 0 ? (
          <div className="py-6 text-center text-[13px] text-foreground-tertiary">
            {t("preview.emptyDir")}
          </div>
        ) : (
          <div className="p-1.5">
            {sorted.map((entry) => (
              <button
                key={entry.path}
                type="button"
                onClick={() => {
                  if (!entry.isDir) {
                    useFilePreviewStore.getState().setSelectedWorkspaceRoot(workspaceRoot || null);
                    setSelected(entry.path, false);
                  }
                }}
                className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left hover:bg-background-tertiary"
              >
                {entry.isDir ? (
                  <Folder
                    className="size-4 shrink-0 text-foreground-secondary"
                    strokeWidth={1.5}
                  />
                ) : (
                  getFileIcon(entry.path, "size-4 shrink-0 text-foreground-secondary", 1.5)
                )}
                <span className="min-w-0 flex-1 truncate text-[13px] text-foreground">
                  {entry.name}
                </span>
              </button>
            ))}
          </div>
        )}
      </ScrollArea>
    </div>
  );
}
