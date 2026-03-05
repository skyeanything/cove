export interface AppearanceConfig {
  theme: "light" | "dark" | "system";
}

export interface LayoutConfig {
  leftSidebarOpen: boolean;
  leftSidebarWidth: number;
  chatWidth: number;
  filePanelOpen: boolean;
  fileTreeWidth: number;
  filePreviewWidth: number;
  fileTreeShowHidden: boolean;
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
    leftSidebarOpen: true,
    leftSidebarWidth: 260,
    chatWidth: 640,
    filePanelOpen: true,
    fileTreeWidth: 260,
    filePreviewWidth: 360,
    fileTreeShowHidden: true,
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
