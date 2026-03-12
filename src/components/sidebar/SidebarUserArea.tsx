import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { User, Settings } from "lucide-react";
import { useTranslation } from "react-i18next";
import { emit } from "@tauri-apps/api/event";
import { openSettingsWindow } from "@/lib/settings-window";
import { useThemeStore } from "@/stores/themeStore";
import { readConfig, writeConfig } from "@/lib/config";
import { i18n } from "@/i18n";
import type { Locale } from "@/i18n";
import type { GeneralConfig } from "@/lib/config/types";

type Theme = "light" | "dark" | "system";
type FontSize = "sm" | "md" | "lg";

/**
 * Bottom section of MainNavSidebar: user avatar placeholder + settings entry.
 */
export function SidebarUserArea() {
  const { t } = useTranslation();
  const { theme, setTheme, fontSize, setFontSize } = useThemeStore();

  const currentLocale = (
    i18n.language === "zh" || i18n.language === "en" ? i18n.language : "zh"
  ) as Locale;

  const handleLocaleChange = async (locale: string) => {
    const l = locale as Locale;
    const config = await readConfig<GeneralConfig>("general");
    await writeConfig("general", { ...config, locale: l });
    i18n.changeLanguage(l);
    await emit("locale-changed", { locale: l });
  };

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

      {/* Settings dropdown */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon-sm"
            className="size-6 shrink-0 text-muted-foreground hover:text-foreground"
            title={t("sidebar.settings", "Settings")}
          >
            <Settings className="size-[16px]" strokeWidth={1.5} />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent side="top" align="end" className="w-44">
          {/* Language submenu */}
          <DropdownMenuSub>
            <DropdownMenuSubTrigger>
              {t("sidebar.language")}
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent>
              <DropdownMenuRadioGroup
                value={currentLocale}
                onValueChange={handleLocaleChange}
              >
                <DropdownMenuRadioItem value="zh">
                  {t("settings.general.localeOption_zh")}
                </DropdownMenuRadioItem>
                <DropdownMenuRadioItem value="en">
                  {t("settings.general.localeOption_en")}
                </DropdownMenuRadioItem>
              </DropdownMenuRadioGroup>
            </DropdownMenuSubContent>
          </DropdownMenuSub>

          {/* Theme submenu */}
          <DropdownMenuSub>
            <DropdownMenuSubTrigger>
              {t("sidebar.theme")}
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent>
              <DropdownMenuRadioGroup
                value={theme}
                onValueChange={(v) => setTheme(v as Theme)}
              >
                <DropdownMenuRadioItem value="light">
                  {t("sidebar.themeLight")}
                </DropdownMenuRadioItem>
                <DropdownMenuRadioItem value="dark">
                  {t("sidebar.themeDark")}
                </DropdownMenuRadioItem>
                <DropdownMenuRadioItem value="system">
                  {t("sidebar.themeSystem")}
                </DropdownMenuRadioItem>
              </DropdownMenuRadioGroup>
            </DropdownMenuSubContent>
          </DropdownMenuSub>

          {/* Font size submenu */}
          <DropdownMenuSub>
            <DropdownMenuSubTrigger>
              {t("sidebar.fontSize")}
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent>
              <DropdownMenuRadioGroup
                value={fontSize}
                onValueChange={(v) => setFontSize(v as FontSize)}
              >
                <DropdownMenuRadioItem value="sm">
                  {t("sidebar.fontSizeSm")}
                </DropdownMenuRadioItem>
                <DropdownMenuRadioItem value="md">
                  {t("sidebar.fontSizeMd")}
                </DropdownMenuRadioItem>
                <DropdownMenuRadioItem value="lg">
                  {t("sidebar.fontSizeLg")}
                </DropdownMenuRadioItem>
              </DropdownMenuRadioGroup>
            </DropdownMenuSubContent>
          </DropdownMenuSub>

          <DropdownMenuSeparator />

          {/* Open full settings */}
          <DropdownMenuItem onSelect={() => openSettingsWindow()}>
            {t("sidebar.openSettings")}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
