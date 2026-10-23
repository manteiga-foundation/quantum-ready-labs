import { describe, expect, test } from 'bun:test';
import { NOTE_IDS, STAGE_LABEL, STAGE_MEANING, STEPS, VERDICT } from '../engine/assess';
import { TARGET_ERRORS } from '../engine/target';
import { en, SCAN_ERROR_CODES } from '../web/src/i18n/en';
import { MESSAGES } from '../web/src/i18n/messages';
import { chooseLocale, LOCALES, localePath, negotiate, splitPath } from '../web/src/i18n/locales';

type Shape = string | Shape[] | { [k: string]: Shape };
function shape(v: unknown): Shape {
  if (typeof v === 'function') return 'function';
  if (Array.isArray(v)) return v.map(shape);
  if (v && typeof v === 'object') return Object.fromEntries(Object.keys(v).sort().map((k) => [k, shape((v as Record<string, unknown>)[k])]));
  return typeof v;
}

/**
 * Every leaf, with its path: strings as they are, functions called with sample arguments. The
 * convention the messages keep: positional strings and numbers, except the scan errors, which
 * take the edge's params object.
 */
const SCAN_PARAMS = { host: 'a.example', port: 8443, allowed: [443], address: '10.0.0.1', status: 500 };
const POSITIONAL = ['a.example', '3', 'TLSv1.3', 'X', '5', '6', '7', '8'];
function leaves(v: unknown, path = ''): [string, string][] {
  if (typeof v === 'string') return [[path, v]];
  if (typeof v === 'function') {
    const out = path.startsWith('errors.scan') ? v(SCAN_PARAMS) : v(...POSITIONAL);
    return [[path, typeof out === 'string' ? out : '']];
  }
  if (Array.isArray(v)) return v.flatMap((x, i) => leaves(x, `${path}[${i}]`));
  if (v && typeof v === 'object') return Object.entries(v).flatMap(([k, x]) => leaves(x, path ? `${path}.${k}` : k));
  return [[path, '']];
}

describe('messages: every language says everything', () => {
  test('every language has exactly the English keys, FAQ entries included', () => {
    for (const locale of LOCALES) expect({ locale, shape: shape(MESSAGES[locale]) }).toEqual({ locale, shape: shape(en) });
  });

  test('no message is empty, and no function leaks undefined', () => {
    for (const locale of LOCALES) {
      for (const [path, text] of leaves(MESSAGES[locale])) {
        expect({ locale, path, empty: text.trim() === '' }).toEqual({ locale, path, empty: false });
        expect({ locale, path, leak: text.includes('undefined') }).toEqual({ locale, path, leak: false });
      }
    }
  });

  test('the English report words are the engine\'s own, so the API, the terminal and the page agree', () => {
    expect(en.stage.label).toBe(STAGE_LABEL);
    expect(en.stage.meaning).toBe(STAGE_MEANING);
    expect(en.report.verdict).toBe(VERDICT);
    expect(Object.keys(en.report.steps).sort()).toEqual(Object.keys(STEPS).sort());
    for (const id of Object.keys(STEPS) as (keyof typeof STEPS)[]) expect(en.report.steps[id]).toEqual({ title: STEPS[id].title, detail: STEPS[id].detail });
    expect(Object.keys(en.report.notes).sort()).toEqual([...NOTE_IDS].sort());
    expect(Object.keys(en.errors.target).sort()).toEqual(Object.keys(TARGET_ERRORS).sort());
    expect(en.errors.target).toEqual({ ...TARGET_ERRORS });
    expect(Object.keys(en.errors.scan).sort()).toEqual([...SCAN_ERROR_CODES].sort());
  });

  test('every {placeholder} in English is in every translation, and no other', () => {
    const slots = (s: string) => [...s.matchAll(/\{([a-zA-Z-]+)\}/g)].map((m) => m[1]).sort();
    const english = new Map(leaves(en).map(([p, s]) => [p, slots(s)]));
    for (const locale of LOCALES) {
      for (const [path, text] of leaves(MESSAGES[locale])) expect({ locale, path, slots: slots(text) }).toEqual({ locale, path, slots: english.get(path) ?? [] });
    }
  });

  test('French typography: a no-break space before ? ! : ; never a plain one', () => {
    for (const [path, text] of leaves(MESSAGES.fr)) {
      const plain = text.replace(/https?:\/\/\S+|`[^`]*`|\]\([^)]*\)/g, '').match(/ [?!:;]/g);
      expect({ path, plain }).toEqual({ path, plain: null });
    }
  });

  test('the other languages are translations, not copies', () => {
    for (const locale of LOCALES.filter((l) => l !== 'en')) {
      const m = MESSAGES[locale];
      expect({ locale, same: m.entry.h1 === en.entry.h1 }).toEqual({ locale, same: false });
      expect({ locale, same: m.report.verdict.protected === en.report.verdict.protected }).toEqual({ locale, same: false });
      expect({ locale, same: m.stage.label['at-risk'] === en.stage.label['at-risk'] }).toEqual({ locale, same: false });
      expect({ locale, same: m.meta.description === en.meta.description }).toEqual({ locale, same: false });
    }
  });
});

// The languages: which one a visitor gets, and where each lives. English stays at the root so no
// existing link changes; every other language has its own path prefix so search engines index it.

describe('locales: where each language lives', () => {
  test('six languages, English first', () => {
    expect(LOCALES).toEqual(['en', 'es', 'pt', 'fr', 'de', 'ja']);
  });

  test('a path splits into its language and the rest; unprefixed paths are English', () => {
    expect(splitPath('/')).toEqual({ locale: 'en', rest: '/' });
    expect(splitPath('/scan')).toEqual({ locale: 'en', rest: '/scan' });
    expect(splitPath('/es')).toEqual({ locale: 'es', rest: '/' });
    expect(splitPath('/es/')).toEqual({ locale: 'es', rest: '/' });
    expect(splitPath('/ja/r/abcdefghijkl')).toEqual({ locale: 'ja', rest: '/r/abcdefghijkl' });
    // A prefix is a whole segment, never the start of a longer word.
    expect(splitPath('/espresso')).toEqual({ locale: 'en', rest: '/espresso' });
    // English has no prefix: /en/ is not one of ours.
    expect(splitPath('/en/scan')).toEqual({ locale: 'en', rest: '/en/scan' });
  });

  test('a path in a language: English unprefixed, the others under their code', () => {
    expect(localePath('en', '/')).toBe('/');
    expect(localePath('en', '/scan?host=a.com')).toBe('/scan?host=a.com');
    expect(localePath('fr', '/')).toBe('/fr/');
    expect(localePath('fr', '/scan?host=a.com')).toBe('/fr/scan?host=a.com');
    expect(localePath('de', '/r/abcdefghijkl')).toBe('/de/r/abcdefghijkl');
    // Already prefixed: the prefix is replaced, never doubled.
    expect(localePath('de', '/fr/scan')).toBe('/de/scan');
    expect(localePath('en', '/fr/scan')).toBe('/scan');
  });
});

describe('locales: which language a visitor gets', () => {
  test('the browser languages are matched by primary subtag, in order; nothing matched is English', () => {
    expect(negotiate(['es-MX', 'en'])).toBe('es');
    expect(negotiate(['pt-PT'])).toBe('pt');
    expect(negotiate(['it-IT', 'de-AT', 'fr'])).toBe('de');
    expect(negotiate(['JA'])).toBe('ja');
    expect(negotiate(['zh-CN', 'ko'])).toBe('en');
    expect(negotiate([])).toBe('en');
  });

  test('a prefixed path always wins, over the stored choice and the browser', () => {
    expect(chooseLocale({ pathname: '/fr/', stored: 'de', languages: ['ja'] })).toEqual({ locale: 'fr', redirect: null });
  });

  test('an unprefixed path follows the stored choice first, then the browser', () => {
    expect(chooseLocale({ pathname: '/scan', stored: 'de', languages: ['ja'] })).toEqual({ locale: 'de', redirect: '/de/scan' });
    expect(chooseLocale({ pathname: '/', stored: null, languages: ['ja-JP'] })).toEqual({ locale: 'ja', redirect: '/ja/' });
    // A visitor who chose English stays at the root whatever the browser says.
    expect(chooseLocale({ pathname: '/', stored: 'en', languages: ['es'] })).toEqual({ locale: 'en', redirect: null });
    // A crawler sends no languages: English, no redirect.
    expect(chooseLocale({ pathname: '/', stored: null, languages: [] })).toEqual({ locale: 'en', redirect: null });
    // A stored value that is not one of ours is ignored.
    expect(chooseLocale({ pathname: '/', stored: 'xx', languages: ['pt-BR'] })).toEqual({ locale: 'pt', redirect: '/pt/' });
  });
});
