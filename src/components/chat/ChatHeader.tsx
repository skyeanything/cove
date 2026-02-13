import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Sun, Moon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useThemeStore } from "@/stores/themeStore";
import { useDataStore } from "@/stores/dataStore";

interface ChatHeaderProps {
  leftSidebarOpen: boolean;
}

export function ChatHeader({ leftSidebarOpen }: ChatHeaderProps) {
  const { t } = useTranslation();
  const theme = useThemeStore((s) => s.theme);
  const setTheme = useThemeStore((s) => s.setTheme);
  const activeConversationId = useDataStore((s) => s.activeConversationId);
  const conversations = useDataStore((s) => s.conversations);
  const activeConversation = activeConversationId
    ? conversations.find((c) => c.id === activeConversationId)
    : null;
  const title = activeConversation?.title ?? t("sidebar.untitled");

  const isDark =
    theme === "dark" ||
    (theme === "system" &&
      window.matchMedia("(prefers-color-scheme: dark)").matches);

  return (
    <div className="shrink-0">
      <div
        data-tauri-drag-region
        className="no-select flex h-[52px] items-center px-3"
      >
        {/* 当前对话标题 */}
        <div
          className="ml-3 flex min-w-0 max-w-[50%] items-center transition-[padding] duration-300 ease-out"
          style={{ paddingLeft: leftSidebarOpen ? 0 : 148 }}
        >
          <span className="truncate text-[13px] font-semibold text-foreground">
            {title}
          </span>
        </div>

        <div className="flex-1 min-w-0" />

        {/* Theme toggle */}
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={() => setTheme(isDark ? "light" : "dark")}
          className="text-muted-foreground hover:text-foreground"
          title={isDark ? "Switch to light mode" : "Switch to dark mode"}
        >
          {isDark ? (
            <Sun className="size-[18px]" strokeWidth={1.5} />
          ) : (
            <Moon className="size-[18px]" strokeWidth={1.5} />
          )}
        </Button>
      </div>
      <Separator />
    </div>
  );
}
