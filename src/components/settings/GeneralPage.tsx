import { useTranslation } from "react-i18next";
import { emit } from "@tauri-apps/api/event";
import { useSettingsStore } from "@/stores/settingsStore";
import { settingsRepo } from "@/db/repos/settingsRepo";
import { i18n } from "@/i18n";
import type { Locale } from "@/i18n";
import type { SendMessageShortcut } from "@/stores/settingsStore";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";

const LOCALE_OPTIONS: { value: Locale; labelKey: string }[] = [
  { value: "zh", labelKey: "settings.general.localeOption_zh" },
  { value: "en", labelKey: "settings.general.localeOption_en" },
];

const SHORTCUT_OPTIONS: { value: SendMessageShortcut; labelKey: string }[] = [
  { value: "enter", labelKey: "settings.general.shortcutEnter" },
  { value: "modifierEnter", labelKey: "settings.general.shortcutModifierEnter" },
];

function SettingRow({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between border-b border-border px-5 py-4 last:border-b-0">
      <Label className="text-sm font-medium">{label}</Label>
      {children}
    </div>
  );
}

export function GeneralPage() {
  const { t } = useTranslation();
  const sendMessageShortcut = useSettingsStore((s) => s.sendMessageShortcut);
  const setSendMessageShortcut = useSettingsStore((s) => s.setSendMessageShortcut);

  const currentLocale = (i18n.language === "zh" || i18n.language === "en"
    ? i18n.language
    : "zh") as Locale;

  const handleLocaleChange = async (value: string) => {
    const locale = value as Locale;
    await settingsRepo.set("locale", locale);
    i18n.changeLanguage(locale);
    // 通知主窗口同步语言（设置窗口与主窗口是独立进程）
    await emit("locale-changed", { locale });
  };

  const handleShortcutChange = async (value: string) => {
    const shortcut = value as SendMessageShortcut;
    await settingsRepo.set("sendMessageShortcut", shortcut);
    setSendMessageShortcut(shortcut);
  };

  return (
    <div className="flex flex-1 flex-col overflow-auto">
      <div className="divide-y divide-border">
        <SettingRow label={t("settings.general.language")}>
          <Select value={currentLocale} onValueChange={handleLocaleChange}>
            <SelectTrigger className="w-[140px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {LOCALE_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {t(opt.labelKey)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </SettingRow>
        <SettingRow label={t("settings.general.sendShortcut")}>
          <Select
            value={sendMessageShortcut}
            onValueChange={handleShortcutChange}
          >
            <SelectTrigger className="w-[140px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {SHORTCUT_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {t(opt.labelKey)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </SettingRow>
      </div>
    </div>
  );
}
