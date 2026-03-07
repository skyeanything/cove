import { useThemeStore } from "@/stores/themeStore";
import { useDataStore } from "@/stores/dataStore";
import { useChatStore } from "@/stores/chatStore";
import { useLayoutStore } from "@/stores/layoutStore";
import { AppLayout } from "@/components/layout/AppLayout";
import { SettingsWindow } from "@/components/settings/SettingsWindow";
import { PreviewWindow } from "@/components/preview/PreviewWindow";
import { useTauriDrag } from "@/hooks/useTauriDrag";
import { useEffect } from "react";
import { listen } from "@tauri-apps/api/event";
import { readConfig } from "@/lib/config";
import type { GeneralConfig } from "@/lib/config/types";
import { migrateConfigIfNeeded } from "@/lib/config/migration";
import { i18n } from "@/i18n";
import { useSettingsStore } from "@/stores/settingsStore";

const windowParam = new URLSearchParams(window.location.search).get("window");
const isSettingsWindow = windowParam === "settings";
const isPreviewWindow = windowParam === "preview";

export function App() {
  const theme = useThemeStore((s) => s.theme);
  const init = useDataStore((s) => s.init);
  const initialized = useDataStore((s) => s.initialized);
  const initError = useDataStore((s) => s.initError);
  useTauriDrag();

  // Migrate config files + initialize stores
  useEffect(() => {
    migrateConfigIfNeeded().then(async () => {
      await Promise.all([
        useThemeStore.getState().init(),
        useLayoutStore.getState().init(),
      ]);
      const config = await readConfig<GeneralConfig>("general");
      if (config.locale === "zh" || config.locale === "en") {
        i18n.changeLanguage(config.locale);
      }
      await useSettingsStore.getState().loadAppSettings();
      await init();
    }).catch((err) => {
      console.error("Config initialization failed:", err);
      useDataStore.setState({
        initError: err instanceof Error ? err.message : String(err),
      });
    });
  }, [init]);

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

  // 主窗口监听 provider 被关闭事件：若当前选中的是该 provider，则清除 ChatInput 的模型选中
  useEffect(() => {
    if (isSettingsWindow) return;
    const unlistenPromise = listen<{ providerId: string }>("provider-disabled", (e) => {
      const providerId = e.payload?.providerId;
      if (providerId && useChatStore.getState().providerId === providerId) {
        void useChatStore.getState().clearModelSelection();
      }
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
        {initError ? (
          <div className="flex max-w-md flex-col items-center gap-3 px-6 text-center">
            <p className="text-[13px] font-medium text-destructive">
              Failed to initialize
            </p>
            <p className="rounded-lg bg-background-tertiary px-3 py-2 font-mono text-[11px] text-muted-foreground">
              {initError}
            </p>
            <button
              type="button"
              onClick={() => {
                useDataStore.setState({ initError: null });
                init();
              }}
              className="mt-1 rounded-lg bg-accent px-3 py-1.5 text-[12px] font-medium text-accent-foreground transition-colors hover:bg-accent-hover"
            >
              Retry
            </button>
          </div>
        ) : (
          <div className="text-[13px] text-muted-foreground">Loading...</div>
        )}
      </div>
    );
  }

  if (isSettingsWindow) {
    return <SettingsWindow />;
  }

  if (isPreviewWindow) {
    return <PreviewWindow />;
  }

  return <AppLayout />;
}
