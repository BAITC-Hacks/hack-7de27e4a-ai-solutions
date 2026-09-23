export const LOCALES = ["kk", "ru", "en"] as const;
export type Locale = (typeof LOCALES)[number];
export const LANGUAGE_STORAGE_KEY = "career-quest-language";
export type TranslationValues = Readonly<Record<string, string | number>>;
export const localeTags: Record<Locale, string> = { kk: "kk-KZ", ru: "ru-RU", en: "en-US" };
export const localeNames: Record<Locale, string> = { kk: "Қазақша", ru: "Русский", en: "English" };

export function isLocale(value: unknown): value is Locale {
  return typeof value === "string" && (LOCALES as readonly string[]).includes(value);
}

/** All three translations are required at the call site. Interpolation remains plain text. */
export function translate(locale: Locale, ru: string, kk: string, en: string, values: TranslationValues = {}): string {
  const text = { ru, kk, en }[locale];
  return text.replace(/\{(\w+)\}/g, (placeholder, key: string) =>
    Object.prototype.hasOwnProperty.call(values, key) ? String(values[key]) : placeholder,
  );
}

export function formatDate(value: string, locale: Locale): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  // Some Chromium builds omit Kazakh month data and render "M10" instead.
  // Keep calendar dates readable in Kazakh regardless of the host ICU bundle.
  if (locale === "kk") {
    const months = ["қаңтар", "ақпан", "наурыз", "сәуір", "мамыр", "маусым", "шілде", "тамыз", "қыркүйек", "қазан", "қараша", "желтоқсан"];
    return `${date.getUTCDate()} ${months[date.getUTCMonth()]} ${date.getUTCFullYear()}`;
  }
  return new Intl.DateTimeFormat(localeTags[locale], {
    day: "numeric", month: "short", year: "numeric", timeZone: "UTC",
  }).format(date);
}

export function formatNumber(value: number, locale: Locale): string {
  // Kazakh uses the same decimal comma and space grouping as Russian;
  // ru-RU is bundled even in browsers with incomplete kk-KZ locale data.
  return new Intl.NumberFormat(locale === "kk" ? "ru-RU" : localeTags[locale], { maximumFractionDigits: 4 }).format(value);
}
