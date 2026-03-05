import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Sun, Moon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useThemeStore } from "@/stores/themeStore";
import { useDataStore } from "@/stores/dataStore";

export function ChatHeader() {
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
        className="no-select flex h-8 items-center px-3"
      >
        <div
          className="ml-3 flex min-w-0 max-w-[50%] items-center"
        >
          <span className="truncate text-[13px] font-semibold text-foreground">
            {title}
          </span>
        </div>

        <div className="min-w-0 flex-1" />

        {/* Theme toggle */}
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={() => setTheme(isDark ? "light" : "dark")}
          className="size-6 text-muted-foreground hover:text-foreground"
          title={isDark ? "Switch to light mode" : "Switch to dark mode"}
        >
          {isDark ? (
            <Sun className="size-[16px]" strokeWidth={1.5} />
          ) : (
            <Moon className="size-[16px]" strokeWidth={1.5} />
          )}
        </Button>
      </div>
      <Separator />
    </div>
  );
}
