import { ExternalLink } from "lucide-react";
import { openPath } from "@tauri-apps/plugin-opener";
import { getClassWithColor } from "file-icons-js";
import { getFileExtension } from "@/lib/attachment-utils";
import {
  useDetectOfficeApps,
  getMatchingApps,
} from "@/components/preview/PreviewFileHeader";

interface FileChipProps {
  /** 绝对文件路径，用于打开操作 */
  path: string;
  /** 展示名称（通常为文件名） */
  name: string;
}

/**
 * 内联文件 chip，用于 chat 消息中 file:// 链接的渲染。
 * docx/xlsx/pptx 优先用已检测到的 Office 应用（WPS/Word）显式打开；
 * 其他文件类型 fallback 到系统默认应用。
 */
export function FileChip({ path, name }: FileChipProps) {
  const ext = getFileExtension(name || path);
  const iconClass = getClassWithColor(`file.${ext || "txt"}`) || "text-icon";

  const officeApps = useDetectOfficeApps();
  const matchingApps = getMatchingApps(path, officeApps);

  const handleOpen = () => {
    if (matchingApps.length > 0 && matchingApps[0]) {
      // 有匹配的 Office 应用（WPS/Word 等）— 显式指定打开，不依赖系统默认
      openPath(path, matchingApps[0].id).catch((e) => {
        console.error("[FileChip] openPath with app failed, fallback:", e);
        openPath(path).catch(console.error);
      });
    } else {
      // 非 Office 文件或未检测到 Office — 系统默认
      openPath(path).catch((e) => {
        console.error("[FileChip] openPath failed:", e);
      });
    }
  };

  return (
    <button
      type="button"
      onClick={handleOpen}
      title={path}
      className="inline-flex cursor-pointer items-center gap-1.5 rounded-md border border-border bg-background-secondary px-2 py-0.5 text-[12px] text-foreground transition-colors duration-150 hover:bg-background-tertiary hover:text-accent"
    >
      <i className={`icon ${iconClass} shrink-0`} aria-hidden />
      <span className="max-w-[260px] truncate">{name}</span>
      <ExternalLink className="size-3 shrink-0 text-muted-foreground" strokeWidth={1.5} />
    </button>
  );
}
