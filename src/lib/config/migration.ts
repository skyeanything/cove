import { invoke } from "@tauri-apps/api/core";
import { writeConfig } from "./index";
import { settingsRepo } from "@/db/repos/settingsRepo";
import { listSkills } from "@/lib/ai/skills/loader";
import type {
  AppearanceConfig,
  GeneralConfig,
  LayoutConfig,
  SkillsConfig,
} from "./types";
import { CONFIG_DEFAULTS } from "./types";

/** Check whether config files already exist (migration already done) */
async function configExists(): Promise<boolean> {
  const raw = await invoke<string>("read_config", { name: "appearance" });
  return raw !== "{}";
}

function readLocalStorage<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { state?: T };
    return parsed.state ?? null;
  } catch {
    return null;
  }
}

export async function migrateConfigIfNeeded(): Promise<void> {
  if (await configExists()) return;

  // Appearance: from localStorage "office-chat-theme"
  const themeState = readLocalStorage<{ theme: string }>("office-chat-theme");
  const theme = themeState?.theme;
  const appearance: AppearanceConfig = {
    theme:
      theme === "light" || theme === "dark" || theme === "system"
        ? theme
        : CONFIG_DEFAULTS.appearance.theme,
  };
  await writeConfig("appearance", appearance);

  // Layout: from localStorage "office-chat-layout"
  const layoutState = readLocalStorage<Record<string, unknown>>(
    "office-chat-layout",
  );
  const oldMode = layoutState?.leftSidebarMode;
  const leftSidebarMode =
    oldMode === "full" || oldMode === "mini" || oldMode === "hidden"
      ? oldMode
      : layoutState?.leftSidebarOpen === false
        ? "hidden"
        : CONFIG_DEFAULTS.layout.leftSidebarMode;
  const layout: LayoutConfig = {
    leftSidebarMode,
    leftSidebarOpen: leftSidebarMode !== "hidden",
    leftSidebarWidth:
      typeof layoutState?.leftSidebarWidth === "number"
        ? layoutState.leftSidebarWidth
        : CONFIG_DEFAULTS.layout.leftSidebarWidth,
    chatWidth:
      typeof layoutState?.chatWidth === "number"
        ? layoutState.chatWidth
        : CONFIG_DEFAULTS.layout.chatWidth,
    filePanelOpen:
      typeof layoutState?.filePanelOpen === "boolean"
        ? layoutState.filePanelOpen
        : CONFIG_DEFAULTS.layout.filePanelOpen,
    fileTreeOpen:
      typeof layoutState?.fileTreeOpen === "boolean"
        ? layoutState.fileTreeOpen
        : CONFIG_DEFAULTS.layout.fileTreeOpen,
    filePreviewOpen:
      typeof layoutState?.filePreviewOpen === "boolean"
        ? layoutState.filePreviewOpen
        : CONFIG_DEFAULTS.layout.filePreviewOpen,
    fileTreeWidth:
      typeof layoutState?.fileTreeWidth === "number"
        ? layoutState.fileTreeWidth
        : CONFIG_DEFAULTS.layout.fileTreeWidth,
    filePreviewWidth:
      typeof layoutState?.filePreviewWidth === "number"
        ? layoutState.filePreviewWidth
        : CONFIG_DEFAULTS.layout.filePreviewWidth,
    fileTreeShowHidden:
      typeof layoutState?.fileTreeShowHidden === "boolean"
        ? layoutState.fileTreeShowHidden
        : CONFIG_DEFAULTS.layout.fileTreeShowHidden,
    activePage: CONFIG_DEFAULTS.layout.activePage,
    historyCollapsed: CONFIG_DEFAULTS.layout.historyCollapsed,
    wsFileTreeWidth:
      typeof layoutState?.wsFileTreeWidth === "number"
        ? (layoutState.wsFileTreeWidth as number)
        : CONFIG_DEFAULTS.layout.wsFileTreeWidth,
    wsChatWidth:
      typeof layoutState?.wsChatWidth === "number"
        ? (layoutState.wsChatWidth as number)
        : CONFIG_DEFAULTS.layout.wsChatWidth,
  };
  await writeConfig("layout", layout);

  // General: locale + sendShortcut from settingsRepo
  const locale = await settingsRepo.get("locale");
  const sendRaw = await settingsRepo.get("sendMessageShortcut");
  const general: GeneralConfig = {
    locale: locale === "en" ? "en" : "zh",
    sendShortcut:
      sendRaw === "modifierEnter" || sendRaw === "shiftEnter"
        ? "modifierEnter"
        : "enter",
  };
  await writeConfig("general", general);

  // Skills: enabledSkillNames + skillDirPaths from settingsRepo
  const enabledRaw = await settingsRepo.get("enabledSkillNames");
  const dirPathsRaw = await settingsRepo.get("skillDirPaths");
  let enabled: string[] = [];
  let dirPaths: string[] = [];
  try {
    const parsed = enabledRaw ? (JSON.parse(enabledRaw) as unknown) : null;
    enabled = Array.isArray(parsed)
      ? parsed.filter((x): x is string => typeof x === "string")
      : listSkills().map((s) => s.name);
  } catch {
    enabled = listSkills().map((s) => s.name);
  }
  try {
    const parsed = dirPathsRaw ? (JSON.parse(dirPathsRaw) as unknown) : null;
    dirPaths = Array.isArray(parsed)
      ? parsed.filter((x): x is string => typeof x === "string")
      : [];
  } catch {
    dirPaths = [];
  }
  const skills: SkillsConfig = { enabled, dirPaths };
  await writeConfig("skills", skills);
}
