import { useState } from "react";
import { FolderOpen, AlertCircle } from "lucide-react";
import { openPath, revealItemInDir } from "@tauri-apps/plugin-opener";
import { getClassWithColor } from "file-icons-js";
import { getFileExtension } from "@/lib/attachment-utils";
import {
  useDetectOfficeApps,
  getMatchingApps,
} from "@/components/preview/PreviewFileHeader";

interface FileChipProps {
  /** 绝对文件路径 */
  path: string;
  /** 展示文件名（已解码） */
  name: string;
}

/**
 * 内联文件 chip，用于 chat 消息中 file:// 链接的渲染。
 *
 * 两个交互区域：
 *   左侧（文件名）— 用 Office 应用或系统默认程序打开文件
 *   右侧（目录名）— 在访达中定位到文件所在目录
 */
export function FileChip({ path, name }: FileChipProps) {
  const ext = getFileExtension(name || path);
  const iconClass = getClassWithColor(`file.${ext || "txt"}`) || "text-icon";

  const officeApps = useDetectOfficeApps();
  const matchingApps = getMatchingApps(path, officeApps);

  // 仅取父目录最后一段，保持简洁
  const parentDir = path.split("/").slice(0, -1).pop() ?? "";

  const [openErr, setOpenErr] = useState(false);
  const [revealErr, setRevealErr] = useState(false);

  const flashError = (setter: (v: boolean) => void) => {
    setter(true);
    setTimeout(() => setter(false), 2000);
  };

  const handleOpenFile = (e: React.MouseEvent) => {
    e.stopPropagation();
    const fallback = () =>
      openPath(path).catch((err) => {
        console.error("[FileChip] openPath failed:", err);
        flashError(setOpenErr);
      });
    if (matchingApps.length > 0 && matchingApps[0]) {
      openPath(path, matchingApps[0].id).catch((err) => {
        console.error("[FileChip] openPath with app failed, fallback:", err);
        fallback();
      });
    } else {
      fallback();
    }
  };

  const handleRevealDir = (e: React.MouseEvent) => {
    e.stopPropagation();
    revealItemInDir(path).catch((err) => {
      console.error("[FileChip] revealItemInDir failed:", err);
      flashError(setRevealErr);
    });
  };

  return (
    <span className="inline-flex items-center overflow-hidden rounded-md border border-border bg-background-secondary text-[12px] text-foreground">
      {/* 左区：文件名 — 点击打开文件 */}
      <button
        type="button"
        onClick={handleOpenFile}
        title={openErr ? `无法打开：${path}` : path}
        className="inline-flex cursor-pointer items-center gap-1.5 px-2 py-0.5 transition-colors duration-150 hover:bg-background-tertiary hover:text-accent"
      >
        {openErr ? (
          <AlertCircle className="size-3.5 shrink-0 text-destructive" strokeWidth={1.5} />
        ) : (
          <i className={`icon ${iconClass} shrink-0`} aria-hidden />
        )}
        <span className={`max-w-[200px] truncate ${openErr ? "text-destructive" : ""}`}>{name}</span>
      </button>

      {/* 分隔线 */}
      <span className="h-4 w-px shrink-0 bg-border" aria-hidden />

      {/* 右区：目录名 — 点击访达定位 */}
      <button
        type="button"
        onClick={handleRevealDir}
        title={revealErr ? `无法定位文件：${path}` : `在访达中显示: ${path}`}
        className="inline-flex cursor-pointer items-center gap-1 px-2 py-0.5 transition-colors duration-150 hover:bg-background-tertiary hover:text-accent"
      >
        {revealErr ? (
          <AlertCircle className="size-3 shrink-0 text-destructive" strokeWidth={1.5} />
        ) : (
          <FolderOpen className="size-3 shrink-0 text-muted-foreground" strokeWidth={1.5} />
        )}
        <span className={`max-w-[140px] truncate ${revealErr ? "text-destructive" : "text-muted-foreground"}`}>
          {revealErr ? "找不到文件" : parentDir}
        </span>
      </button>
    </span>
  );
}
