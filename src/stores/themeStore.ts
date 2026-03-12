import { create } from "zustand";
import { readConfig, updateConfig } from "@/lib/config";
import type { AppearanceConfig } from "@/lib/config/types";

type Theme = "light" | "dark" | "system";
type FontSize = "sm" | "md" | "lg";

const FONT_SIZE_PX: Record<FontSize, string> = {
  sm: "13px",
  md: "14px",
  lg: "15px",
};

function applyFontSize(fontSize: FontSize) {
  document.documentElement.style.fontSize = FONT_SIZE_PX[fontSize];
}

interface ThemeState {
  theme: Theme;
  fontSize: FontSize;
  setTheme: (theme: Theme) => void;
  setFontSize: (fontSize: FontSize) => void;
  init: () => Promise<void>;
}

export const useThemeStore = create<ThemeState>()((set) => ({
  theme: "system",
  fontSize: "md",
  setTheme: (theme) => {
    set({ theme });
    void updateConfig<AppearanceConfig>("appearance", (c) => ({ ...c, theme }));
  },
  setFontSize: (fontSize) => {
    set({ fontSize });
    applyFontSize(fontSize);
    void updateConfig<AppearanceConfig>("appearance", (c) => ({ ...c, fontSize }));
  },
  init: async () => {
    const config = await readConfig<AppearanceConfig>("appearance");
    const fontSize = config.fontSize ?? "md";
    set({ theme: config.theme, fontSize });
    applyFontSize(fontSize);
  },
}));
