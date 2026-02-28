import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronDown, ExternalLink } from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import { useTranslation } from "react-i18next";
import { BreadcrumbNav } from "./BreadcrumbNav";

export interface OfficeAppInfo {
  id: string;
  name: string;
  path: string;
}

/** 检测已安装的 Office 应用（结果缓存） */
export function useDetectOfficeApps() {
  const [apps, setApps] = useState<OfficeAppInfo[]>([]);
  const fetched = useRef(false);

  useEffect(() => {
    if (fetched.current) return;
    fetched.current = true;
    invoke<OfficeAppInfo[]>("detect_office_apps").then(setApps).catch(() => {});
  }, []);

  return apps;
}

/** 用外部应用打开文件 */
export function useOpenExternally(workspaceRoot: string | null, path: string | null) {
  return useCallback(
    (openWith?: string) => {
      if (!workspaceRoot || !path) return;
      invoke("open_with_app", {
        args: { workspaceRoot, path, openWith: openWith ?? null },
      }).catch((e) => {
        console.error("open_with_app failed:", e);
      });
    },
    [workspaceRoot, path],
  );
}

export const OFFICE_EXT_APP_MAP: Record<string, string[]> = {
  docx: ["wpsoffice", "Microsoft Word", "LibreOffice"],
  xlsx: ["wpsoffice", "Microsoft Excel", "LibreOffice"],
  pptx: ["wpsoffice", "Microsoft PowerPoint", "LibreOffice"],
  ppt: ["wpsoffice", "Microsoft PowerPoint", "LibreOffice"],
};

export function getMatchingApps(path: string, allApps: OfficeAppInfo[]): OfficeAppInfo[] {
  const ext = path.replace(/^.*\./, "").toLowerCase();
  const ids = OFFICE_EXT_APP_MAP[ext];
  if (!ids) return [];
  return allApps.filter((a) => ids.includes(a.id));
}

export function OpenExternallyButton({ workspaceRoot, path }: { workspaceRoot: string | null; path: string }) {
  const { t } = useTranslation();
  const openExternally = useOpenExternally(workspaceRoot, path);
  return (
    <button
      type="button"
      onClick={() => openExternally()}
      className="rounded-md p-1 text-muted-foreground hover:bg-background-tertiary hover:text-foreground"
      title={t("preview.openDefault")}
    >
      <ExternalLink className="size-3" strokeWidth={1.5} />
    </button>
  );
}

export function PreviewFileHeader({
  path,
  workspaceRoot,
  officeApps,
}: {
  path: string;
  workspaceRoot: string | null;
  officeApps: OfficeAppInfo[];
}) {
  const { t } = useTranslation();
  const openExternally = useOpenExternally(workspaceRoot, path);
  const matchingApps = getMatchingApps(path, officeApps);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // 点击外部关闭下拉
  useEffect(() => {
    if (!dropdownOpen) return;
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [dropdownOpen]);

  return (
    <div className="flex h-10 shrink-0 items-center justify-between gap-2 border-b border-border bg-background px-3">
      <div className="file-preview-header-path min-w-0 text-[13px]">
        <BreadcrumbNav path={path} />
      </div>
      <div className="relative flex shrink-0 items-center gap-1" ref={dropdownRef}>
        {matchingApps.length > 0 && matchingApps[0] ? (
          <>
            {/* 主按钮：用第一个匹配的 app 打开 */}
            <button
              type="button"
              onClick={() => openExternally(matchingApps[0]!.id)}
              className="flex items-center gap-1 rounded-md px-2 py-1 text-[11px] text-muted-foreground hover:bg-background-tertiary hover:text-foreground"
              title={t("preview.openInApp", { app: matchingApps[0]!.name })}
            >
              <ExternalLink className="size-3" strokeWidth={1.5} />
              <span className="whitespace-nowrap">
                {t("preview.openInApp", { app: matchingApps[0]!.name })}
              </span>
            </button>
            {/* 有多个 app 时显示下拉箭头 */}
            {matchingApps.length > 1 && (
              <button
                type="button"
                onClick={() => setDropdownOpen((v) => !v)}
                className="rounded-md p-1 text-muted-foreground hover:bg-background-tertiary hover:text-foreground"
              >
                <ChevronDown className="size-3" strokeWidth={1.5} />
              </button>
            )}
            {/* 下拉菜单 */}
            {dropdownOpen && matchingApps.length > 1 && (
              <div className="absolute top-full right-0 z-50 mt-1 min-w-[160px] rounded-lg border border-border bg-background py-1 shadow-lg">
                {matchingApps.map((app) => (
                  <button
                    key={app.id}
                    type="button"
                    onClick={() => {
                      openExternally(app.id);
                      setDropdownOpen(false);
                    }}
                    className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-[12px] text-foreground hover:bg-background-tertiary"
                  >
                    <ExternalLink className="size-3 shrink-0 text-muted-foreground" strokeWidth={1.5} />
                    {app.name}
                  </button>
                ))}
                <div className="my-1 border-t border-border" />
                <button
                  type="button"
                  onClick={() => {
                    openExternally();
                    setDropdownOpen(false);
                  }}
                  className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-[12px] text-foreground hover:bg-background-tertiary"
                >
                  <ExternalLink className="size-3 shrink-0 text-muted-foreground" strokeWidth={1.5} />
                  {t("preview.openDefault")}
                </button>
              </div>
            )}
          </>
        ) : (
          /* 非 Office 或无检测到的 app：仅显示默认打开按钮 */
          <button
            type="button"
            onClick={() => openExternally()}
            className="file-preview-header-path flex items-center gap-1 rounded-md px-2 py-1 text-[11px] text-muted-foreground hover:bg-background-tertiary hover:text-foreground"
            title={t("preview.openDefault")}
          >
            <ExternalLink className="size-3" strokeWidth={1.5} />
          </button>
        )}
      </div>
    </div>
  );
}
