import { useTranslation } from "react-i18next";
import { useSettingsStore } from "@/stores/settingsStore";
import { cn } from "@/lib/utils";
import { Blocks, FolderOpen, Settings, Palette, Wand2, Wrench } from "lucide-react";
import { ProvidersPage } from "./ProvidersPage";
import { GeneralPage } from "./GeneralPage";
import { SkillsPage } from "./SkillsPage";
import { ToolsPage } from "./ToolsPage";
import { WorkspacesPage } from "./WorkspacesPage";

const TABS = [
  { id: "providers" as const, labelKey: "settings.tabs.providers", icon: Blocks },
  { id: "general" as const, labelKey: "settings.tabs.general", icon: Settings },
  { id: "skills" as const, labelKey: "settings.tabs.skills", icon: Wand2 },
  { id: "tools" as const, labelKey: "settings.tabs.tools", icon: Wrench },
  { id: "appearance" as const, labelKey: "settings.tabs.appearance", icon: Palette },
  { id: "workspaces" as const, labelKey: "settings.tabs.workspaces", icon: FolderOpen },
] as const;

export function SettingsWindow() {
  const { t } = useTranslation();
  const tab = useSettingsStore((s) => s.tab);
  const setTab = useSettingsStore((s) => s.setTab);

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-background">
      {/* Left nav */}
      <div className="flex w-[150px] shrink-0 flex-col border-r bg-background-secondary">
        {/* Drag region — leaves space for macOS traffic lights */}
        <div data-tauri-drag-region className="h-[52px] shrink-0" />

        <nav className="flex flex-col gap-0.5 px-2">
          {TABS.map((item) => (
            <button
              key={item.id}
              onClick={() => setTab(item.id)}
              className={cn(
                "flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-sm transition-colors duration-150",
                tab === item.id
                  ? "bg-background-tertiary font-medium text-foreground"
                  : "text-muted-foreground hover:bg-background-tertiary hover:text-foreground",
              )}
            >
              <item.icon className="size-4" strokeWidth={1.5} />
              {t(item.labelKey)}
            </button>
          ))}
        </nav>
      </div>

      {/* Right content */}
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        {/* Header — tab title + drag region */}
        <div
          data-tauri-drag-region
          className="flex h-[52px] shrink-0 items-center border-b px-5"
        >
          <h2 className="text-sm font-semibold">
            {t(TABS.find((item) => item.id === tab)!.labelKey)}
          </h2>
        </div>

        {tab === "providers" && <ProvidersPage />}
        {tab === "general" && <GeneralPage />}
        {tab === "skills" && <SkillsPage />}
        {tab === "tools" && <ToolsPage />}
        {tab === "appearance" && (
          <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
            {t("settings.appearanceComingSoon")}
          </div>
        )}
        {tab === "workspaces" && <WorkspacesPage />}
      </div>
    </div>
  );
}
