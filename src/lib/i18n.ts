import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import LanguageDetector from "i18next-browser-languagedetector";
import viTranslation from "./locales/vi.json";
import enTranslation from "./locales/en.json";

const resources = {
  vi: {
    translation: viTranslation,
  },
  en: {
    translation: enTranslation,
  },
};

void i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources,
    fallbackLng: "vi",
    interpolation: {
      escapeValue: false,
    },
    detection: {
      order: ["localStorage", "navigator"],
      caches: ["localStorage"],
    },
	  });

export function t(key: string, options?: any): string {
  return i18n.t(key, options) as string;
}

export default i18n;
