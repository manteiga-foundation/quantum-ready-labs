// Renders the PDF report's pages as PNGs for review: `bun run scripts/report-pages.ts [fixture] [outDir]`.
// Uses the same HTML the renderer prints, screenshotting each .slide at 2x.
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { createRenderServer } from '../render/server';
import { SCAN_FIXTURES } from '../web/src/fixtures';

const name = process.argv[2] ?? 'protected';
const out = process.argv[3] ?? 'docs/screenshots/report-pdf';
mkdirSync(out, { recursive: true });
const fixture = SCAN_FIXTURES[name];
if (!fixture) throw new Error(`no fixture ${name}`);

const server = await createRenderServer({ port: 0, token: 'pages' });
const html = await (
  await fetch(`${server.url}/html`, { method: 'POST', headers: { authorization: 'Bearer pages', 'content-type': 'application/json' }, body: JSON.stringify({ result: fixture.result, generatedAt: '2026-10-18T12:00:00Z', shareUrl: 'https://quantumreadylabs.com/r/demo' }) })
).text();
const pdf = await (
  await fetch(`${server.url}/pdf`, { method: 'POST', headers: { authorization: 'Bearer pages', 'content-type': 'application/json' }, body: JSON.stringify({ result: fixture.result, generatedAt: '2026-10-18T12:00:00Z', shareUrl: 'https://quantumreadylabs.com/r/demo' }) })
).arrayBuffer();
await Bun.write(`${out}/${name}.pdf`, pdf);

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1200, height: 900 }, deviceScaleFactor: 2 });
await page.setContent(html, { waitUntil: 'load' });
await page.evaluate('document.fonts.ready');
await page.addStyleTag({ content: 'html,body{background:white!important;padding:0!important} .slide{margin:0!important;box-shadow:none!important}' });
const slides = page.locator('.slide');
const n = await slides.count();
const measures = (await page.evaluate(`[...document.querySelectorAll('.slide')].map((el) => {
  const top = el.getBoundingClientRect().top;
  const c = el.querySelector('.content, .cover-body'); const f = el.querySelector('.footer');
  const widest = [...el.querySelectorAll('*')].reduce((w, x) => Math.max(w, x.getBoundingClientRect().right - el.getBoundingClientRect().left), 0);
  const lowest = [...c.querySelectorAll('*')].reduce((b, x) => Math.max(b, x.getBoundingClientRect().bottom - top), 0);
  return { contentBottom: Math.round(lowest), footerTop: f ? Math.round(f.getBoundingClientRect().top - top) : null, widest: Math.round(widest), width: el.clientWidth, height: el.clientHeight };
})`)) as { contentBottom: number; footerTop: number | null; widest: number; width: number; height: number }[];
for (let i = 0; i < n; i++) {
  await slides.nth(i).screenshot({ path: `${out}/${name}-page-${i + 1}.png` });
  const m = measures[i];
  const flag = m.contentBottom > (m.footerTop ?? m.height) ? '  <-- content runs into the footer' : m.widest > m.width ? '  <-- overflows sideways' : '';
  console.log(`${out}/${name}-page-${i + 1}.png content bottom ${m.contentBottom}px, footer top ${m.footerTop}px, widest ${m.widest}/${m.width}px${flag}`);
}
await browser.close();
await server.stop();
console.log(`${out}/${name}.pdf (${pdf.byteLength} bytes)`);
