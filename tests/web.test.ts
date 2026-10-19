import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { chromium, type Browser, type Locator, type Page } from 'playwright';
import { startVite, type ViteServer } from './vite';

// The views, in real Chromium, against the emulated scans (?demo=<fixture> replays a recorded
// event stream with short delays, so the live behaviour is deterministic and offline).

let vite: ViteServer;
let browser: Browser;

async function open(path: string, viewport = { width: 1440, height: 900 }): Promise<{ page: Page; errors: string[] }> {
  const context = await browser.newContext({ viewport });
  const page = await context.newPage();
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(vite.url + path);
  return { page, errors };
}

/** Waits until the locator's first match is visible and carries the text (Arwes keeps entering nodes hidden). */
async function see(locator: Locator, text?: string | RegExp, timeout = 10000): Promise<void> {
  const target = text === undefined ? locator.first() : locator.filter({ hasText: text }).first();
  await target.waitFor({ state: 'visible', timeout });
}

const exact = (s: string) => new RegExp(`^\\s*${s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*$`);

beforeAll(async () => {
  vite = await startVite();
  browser = await chromium.launch({ args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] });
});
afterAll(async () => {
  await browser?.close();
  vite?.stop();
});

describe('view 1: entry', () => {
  test('the question, one field, one button; nothing starts without a valid host', async () => {
    const { page, errors } = await open('/');
    await see(page.getByRole('heading', { level: 1 }), exact('Are you quantum ready?'));
    const field = page.getByRole('textbox', { name: 'Host' });
    await see(field);
    await see(page.getByRole('button', { name: 'Test' }));
    await field.fill('not a host');
    await page.getByRole('button', { name: 'Test' }).click();
    await see(page.getByRole('alert'), /not a valid host name/);
    expect(page.url()).toBe(vite.url + '/');
    expect(errors).toEqual([]);
    await page.context().close();
  });

  test('the page carries the words a search engine and a link preview need', async () => {
    const { page } = await open('/');
    expect(await page.title()).toContain('Quantum Ready Labs');
    expect(await page.locator('meta[name="description"]').getAttribute('content')).toBeTruthy();
    expect(await page.locator('meta[property="og:title"]').getAttribute('content')).toContain('Quantum Ready');
    expect(await page.locator('meta[property="og:image"]').getAttribute('content')).toBeTruthy();
    await see(page.getByText(/opens a TLS connection to the host you enter/i));
    await page.context().close();
  });
});

describe('view 2: the live report', () => {
  test('Enter starts the scan; the ring climbs from worse to better and lands on the stage word', async () => {
    const { page, errors } = await open('/?demo=protected');
    const field = page.getByRole('textbox', { name: 'Host' });
    await see(field);
    await field.fill('protected.example');
    await field.press('Enter');
    await see(page.getByTestId('ring'));
    const words: string[] = [];
    for (let i = 0; i < 80; i++) {
      const w = ((await page.getByTestId('stage-word').textContent()) ?? '').trim();
      if (w && words.at(-1) !== w) words.push(w);
      if (w === 'PROTECTED') break;
      await page.waitForTimeout(50);
    }
    expect(words.at(-1)).toBe('PROTECTED');
    expect(words[0]).not.toBe('PROTECTED');
    await see(page.getByTestId('score'), exact('85'));
    await see(page.getByRole('heading', { level: 1 }), exact('Quantum ready'));
    await see(page.getByTestId('verdict'), /protected against future quantum decryption/);
    await see(page.getByTestId('next-step'), /Retire RSA key transport/);
    await see(page.getByRole('heading', { name: 'Recommendations' }));
    await see(page.getByRole('heading', { name: 'Technical details' }));
    expect(await page.getByTestId('probe-row').count()).toBe(14);
    expect(await page.getByTestId('chain-link').count()).toBe(4);
    await see(page.getByRole('button', { name: 'Download report' }));
    expect(errors).toEqual([]);
    await page.context().close();
  });

  test('an exposed host reads "Not yet quantum ready" with the TLS 1.3 step', async () => {
    const { page } = await open('/?demo=exposed');
    const field = page.getByRole('textbox', { name: 'Host' });
    await see(field);
    await field.fill('exposed.example:1012');
    await page.getByRole('button', { name: 'Test' }).click();
    await see(page.getByTestId('stage-word'), exact('EXPOSED'));
    await see(page.getByRole('heading', { level: 1 }), exact('Not yet quantum ready'));
    await see(page.getByTestId('next-step'), /Enable TLS 1.3/);
    await see(page.getByTestId('certificate-card'), /cannot yet be made/i);
    await page.context().close();
  });

  test('on a phone the ring sits above the summary and nothing overflows sideways', async () => {
    const { page } = await open('/?demo=at-risk', { width: 390, height: 844 });
    const field = page.getByRole('textbox', { name: 'Host' });
    await see(field);
    await field.fill('at-risk.example');
    await field.press('Enter');
    await see(page.getByTestId('stage-word'), exact('AT RISK'));
    await see(page.getByTestId('score'), exact('49'));
    const ring = await page.getByTestId('ring').boundingBox();
    const summary = await page.getByTestId('summary').boundingBox();
    expect(ring!.y + ring!.height).toBeLessThanOrEqual(summary!.y + 1);
    const overflow = await page.evaluate('document.documentElement.scrollWidth - document.documentElement.clientWidth');
    expect(overflow).toBeLessThanOrEqual(0);
    await page.context().close();
  });

  test('a shared result opens finished, with the call to action to check another host', async () => {
    const { page, errors } = await open('/r/demo-protected');
    await see(page.getByTestId('stage-word'), exact('PROTECTED'));
    await see(page.getByRole('link', { name: /check your own host/i }));
    expect(errors).toEqual([]);
    await page.context().close();
  });
});

describe('view 3: the private metrics view', () => {
  test('counts first, trends second, failures third, from emulated data', async () => {
    const { page, errors } = await open('/metrics?demo=1');
    await see(page.getByRole('heading', { level: 1 }), exact('Metrics'));
    await see(page.getByTestId('metric-scans'), /\d/);
    await see(page.getByTestId('metric-hosts'), /\d/);
    await see(page.getByRole('heading', { name: 'Readiness over time' }));
    await see(page.getByRole('heading', { name: 'Failures' }));
    expect(await page.getByTestId('trend-day').count()).toBeGreaterThan(7);
    await see(page.getByRole('heading', { name: 'Hosts tested' }));
    const rows = page.getByTestId('host-row');
    expect(await rows.count()).toBeGreaterThan(3);
    const first = rows.first();
    await see(first.getByTestId('host-stage'), /EXPOSED|AT RISK|PROTECTED|READY/);
    await see(first.getByTestId('host-score'), /^\s*\d+\s*$/);
    expect(await first.getByRole('link').getAttribute('href')).toMatch(/^\/r\/[A-Za-z0-9_-]+$/);
    expect(errors).toEqual([]);
    await page.context().close();
  });
});
