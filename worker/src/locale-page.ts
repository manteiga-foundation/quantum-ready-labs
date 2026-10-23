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

/** The home page in every language, then the default for everyone else. */
function alternates(origin: string): { hreflang: string; href: string }[] {
  return [...LOCALES.map((l) => ({ hreflang: HTML_LANG[l], href: origin + localePath(l, '/') })), { hreflang: 'x-default', href: origin + '/' }];
}

export function localizePage(index: Response, pathname: string, origin: string): Response {
  const { locale, rest } = splitPath(pathname);
  const t = MESSAGES[locale];
  const home = origin + localePath(locale, '/');
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
    ...(rest === '/' ? alternates(origin).map((a) => `<link rel="alternate" hreflang="${escapeAttr(a.hreflang)}" href="${escapeAttr(a.href)}">`) : []),
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

/** Every home page with its alternates, then the English-only pages worth indexing. */
export function sitemapXml(origin: string, studySlugs: string[]): string {
  const links = alternates(origin)
    .map((a) => `    <xhtml:link rel="alternate" hreflang="${escapeAttr(a.hreflang)}" href="${escapeAttr(a.href)}"/>`)
    .join('\n');
  const homes = LOCALES.map((l) => `  <url>\n    <loc>${origin}${localePath(l, '/')}</loc>\n${links}\n  </url>`);
  const others = ['/studies', ...studySlugs.map((s) => `/studies/${s}`), '/api'].map((p) => `  <url>\n    <loc>${origin}${p}</loc>\n  </url>`);
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">',
    ...homes,
    ...others,
    '</urlset>',
    '',
  ].join('\n');
}
