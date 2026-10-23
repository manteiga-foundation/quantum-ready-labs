// The languages: which one a visitor gets and where each lives. Pure, shared by the web and the
// edge. English stays at the root, so no existing link changes; every other language lives under
// its own path prefix (/es/, /pt/ ...) so a search engine can index each one.

export const LOCALES = ['en', 'es', 'pt', 'fr', 'de', 'ja'] as const;
export type Locale = (typeof LOCALES)[number];

export const DEFAULT_LOCALE: Locale = 'en';

/** Each language in its own words, for the selector. */
export const LOCALE_NAME: Record<Locale, string> = {
  en: 'English',
  es: 'Español',
  pt: 'Português',
  fr: 'Français',
  de: 'Deutsch',
  ja: '日本語',
};

/** The `lang` attribute and the hreflang code. Portuguese is written for Brazil. */
export const HTML_LANG: Record<Locale, string> = { en: 'en', es: 'es', pt: 'pt-BR', fr: 'fr', de: 'de', ja: 'ja' };

/** Open Graph's og:locale. */
export const OG_LOCALE: Record<Locale, string> = { en: 'en_US', es: 'es_ES', pt: 'pt_BR', fr: 'fr_FR', de: 'de_DE', ja: 'ja_JP' };

/** Where the selector's choice is remembered in the browser. */
export const STORAGE_KEY = 'qrl-lang';

export function isLocale(v: unknown): v is Locale {
  return typeof v === 'string' && (LOCALES as readonly string[]).includes(v);
}

/** '/es/scan' -> es + '/scan'; anything without one of our prefixes is English. */
export function splitPath(pathname: string): { locale: Locale; rest: string } {
  const m = pathname.match(/^\/([a-z]{2})(?=\/|$)(.*)$/);
  if (m && m[1] !== DEFAULT_LOCALE && isLocale(m[1])) return { locale: m[1], rest: m[2] || '/' };
  return { locale: DEFAULT_LOCALE, rest: pathname };
}

/** The same page in another language. Takes a path with or without a query and with or without a prefix. */
export function localePath(locale: Locale, path: string): string {
  const q = path.search(/[?#]/);
  const pathname = q === -1 ? path : path.slice(0, q);
  const tail = q === -1 ? '' : path.slice(q);
  const { rest } = splitPath(pathname || '/');
  if (locale === DEFAULT_LOCALE) return rest + tail;
  return `/${locale}${rest === '/' ? '/' : rest}${tail}`;
}

/** The first browser language we speak, matched on its primary subtag; English otherwise. */
export function negotiate(languages: readonly string[]): Locale {
  for (const tag of languages) {
    const primary = tag.toLowerCase().split('-')[0];
    if (isLocale(primary)) return primary;
  }
  return DEFAULT_LOCALE;
}

/**
 * The language of a page load. A prefixed path always wins (a shared /fr/ link stays French).
 * An unprefixed one follows the selector's stored choice, then the browser; when that is not
 * English, the visitor is sent to the prefixed path.
 */
export function chooseLocale({ pathname, stored, languages }: { pathname: string; stored: string | null; languages: readonly string[] }): { locale: Locale; redirect: string | null } {
  const split = splitPath(pathname);
  if (split.locale !== DEFAULT_LOCALE) return { locale: split.locale, redirect: null };
  const locale = isLocale(stored) ? stored : negotiate(languages);
  return { locale, redirect: locale === DEFAULT_LOCALE ? null : localePath(locale, pathname) };
}
