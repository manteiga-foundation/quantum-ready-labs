// Drives the production site once in Chromium and reports what the ring passed through.
import { chromium } from 'playwright';
const host = process.argv[2] ?? 'google.com';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors: string[] = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto('https://quantumreadylabs.com/');
const field = page.getByRole('textbox', { name: 'Host' });
await field.waitFor({ state: 'visible' });
await field.fill(host);
await field.press('Enter');
const words: string[] = [];
const t0 = Date.now();
for (let i = 0; i < 200; i++) {
  const w = ((await page.getByTestId('stage-word').textContent().catch(() => '')) ?? '').trim();
  const last = words.at(-1)?.split('@')[0];
  if (w && last !== w) words.push(`${w}@${Date.now() - t0}ms`);
  if ((await page.getByTestId('next-step').count()) > 0) break;
  await page.waitForTimeout(40);
}
console.log('ring:', words.join(' -> '));
console.log('h1:', (await page.getByRole('heading', { level: 1 }).textContent())?.trim(), '| score', await page.getByTestId('score').textContent());
console.log('url:', page.url(), '| errors:', errors.length);
await page.screenshot({ path: `docs/screenshots/live-${host.replace(/[^a-z0-9.-]/gi, '_')}-1440.png` });
await browser.close();
