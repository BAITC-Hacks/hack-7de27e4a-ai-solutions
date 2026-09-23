"use client";
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { formatDate, formatNumber, isLocale, translate, LANGUAGE_STORAGE_KEY, type Locale, type TranslationValues } from "./core";

export { LANGUAGE_STORAGE_KEY } from "./core";
function createValue(locale: Locale, setLocale: (locale: Locale) => void) {
  return {
    locale,
    setLocale,
    t: (ru: string, kk: string, en: string, values?: TranslationValues) => translate(locale, ru, kk, en, values),
    date: (value: string) => formatDate(value, locale),
    number: (value: number) => formatNumber(value, locale),
  };
}
// Standalone renderers and component tests use the same explicit Russian default.
const I18nContext = createContext(createValue("ru", () => {}));

export function I18nProvider({ children, initialLocale = "ru" }: { children: ReactNode; initialLocale?: Locale }) {
  const [locale, setLocale] = useState<Locale>(initialLocale);
  const [initialized, setInitialized] = useState(false);
  useEffect(() => {
    try {
      const saved = localStorage.getItem(LANGUAGE_STORAGE_KEY);
      if (isLocale(saved)) setLocale(saved);
    } catch { /* Language selection still works when browser storage is unavailable. */ }
    setInitialized(true);
  }, []);
  useEffect(() => {
    if (!initialized) return;
    document.documentElement.lang = locale;
    try { localStorage.setItem(LANGUAGE_STORAGE_KEY, locale); } catch { /* Session-only preference. */ }
    // The server reads this preference so a reload starts in the same language.
    document.cookie = `${LANGUAGE_STORAGE_KEY}=${locale}; Path=/; Max-Age=31536000; SameSite=Lax${location.protocol === "https:" ? "; Secure" : ""}`;
  }, [locale, initialized]);
  const value = useMemo(() => createValue(locale, setLocale), [locale]);
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() { return useContext(I18nContext); }
