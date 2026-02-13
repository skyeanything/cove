import { WebviewWindow } from "@tauri-apps/api/webviewWindow";
import { i18n } from "@/i18n";

const SETTINGS_LABEL = "settings";

export async function openSettingsWindow() {
  // Singleton: if already open, just focus it
  const existing = await WebviewWindow.getByLabel(SETTINGS_LABEL);
  if (existing) {
    await existing.setFocus();
    return;
  }

  new WebviewWindow(SETTINGS_LABEL, {
    url: window.location.origin + "?window=settings",
    title: i18n.t("common.settings"),
    width: 1000,
    height: 660,
    center: true,
    resizable: true,
    titleBarStyle: "overlay",
    hiddenTitle: true,
  });
}
