// The language in the views: a context carrying the locale and its messages, the inline-markup
// renderer for long texts, and the one place an error becomes words.

import { createContext, Fragment, useContext, type ReactNode } from 'react';
import type { ScanErrorCode, ScanErrorParams } from './en';
import { DEFAULT_LOCALE, localePath, type Locale } from './locales';
import { MESSAGES, type Messages } from './messages';

export interface I18n {
  locale: Locale;
  t: Messages;
}

const I18nContext = createContext<I18n>({ locale: DEFAULT_LOCALE, t: MESSAGES[DEFAULT_LOCALE] });

export function I18nProvider({ locale, children }: { locale: Locale; children: ReactNode }) {
  return <I18nContext.Provider value={{ locale, t: MESSAGES[locale] }}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18n {
  return useContext(I18nContext);
}

/**
 * Renders [text](href) as a link, `code` as code, **text** as strong, and {name} from `slots` (a
 * figure, or a coloured stage word); site paths are kept in the reader's language.
 */
export function Rich({ text, slots = {} }: { text: string; slots?: Record<string, ReactNode> }) {
  const { locale } = useI18n();
  const parts: ReactNode[] = [];
  const pattern = /\[([^\]]+)\]\(([^)]+)\)|`([^`]+)`|\*\*([^*]+)\*\*|\{([a-zA-Z-]+)\}/g;
  let last = 0;
  for (let m = pattern.exec(text); m; m = pattern.exec(text)) {
    if (m.index > last) parts.push(text.slice(last, m.index));
    if (m[3] !== undefined) parts.push(<code key={m.index}>{m[3]}</code>);
    else if (m[4] !== undefined) parts.push(<strong key={m.index}>{m[4]}</strong>);
    else if (m[5] !== undefined) parts.push(<Fragment key={m.index}>{m[5] in slots ? slots[m[5]] : m[0]}</Fragment>);
    else {
      const href = m[2].startsWith('/') ? localePath(locale, m[2]) : m[2];
      parts.push(
        <a key={m.index} href={href} rel={href.startsWith('http') ? 'noopener' : undefined}>
          {m[1]}
        </a>,
      );
    }
    last = m.index + m[0].length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return <>{parts}</>;
}

/** An error in the reader's words when its code is known; the English text it arrived with otherwise. */
export function errorText(t: Messages, error: string | null, code: string | null, params: ScanErrorParams): string {
  if (code && code in t.errors.target) return t.errors.target[code as keyof Messages['errors']['target']];
  if (code && code in t.errors.scan) return t.errors.scan[code as ScanErrorCode](params);
  return error ?? '';
}
