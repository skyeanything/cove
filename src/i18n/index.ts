import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import zh from "./locales/zh.json";
import en from "./locales/en.json";

export const DEFAULT_LOCALE = "zh" as const;
export type Locale = "zh" | "en";

const resources = {
  zh: { translation: zh },
  en: { translation: en },
};

i18n.use(initReactI18next).init({
  resources,
  lng: DEFAULT_LOCALE,
  fallbackLng: DEFAULT_LOCALE,
  defaultNS: "translation",
  interpolation: { escapeValue: false },
});

export { i18n };
