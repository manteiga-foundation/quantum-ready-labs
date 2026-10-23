import { describe, expect, test } from 'bun:test';
import { localizePage, sitemapXml } from '../worker/src/locale-page';

// What a search engine reads before any script runs: each language's page carries its own lang,
// title, description, canonical address, Open Graph locale and the static heading, and the home
// pages point at each other with hreflang. Bun implements HTMLRewriter, so the edge's rewrite runs
// here as it runs on Cloudflare.

const ORIGIN = 'https://quantumreadylabs.com';
const index = await Bun.file(new URL('../web/index.html', import.meta.url)).text();

async function rewrite(pathname: string): Promise<string> {
  const res = localizePage(new Response(index, { headers: { 'content-type': 'text/html' } }), pathname, ORIGIN);
  return res.text();
}

const attr = (html: string, selector: RegExp) => html.match(selector)?.[1] ?? null;

describe('the edge: each language as a search engine sees it', () => {
  test('/es/ is Spanish before any script runs', async () => {
    const html = await rewrite('/es/');
    expect(attr(html, /<html lang="([^"]+)"/)).toBe('es');
    expect(attr(html, /<title>([^<]+)<\/title>/)).toBe('Quantum Ready Labs: ¿está su host preparado para la era cuántica?');
    expect(attr(html, /<meta name="description" content="([^"]+)"/)).toMatch(/^Compruebe si cualquier host público/);
    expect(attr(html, /<meta property="og:title" content="([^"]+)"/)).toMatch(/¿está listo para la era cuántica\?/);
    expect(attr(html, /<meta property="og:locale" content="([^"]+)"/)).toBe('es_ES');
    expect(attr(html, /<meta property="og:url" content="([^"]+)"/)).toBe(`${ORIGIN}/es/`);
    expect(attr(html, /<link rel="canonical" href="([^"]+)"/)).toBe(`${ORIGIN}/es/`);
    expect(attr(html, /<h1>([^<]+)<\/h1>/)).toBe('¿Está listo para la era cuántica?');
    expect(html).toContain('Escriba el nombre de un host.');
  });

  test('every home page lists all six languages and the default with hreflang', async () => {
    for (const path of ['/', '/ja/']) {
      const html = await rewrite(path);
      const alternates = [...html.matchAll(/<link rel="alternate" hreflang="([^"]+)" href="([^"]+)">/g)].map((m) => [m[1], m[2]]);
      expect(alternates).toEqual([
        ['en', `${ORIGIN}/`],
        ['es', `${ORIGIN}/es/`],
        ['pt-BR', `${ORIGIN}/pt/`],
        ['fr', `${ORIGIN}/fr/`],
        ['de', `${ORIGIN}/de/`],
        ['ja', `${ORIGIN}/ja/`],
        ['x-default', `${ORIGIN}/`],
      ]);
    }
  });

  test('English stays exactly as it was, plus the alternates and og:locale', async () => {
    const html = await rewrite('/');
    expect(attr(html, /<html lang="([^"]+)"/)).toBe('en');
    expect(attr(html, /<title>([^<]+)<\/title>/)).toBe('Quantum Ready Labs: is your host ready for the quantum era?');
    expect(attr(html, /<link rel="canonical" href="([^"]+)"/)).toBe(`${ORIGIN}/`);
    expect(attr(html, /<meta property="og:locale" content="([^"]+)"/)).toBe('en_US');
  });

  test('a report page in a language is that language, without alternates of its own', async () => {
    const html = await rewrite('/de/scan');
    expect(attr(html, /<html lang="([^"]+)"/)).toBe('de');
    expect(attr(html, /<title>([^<]+)<\/title>/)).toMatch(/Quantenzeitalter/);
    expect(html).not.toContain('hreflang');
  });

  test('the study pages are translated too: each language is its own canonical, with alternates', async () => {
    for (const rest of ['/studies', '/studies/florida-financial-2026q4']) {
      const html = await rewrite(`/fr${rest}`);
      expect(attr(html, /<link rel="canonical" href="([^"]+)"/)).toBe(`${ORIGIN}/fr${rest}`);
      const alternates = [...html.matchAll(/<link rel="alternate" hreflang="([^"]+)" href="([^"]+)">/g)].map((m) => [m[1], m[2]]);
      expect(alternates).toContainEqual(['ja', `${ORIGIN}/ja${rest}`]);
      expect(alternates).toContainEqual(['x-default', `${ORIGIN}${rest}`]);
      expect(alternates.length).toBe(7);
    }
  });

  test('the sitemap lists every translated page with its alternates, then the API page', () => {
    const xml = sitemapXml(ORIGIN, ['florida-financial-2026q4']);
    for (const path of ['/', '/es/', '/pt/', '/fr/', '/de/', '/ja/']) expect(xml).toContain(`<loc>${ORIGIN}${path}</loc>`);
    expect(xml).toContain(`<xhtml:link rel="alternate" hreflang="pt-BR" href="${ORIGIN}/pt/"/>`);
    expect(xml).toContain(`<loc>${ORIGIN}/studies/florida-financial-2026q4</loc>`);
    expect(xml).toContain(`<loc>${ORIGIN}/de/studies/florida-financial-2026q4</loc>`);
    expect(xml).toContain(`<xhtml:link rel="alternate" hreflang="ja" href="${ORIGIN}/ja/studies"/>`);
    expect(xml.match(/<url>/g)?.length).toBe(6 * 3 + 1);
  });
});
