import { create } from "zustand";
import { readConfig, writeConfig } from "@/lib/config";
import type { AppearanceConfig } from "@/lib/config/types";

type Theme = "light" | "dark" | "system";

interface ThemeState {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  init: () => Promise<void>;
}

export const useThemeStore = create<ThemeState>()((set) => ({
  theme: "system",
  setTheme: (theme) => {
    set({ theme });
    void writeConfig("appearance", { theme } satisfies AppearanceConfig);
  },
  init: async () => {
    const config = await readConfig<AppearanceConfig>("appearance");
    set({ theme: config.theme });
  },
}));
