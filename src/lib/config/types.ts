export interface AppearanceConfig {
  theme: "light" | "dark" | "system";
}

export type SidebarMode = "full" | "mini" | "hidden";
export type ActivePage = "chat" | "workspace" | "extensions";

export interface LayoutConfig {
  leftSidebarMode: SidebarMode;
  leftSidebarOpen: boolean;
  leftSidebarWidth: number;
  chatWidth: number;
  filePanelOpen: boolean;
  fileTreeOpen: boolean;
  filePreviewOpen: boolean;
  fileTreeWidth: number;
  filePreviewWidth: number;
  fileTreeShowHidden: boolean;
  activePage: ActivePage;
  historyCollapsed: boolean;
  wsFileTreeWidth: number;
  wsChatWidth: number;
}

export interface GeneralConfig {
  locale: "zh" | "en";
  sendShortcut: "enter" | "modifierEnter";
}

export interface SkillsConfig {
  enabled: string[];
  dirPaths: string[];
}

export const CONFIG_DEFAULTS = {
  appearance: { theme: "system" } satisfies AppearanceConfig,
  layout: {
    leftSidebarMode: "full",
    leftSidebarOpen: true,
    leftSidebarWidth: 260,
    chatWidth: 640,
    filePanelOpen: true,
    fileTreeOpen: true,
    filePreviewOpen: true,
    fileTreeWidth: 260,
    filePreviewWidth: 360,
    fileTreeShowHidden: true,
    activePage: "chat",
    historyCollapsed: false,
    wsFileTreeWidth: 280,
    wsChatWidth: 360,
  } satisfies LayoutConfig,
  general: {
    locale: "zh",
    sendShortcut: "enter",
  } satisfies GeneralConfig,
  skills: {
    enabled: [],
    dirPaths: [],
  } satisfies SkillsConfig,
} as const;
