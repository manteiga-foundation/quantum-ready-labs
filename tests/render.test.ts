import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { createRenderServer, type RenderServer } from '../render/server';
import { REPORT_PAGES } from '../engine/report-html';
import protectedFixture from '../web/src/fixtures/protected.json';

// The renderer: the same Chromium prints the same bytes for the same result. Browser-bound,
// so this file stays out of the CI subset.

let server: RenderServer;
beforeAll(async () => {
  server = await createRenderServer({ port: 0, token: 'render-test' });
});
afterAll(async () => {
  await server?.stop();
});

async function pdfFor(body: unknown, token = 'render-test'): Promise<Response> {
  return fetch(`${server.url}/pdf`, { method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: JSON.stringify(body) });
}

describe('the PDF renderer', () => {
  test('refuses without the token', async () => {
    const res = await pdfFor({ result: protectedFixture.result }, 'wrong');
    expect(res.status).toBe(401);
  });

  test('prints a landscape Letter PDF with one page per slide, under 1.5 MB, with the fonts embedded', async () => {
    const res = await pdfFor({ result: protectedFixture.result, shareUrl: 'https://quantumreadylabs.com/r/abc', generatedAt: '2026-10-18T12:00:00Z' });
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('application/pdf');
    const bytes = new Uint8Array(await res.arrayBuffer());
    expect(String.fromCharCode(...bytes.subarray(0, 5))).toBe('%PDF-');
    expect(bytes.length).toBeLessThan(1.5e6);
    const text = Buffer.from(bytes).toString('latin1');
    expect((text.match(/\/Type\s*\/Page[^s]/g) ?? []).length).toBe(REPORT_PAGES);
    expect(text).toMatch(/\/MediaBox\s*\[\s*0\s+0\s+792\s+612\s*\]/);
    // Never print the PDF in a failure message; summarise the font names instead.
    const fonts = [...new Set(text.match(/\/BaseFont\s*\/[A-Z]+\+([^\s/>]+)/g)?.map((m) => m.replace(/.*\+/, '')) ?? [])];
    expect(fonts.some((f) => /Titillium/.test(f)), fonts.join(', ')).toBe(true);
    expect(fonts.some((f) => /Helvetica|Courier|Times/.test(f)), fonts.join(', ')).toBe(false);
  }, 60000);

  test('the same result renders the same bytes twice (deterministic, given the same date)', async () => {
    const body = { result: protectedFixture.result, generatedAt: '2026-10-18T12:00:00Z', shareUrl: null };
    const a = Buffer.from(await (await pdfFor(body)).arrayBuffer());
    const b = Buffer.from(await (await pdfFor(body)).arrayBuffer());
    // PDF metadata carries creation timestamps; compare the content streams, not the whole file.
    const strip = (buf: Buffer) => buf.toString('latin1').replace(/\/(CreationDate|ModDate)\s*\([^)]*\)/g, '').replace(/\/ID\s*\[[^\]]*\]/g, '');
    expect(strip(a)).toBe(strip(b));
  }, 60000);

  test('a bad body is a 400, not a crash', async () => {
    const res = await pdfFor({ nothing: true });
    expect(res.status).toBe(400);
  });

  test('prints letters: one portrait page per institution', async () => {
    const res = await fetch(`${server.url}/letters.pdf`, {
      method: 'POST',
      headers: { authorization: 'Bearer render-test', 'content-type': 'application/json' },
      body: JSON.stringify({ generatedAt: '2026-10-18T12:00:00Z', signer: { name: 'A. Signer', title: 'Manteiga Foundation' }, letters: [{ result: protectedFixture.result, institution: 'One', shareUrl: 'https://quantumreadylabs.com/r/a' }, { result: protectedFixture.result, institution: 'Two', shareUrl: null }] }),
    });
    expect(res.status).toBe(200);
    const text = Buffer.from(await res.arrayBuffer()).toString('latin1');
    expect((text.match(/\/Type\s*\/Page[^s]/g) ?? []).length).toBe(2);
    expect(text).toMatch(/\/MediaBox\s*\[\s*0\s+0\s+612\s+792\s*\]/);
  }, 60000);
});
