import { type KeyboardEvent, useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { cn } from "@/lib/utils";
import { getPreviewKind } from "@/lib/preview-types";
import { getFileIcon } from "@/lib/file-tree-icons";
import { useOpenFilePreview } from "@/hooks/useOpenFilePreview";
import { useFloatingPreview } from "@/hooks/useFloatingPreview";
import { useFilePreviewStore } from "@/stores/filePreviewStore";

function basename(path: string): string {
  const segments = path.replace(/\/+$/, "").split("/");
  return segments[segments.length - 1] || path;
}

/** Cache existence checks to avoid repeated FS calls */
const existsCache = new Map<string, boolean>();

/** @internal — exposed for test isolation */
export function clearExistsCache() {
  existsCache.clear();
}

function isBareFilename(path: string): boolean {
  return !path.includes("/");
}

export interface FilePathChipProps {
  /** Absolute or workspace-relative path */
  path: string;
  /** Display name (defaults to basename) */
  label?: string;
  /** Link-like style for tool headers (no border/bg) */
  compact?: boolean;
}

export function FilePathChip({ path, label, compact }: FilePathChipProps) {
  const { openPreview, openExternal } = useOpenFilePreview();
  const floatingPreview = useFloatingPreview();
  const workspaceRoot = useFilePreviewStore((s) => s.workspaceRoot);
  const displayName = label || basename(path);
  const kind = getPreviewKind(path);
  const isPreviewable = kind !== "unsupported";
  const bare = isBareFilename(path);

  const [verified, setVerified] = useState<boolean | null>(bare ? null : true);

  useEffect(() => {
    if (!bare) return;
    if (!workspaceRoot) {
      setVerified(false);
      return;
    }

    const cacheKey = `${workspaceRoot}:${path}`;
    const cached = existsCache.get(cacheKey);
    if (cached !== undefined) {
      setVerified(cached);
      return;
    }

    invoke("stat_file", { args: { workspaceRoot, path } })
      .then(() => {
        existsCache.set(cacheKey, true);
        setVerified(true);
      })
      .catch(() => {
        existsCache.set(cacheKey, false);
        setVerified(false);
      });
  }, [bare, path, workspaceRoot]);

  // Bare filename that doesn't exist or hasn't been verified: render as plain code
  if (bare && verified !== true) {
    return (
      <code className="rounded bg-background-tertiary px-1 py-0.5 font-mono text-[13px]">
        {displayName}
      </code>
    );
  }

  const handleClick = () => {
    if (kind === "unsupported") {
      openExternal(path);
    } else if (floatingPreview) {
      floatingPreview.openPopup(path);
    } else {
      openPreview(path);
    }
  };
  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      handleClick();
    }
  };

  if (compact) {
    return (
      <span
        role="button"
        tabIndex={0}
        onClick={handleClick}
        onKeyDown={handleKeyDown}
        className={cn(
          "inline-flex items-center gap-1 text-[13px] cursor-pointer",
          isPreviewable
            ? "text-foreground-secondary hover:text-accent hover:underline"
            : "text-foreground-tertiary hover:text-foreground-secondary hover:underline",
        )}
        title={path}
      >
        {getFileIcon(path, "size-3.5 shrink-0", 1.5)}
        <span className="min-w-0 truncate">{displayName}</span>
      </span>
    );
  }

  return (
    <span
      role="button"
      tabIndex={0}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      className="inline-flex items-center gap-1.5 rounded-md border border-border bg-background-secondary px-2 py-0.5 text-[12px] cursor-pointer transition-colors hover:border-accent/50 hover:bg-background-tertiary"
      title={path}
    >
      {getFileIcon(path, "size-3.5 shrink-0 text-foreground-secondary", 1.5)}
      <span className="min-w-0 truncate max-w-[200px]">{displayName}</span>
    </span>
  );
}
