// What a search engine reads before any script runs, per language: the edge rewrites the static
// index (lang, title, description, canonical, Open Graph, the prerendered heading) for the path's
// language, and the home pages name each other with hreflang. Also the sitemap. Runs wherever
// HTMLRewriter exists: Cloudflare Workers and Bun (the tests).

import { HTML_LANG, LOCALES, localePath, OG_LOCALE, splitPath } from '../../web/src/i18n/locales';
import { MESSAGES } from '../../web/src/i18n/messages';
import { escapeAttr } from './policy';

/** The slice of HTMLRewriter's element this file uses; Workers and Bun name the full type differently. */
interface RewriterElement {
  setAttribute(name: string, value: string): unknown;
  setInnerContent(content: string): unknown;
  append(content: string, options?: { html?: boolean }): unknown;
}

/** The pages that exist in every language: the home page and the studies. */
function isTranslated(rest: string): boolean {
  return rest === '/' || rest === '/studies' || /^\/studies\/[a-z0-9-]+$/.test(rest);
}

/** The same page in every language, then the default for everyone else. */
function alternates(origin: string, rest = '/'): { hreflang: string; href: string }[] {
  return [...LOCALES.map((l) => ({ hreflang: HTML_LANG[l], href: origin + localePath(l, rest) })), { hreflang: 'x-default', href: origin + rest }];
}

export function localizePage(index: Response, pathname: string, origin: string): Response {
  const { locale, rest } = splitPath(pathname);
  const t = MESSAGES[locale];
  const translated = isTranslated(rest);
  // A translated page is its own canonical; any other page (a report) points at its language's home, as before.
  const home = origin + localePath(locale, translated ? rest : '/');
  const set = (attr: string, value: string) => ({
    element(el: RewriterElement) {
      el.setAttribute(attr, value);
    },
  });
  const text = (value: string) => ({
    element(el: RewriterElement) {
      el.setInnerContent(value);
    },
  });
  const headExtra = [
    `<meta property="og:locale" content="${OG_LOCALE[locale]}">`,
    ...(translated ? alternates(origin, rest).map((a) => `<link rel="alternate" hreflang="${escapeAttr(a.hreflang)}" href="${escapeAttr(a.href)}">`) : []),
  ].join('\n    ');
  return new HTMLRewriter()
    .on('html', set('lang', HTML_LANG[locale]))
    .on('title', text(t.meta.title))
    .on('meta[name="description"]', set('content', t.meta.description))
    .on('meta[property="og:title"]', set('content', t.meta.ogTitle))
    .on('meta[property="og:description"]', set('content', t.meta.ogDescription))
    .on('meta[property="og:url"]', set('content', home))
    .on('meta[name="twitter:title"]', set('content', t.meta.ogTitle))
    .on('meta[name="twitter:description"]', set('content', t.meta.twitterDescription))
    .on('link[rel="canonical"]', set('href', home))
    .on('main.static h1', text(t.entry.h1))
    .on('main.static p', text(t.entry.sub))
    .on('head', {
      element(el: RewriterElement) {
        el.append(`    ${headExtra}\n  `, { html: true });
      },
    })
    .transform(index);
}

/** Every translated page in every language with its alternates, then the English-only API page. */
export function sitemapXml(origin: string, studySlugs: string[]): string {
  const pages = ['/', '/studies', ...studySlugs.map((s) => `/studies/${s}`)].flatMap((rest) => {
    const links = alternates(origin, rest)
      .map((a) => `    <xhtml:link rel="alternate" hreflang="${escapeAttr(a.hreflang)}" href="${escapeAttr(a.href)}"/>`)
      .join('\n');
    return LOCALES.map((l) => `  <url>\n    <loc>${origin}${localePath(l, rest)}</loc>\n${links}\n  </url>`);
  });
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">',
    ...pages,
    `  <url>\n    <loc>${origin}/api</loc>\n  </url>`,
    '</urlset>',
    '',
  ].join('\n');
}
