/**
 * MiniNavSidebar — 52px 宽的图标条侧边栏。
 *
 * 在以下情况自动显示：
 * - 用户选中工作区历史对话后（工作内容优先，侧边栏退至后台）
 * - 用户在工作区模式点击新建对话后
 *
 * 顶部安全区由 AppLayout 的全局 title bar 统一保障；
 * 此组件无需自行预留 52px 空间。
 */
import { useLayoutStore } from "@/stores/layoutStore";
import type { ActivePage } from "@/stores/layoutStore";
import { openSettingsWindow } from "@/lib/settings-window";
import { cn } from "@/lib/utils";
import {
  FolderOpen,
  Blocks,
  MessageSquare,
  Settings,
} from "lucide-react";

interface NavIconProps {
  icon: React.ReactNode;
  label: string;
  active?: boolean;
  onClick: () => void;
}

function NavIcon({ icon, label, active, onClick }: NavIconProps) {
  return (
    <button
      onClick={onClick}
      title={label}
      className={cn(
        "flex h-9 w-full items-center justify-center rounded-lg transition-colors",
        active
          ? "bg-sidebar-accent text-sidebar-accent-foreground"
          : "text-sidebar-foreground/60 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground",
      )}
    >
      {icon}
    </button>
  );
}

export function MiniNavSidebar() {
  const activePage = useLayoutStore((s) => s.activePage);
  const setActivePage = useLayoutStore((s) => s.setActivePage);
  const setLeftSidebarFull = useLayoutStore((s) => s.setLeftSidebarFull);

  const navigate = (page: ActivePage) => {
    setLeftSidebarFull();
    setActivePage(page);
  };

  return (
    <div className="no-select flex h-full w-full flex-col overflow-hidden border-r border-sidebar-border bg-sidebar">
      {/* 导航图标 */}
      <div className="space-y-0.5 px-1.5 pt-2">
        <NavIcon
          icon={<FolderOpen className="size-[18px]" strokeWidth={1.5} />}
          label="工作区"
          active={activePage === "workspace"}
          onClick={() => navigate("workspace")}
        />
        <NavIcon
          icon={<Blocks className="size-[18px]" strokeWidth={1.5} />}
          label="扩展市场"
          active={activePage === "extensions"}
          onClick={() => navigate("extensions")}
        />
        <NavIcon
          icon={<MessageSquare className="size-[18px]" strokeWidth={1.5} />}
          label="历史对话"
          active={activePage === "chat"}
          onClick={() => navigate("chat")}
        />
      </div>

      {/* 弹性空间 */}
      <div className="min-h-0 flex-1" />

      {/* 设置图标（底部） */}
      <div className="border-t border-sidebar-border px-1.5 py-2">
        <NavIcon
          icon={<Settings className="size-[18px]" strokeWidth={1.5} />}
          label="设置"
          onClick={() => openSettingsWindow()}
        />
      </div>
    </div>
  );
}
