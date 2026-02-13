import { useThemeStore } from "@/stores/themeStore";
import { useDataStore } from "@/stores/dataStore";
import { useChatStore } from "@/stores/chatStore";
import { AppLayout } from "@/components/layout/AppLayout";
import { SettingsWindow } from "@/components/settings/SettingsWindow";
import { useTauriDrag } from "@/hooks/useTauriDrag";
import { useEffect } from "react";
import { listen } from "@tauri-apps/api/event";
import { settingsRepo } from "@/db/repos/settingsRepo";
import { i18n } from "@/i18n";
import { useSettingsStore } from "@/stores/settingsStore";

const isSettingsWindow =
  new URLSearchParams(window.location.search).get("window") === "settings";

export function App() {
  const theme = useThemeStore((s) => s.theme);
  const init = useDataStore((s) => s.init);
  const initialized = useDataStore((s) => s.initialized);
  useTauriDrag();

  // Initialize data store (loads providers, assistants, etc. from SQLite)
  useEffect(() => {
    init();
  }, [init]);

  // 从持久化恢复界面语言与发送快捷键
  useEffect(() => {
    settingsRepo.get("locale").then((l) => {
      if (l === "zh" || l === "en") i18n.changeLanguage(l);
    });
    useSettingsStore.getState().loadAppSettings();
  }, []);

  // 主窗口初始化完成后恢复上次使用的模型
  useEffect(() => {
    if (!initialized || isSettingsWindow) return;
    useChatStore.getState().restoreLastModel();
  }, [initialized, isSettingsWindow]);

  // 主窗口监听设置窗口发出的语言切换事件，同步界面语言
  useEffect(() => {
    if (isSettingsWindow) return;
    const unlistenPromise = listen<{ locale: string }>("locale-changed", (e) => {
      const l = e.payload?.locale;
      if (l === "zh" || l === "en") i18n.changeLanguage(l);
    });
    return () => {
      unlistenPromise.then((unlisten) => unlisten());
    };
  }, [isSettingsWindow]);

  useEffect(() => {
    const root = document.documentElement;
    if (theme === "dark") {
      root.classList.add("dark");
    } else if (theme === "light") {
      root.classList.remove("dark");
    } else {
      const mq = window.matchMedia("(prefers-color-scheme: dark)");
      const handler = (e: MediaQueryListEvent | MediaQueryList) => {
        root.classList.toggle("dark", e.matches);
      };
      handler(mq);
      mq.addEventListener("change", handler);
      return () => mq.removeEventListener("change", handler);
    }
  }, [theme]);

  if (!initialized) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-background">
        <div className="text-[13px] text-muted-foreground">Loading...</div>
      </div>
    );
  }

  if (isSettingsWindow) {
    return <SettingsWindow />;
  }

  return <AppLayout />;
}
