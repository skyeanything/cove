import { Button } from "@/components/ui/button";
import { User, Settings } from "lucide-react";
import { useTranslation } from "react-i18next";
import { openSettingsWindow } from "@/lib/settings-window";

/**
 * Bottom section of MainNavSidebar: user avatar placeholder + settings entry.
 */
export function SidebarUserArea() {
  const { t } = useTranslation();

  return (
    <div className="flex shrink-0 items-center gap-2.5 border-t border-sidebar-border px-3 py-2.5">
      {/* Avatar placeholder */}
      <div className="flex size-7 shrink-0 items-center justify-center rounded-full bg-background-tertiary">
        <User className="size-4 text-muted-foreground" strokeWidth={1.5} />
      </div>

      {/* Name placeholder */}
      <span className="min-w-0 flex-1 truncate text-[13px] text-foreground-secondary">
        User
      </span>

      {/* Settings */}
      <Button
        variant="ghost"
        size="icon-sm"
        onClick={() => openSettingsWindow()}
        className="size-6 shrink-0 text-muted-foreground hover:text-foreground"
        title={t("sidebar.settings", "Settings")}
      >
        <Settings className="size-[16px]" strokeWidth={1.5} />
      </Button>
    </div>
  );
}
