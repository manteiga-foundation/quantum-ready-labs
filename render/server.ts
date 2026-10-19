// The renderer: one Chromium, kept warm, printing the report HTML to PDF. Never public: the
// edge calls it with the shared token. Fonts are served from the bundled @fontsource files so the
// output is the same on every machine.

import { chromium, type Browser } from 'playwright';
import { join } from 'node:path';
import { FONT_FILES, renderReportHtml, type FontFile } from '../engine/report-html';
import { renderLettersHtml, type Letter, type LetterOptions } from '../engine/letter-html';
import type { ScanResult } from '../engine/events';

export interface RenderServerOptions {
  port?: number;
  hostname?: string;
  token: string;
}

export interface RenderServer {
  url: string;
  port: number;
  stop(): Promise<void>;
}

const FONT_DIRS = [join(import.meta.dir, '../node_modules/@fontsource/titillium-web/files'), join(import.meta.dir, '../node_modules/@fontsource/jetbrains-mono/files')];

/** The fonts as data URLs: the document is self-contained, so the render depends on nothing but Chromium. */
async function loadFonts(): Promise<Record<FontFile, string>> {
  const out = {} as Record<FontFile, string>;
  for (const name of FONT_FILES) {
    for (const dir of FONT_DIRS) {
      const file = Bun.file(join(dir, name));
      if (await file.exists()) {
        out[name] = `data:font/woff2;base64,${Buffer.from(await file.arrayBuffer()).toString('base64')}`;
        break;
      }
    }
    if (!out[name]) throw new Error(`font not found: ${name}`);
  }
  return out;
}

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

export async function createRenderServer(options: RenderServerOptions): Promise<RenderServer> {
  const { port = 8790, hostname = '0.0.0.0', token } = options;
  let browser: Browser | null = null;
  const getBrowser = async () => {
    if (!browser || !browser.isConnected()) browser = await chromium.launch({ args: ['--font-render-hinting=none'] });
    return browser;
  };
  let rendering = 0;
  const fontUrls = await loadFonts();
  // Chromium starts with the process, not with the first PDF: a wake-up ping on /health is enough
  // to make the first render warm.
  const warm = getBrowser().catch((e) => console.error('chromium failed to start', e));

  const server = Bun.serve({
    hostname,
    port,
    idleTimeout: 60,
    async fetch(req) {
      const url = new URL(req.url);
      if (url.pathname === '/health') {
        await warm;
        return json({ ok: true, rendering, browser: !!browser?.isConnected() });
      }
      if (url.pathname.startsWith('/fonts/')) {
        const name = url.pathname.slice('/fonts/'.length);
        if (!/^[a-z0-9-]+\.woff2$/.test(name)) return new Response('not found', { status: 404 });
        for (const dir of FONT_DIRS) {
          const file = Bun.file(join(dir, name));
          if (await file.exists()) return new Response(file, { headers: { 'content-type': 'font/woff2', 'cache-control': 'public, max-age=31536000' } });
        }
        return new Response('not found', { status: 404 });
      }
      if (req.method === 'POST' && (url.pathname === '/letters.pdf' || url.pathname === '/letters.html')) {
        if (!token || req.headers.get('authorization') !== `Bearer ${token}`) return json({ error: 'unauthorized' }, 401);
        let body: { letters?: Letter[]; generatedAt?: string; signer?: LetterOptions['signer'] };
        try {
          body = (await req.json()) as typeof body;
        } catch {
          return json({ error: 'The request body must be JSON.' }, 400);
        }
        if (!Array.isArray(body.letters) || body.letters.length === 0 || body.letters.length > 200) return json({ error: 'letters: 1 to 200 entries' }, 400);
        if (!body.signer || typeof body.signer.name !== 'string' || typeof body.signer.title !== 'string') return json({ error: 'signer {name, title} is required' }, 400);
        for (const l of body.letters) if (!l || typeof l.institution !== 'string' || !l.result?.assessment || !l.result?.target) return json({ error: 'each letter needs institution and result' }, 400);
        const generatedAt = body.generatedAt ? new Date(body.generatedAt) : new Date();
        if (Number.isNaN(generatedAt.getTime())) return json({ error: 'generatedAt must be a date' }, 400);
        const html = await renderLettersHtml(body.letters, { generatedAt, signer: body.signer, fontUrls });
        if (url.pathname === '/letters.html') return new Response(html, { headers: { 'content-type': 'text/html; charset=utf-8' } });
        rendering++;
        try {
          const page = await (await getBrowser()).newPage();
          try {
            await page.setContent(html, { waitUntil: 'load' });
            await page.evaluate('document.fonts.ready');
            const pdf = await page.pdf({ width: '8.5in', height: '11in', printBackground: true, preferCSSPageSize: true, margin: { top: 0, right: 0, bottom: 0, left: 0 } });
            return new Response(pdf, { headers: { 'content-type': 'application/pdf', 'content-disposition': `attachment; filename="letters-${generatedAt.toISOString().slice(0, 10)}.pdf"`, 'cache-control': 'no-store' } });
          } finally {
            await page.close();
          }
        } catch (e) {
          console.error(e);
          return json({ error: 'The letters could not be rendered.' }, 500);
        } finally {
          rendering--;
        }
      }
      if (req.method === 'POST' && (url.pathname === '/pdf' || url.pathname === '/html')) {
        if (!token || req.headers.get('authorization') !== `Bearer ${token}`) return json({ error: 'unauthorized' }, 401);
        let body: { result?: ScanResult; shareUrl?: string | null; generatedAt?: string; preparedFor?: string | null };
        try {
          body = (await req.json()) as typeof body;
        } catch {
          return json({ error: 'The request body must be JSON.' }, 400);
        }
        const result = body.result;
        if (!result || typeof result !== 'object' || !result.target || !result.assessment || !result.findings) return json({ error: 'result is required' }, 400);
        const generatedAt = body.generatedAt ? new Date(body.generatedAt) : new Date();
        if (Number.isNaN(generatedAt.getTime())) return json({ error: 'generatedAt must be a date' }, 400);
        const html = renderReportHtml(result, { generatedAt, shareUrl: body.shareUrl ?? null, preparedFor: body.preparedFor ?? null, fontUrls });
        if (url.pathname === '/html') return new Response(html, { headers: { 'content-type': 'text/html; charset=utf-8' } });
        rendering++;
        try {
          const page = await (await getBrowser()).newPage();
          try {
            await page.setContent(html, { waitUntil: 'load' });
            await page.evaluate('document.fonts.ready');
            const pdf = await page.pdf({ width: '11in', height: '8.5in', printBackground: true, preferCSSPageSize: true, margin: { top: 0, right: 0, bottom: 0, left: 0 } });
            const host = result.target.port === 443 ? result.target.host : `${result.target.host}-${result.target.port}`;
            const name = `quantum-readiness-${host.replace(/[^a-z0-9.-]/gi, '_')}-${generatedAt.toISOString().slice(0, 10)}.pdf`;
            return new Response(pdf, { headers: { 'content-type': 'application/pdf', 'content-disposition': `attachment; filename="${name}"`, 'cache-control': 'no-store' } });
          } finally {
            await page.close();
          }
        } catch (e) {
          console.error(e);
          return json({ error: 'The report could not be rendered.' }, 500);
        } finally {
          rendering--;
        }
      }
      return json({ error: 'not found' }, 404);
    },
  });

  return {
    url: `http://127.0.0.1:${server.port}`,
    port: server.port!,
    stop: async () => {
      server.stop(true);
      await browser?.close();
    },
  };
}

if (import.meta.main) {
  const token = process.env.RENDER_TOKEN ?? '';
  if (!token) console.error('RENDER_TOKEN is not set: every render will be refused.');
  const server = await createRenderServer({ port: Number(process.env.PORT ?? 8790), token });
  console.log(`quantum-ready-labs renderer on ${server.url}`);
}
