import { TriangleAlert, X } from "lucide-react";
import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";

interface GitBashBannerProps {
  message: string;
}

export function GitBashBanner({ message }: GitBashBannerProps) {
  const [dismissed, setDismissed] = useState(false);
  if (dismissed) return null;

  function openInstallPage() {
    invoke("open_url", { url: "https://git-scm.com/download/win" }).catch(() => {});
  }

  return (
    <div className="flex items-center gap-2 border-b border-destructive/20 bg-destructive/10 px-3 py-2 text-sm">
      <TriangleAlert
        size={16}
        strokeWidth={1.5}
        className="shrink-0 text-destructive"
      />
      <span className="flex-1 text-foreground">
        <span className="font-medium text-destructive">Git Bash 未就绪</span>
        {" — bash 工具在 Windows 上需要 Git for Windows。"}
        <button
          onClick={openInstallPage}
          className="ml-1 cursor-pointer underline hover:text-accent"
        >
          立即安装
        </button>
      </span>
      <span
        className="shrink-0 text-xs text-foreground-tertiary"
        title={message}
      >
        详情
      </span>
      <button
        onClick={() => setDismissed(true)}
        className="cursor-pointer rounded p-0.5 hover:bg-destructive/20"
        aria-label="关闭"
      >
        <X size={14} strokeWidth={1.5} className="text-foreground-secondary" />
      </button>
    </div>
  );
}
