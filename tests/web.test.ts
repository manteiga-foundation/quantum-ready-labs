import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { chromium, type Browser, type Locator, type Page } from 'playwright';
import { startVite, type ViteServer } from './vite';

// The views, in real Chromium, against the emulated scans (?demo=<fixture> replays a recorded
// event stream with short delays, so the live behaviour is deterministic and offline).

let vite: ViteServer;
let browser: Browser;

async function open(path: string, viewport = { width: 1440, height: 900 }, locale = 'en-US'): Promise<{ page: Page; errors: string[] }> {
  const context = await browser.newContext({ viewport, locale });
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
    // The top bar: the name with "By Manteiga Foundation" small under it; Source, How we score, API, each with an icon.
    await see(page.getByTestId('byline'), exact('By Manteiga Foundation'));
    expect(await page.getByTestId('byline').getAttribute('href')).toBe('https://manteiga.org');
    const nav = page.getByRole('navigation', { name: 'Site' });
    expect(await nav.getByRole('link').allTextContents()).toEqual(['Source', 'How we score', 'Studies', 'API']);
    expect(await nav.locator('a svg').count()).toBe(4);
    expect(await nav.getByRole('link', { name: 'Studies' }).getAttribute('href')).toBe('/studies');
    expect(await nav.getByRole('link', { name: 'API' }).getAttribute('href')).toBe('/api');
    expect(await page.getByRole('contentinfo').getByRole('link', { name: 'Manteiga Foundation' }).getAttribute('href')).toBe('https://manteiga.org');
    // Below the field: the questions people ask, answered in a list, the certificate one first.
    await see(page.getByRole('heading', { name: 'Questions' }));
    const questions = page.getByTestId('faq-question');
    expect(await questions.count()).toBeGreaterThanOrEqual(6);
    await see(questions.first(), /certificate/i);
    await see(page.getByTestId('faq'), /harvest now, decrypt later/i);
    await see(page.getByTestId('faq'), /--private/);
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
    // The PDF is prepared while the dialog is open, with a visible progress state (the renderer can
    // take seconds when cold); the download itself is a blob, so the tab never navigates away.
    await page.route('**/api/report/*.pdf', async (route) => {
      await new Promise((r) => setTimeout(r, 1200));
      await route.fulfill({ status: 200, contentType: 'application/pdf', headers: { 'content-disposition': 'attachment; filename="quantum-readiness-protected.example.pdf"' }, body: '%PDF-1.4 fake' });
    });
    await page.getByRole('button', { name: 'Download report' }).click();
    await see(page.getByRole('dialog'), /five-page PDF/);
    await see(page.getByTestId('pdf-progress'), /Preparing/);
    expect(await page.getByTestId('download-only').isDisabled()).toBe(true);
    await see(page.getByTestId('download-only'), exact('Download PDF'), 15000);
    expect(await page.getByTestId('download-only').isDisabled()).toBe(false);
    await see(page.getByTestId('pdf-progress'), /ready/i);
    const [download] = await Promise.all([page.waitForEvent('download'), page.getByTestId('download-only').click()]);
    expect(download.suggestedFilename()).toBe('quantum-readiness-protected.example.pdf');
    expect(page.url()).toContain('/scan?host=protected.example'); // the tab stayed on the report
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
    await see(page.getByTestId('metric-pdfs'), /\d/);
    await see(page.getByTestId('metric-share'), /^\s*\d+%\s*$/);
    // Twelve counts in two full rows of six at 1440.
    const counts = (await page.evaluate("[...document.querySelector('.metrics .counts').querySelectorAll('.count')].map(c => Math.round(c.getBoundingClientRect().top))")) as number[];
    expect(counts.length).toBe(12);
    expect(new Set(counts).size).toBe(2);
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
    await see(page.getByRole('heading', { name: 'Studies' }));
    expect(await page.getByTestId('study-row').count()).toBeGreaterThanOrEqual(1);
    // The emails readers leave in the Download dialog: who, for which host, when.
    await see(page.getByRole('heading', { name: 'Quarterly report requests' }));
    await see(page.getByTestId('metric-subscriptions'), /\d/);
    const sub = page.getByTestId('subscription-row').first();
    await see(sub, /@/);
    await see(sub, /\d{4}-\d{2}-\d{2}/);
    expect(errors).toEqual([]);
    await page.context().close();
  });

  test('the hosts table: search, stage chips, sortable columns, 50 to a page, and an .xlsx export', async () => {
    const { page, errors } = await open('/metrics?demo=1');
    await see(page.getByRole('heading', { name: 'Hosts tested' }));
    const rows = page.getByTestId('host-row');
    const all = await rows.count();
    expect(all).toBeGreaterThan(3);
    // The table says what it is showing: all of them, one page.
    await see(page.getByTestId('hosts-count'), new RegExp(`1\u2013${all} of ${all}`));
    // The default order is the most recently tested first, as the notice says.
    const order = async () => (await page.evaluate("[...document.querySelectorAll('[data-testid=host-row] td:first-child')].map(td => td.textContent.trim())")) as string[];
    expect(await order()).toEqual(['ready.example', 'protected.example', 'at-risk.example', 'exposed.example:1012', 'shop.example', 'intranet-portal.example']);
    // The search narrows as it is typed; a stage chip narrows further; All brings everything back.
    const search = page.getByRole('searchbox', { name: 'Search hosts' });
    await search.fill('shop');
    expect(await rows.count()).toBe(1);
    await see(rows.first(), /shop\.example/);
    await search.fill('');
    expect(await rows.count()).toBe(all);
    await page.getByRole('button', { name: /^Exposed 1$/ }).click();
    expect(await rows.count()).toBe(1);
    await see(rows.first().getByTestId('host-stage'), exact('EXPOSED'));
    await page.getByRole('button', { name: /^Exposed 1$/ }).click(); // a chip toggles off
    expect(await rows.count()).toBe(all);
    // Score and scans narrow by number, both ends.
    await page.getByRole('searchbox', { name: 'Search hosts' });
    await page.getByLabel('Minimum score').fill('80');
    expect(await rows.count()).toBe(2);
    await page.getByLabel('Minimum scans').fill('5');
    expect(await rows.count()).toBe(1);
    await see(page.getByTestId('hosts-count'), /narrowed from 6/);
    await page.getByRole('button', { name: 'Clear filters' }).click();
    expect(await rows.count()).toBe(all);
    // A header sorts: numbers biggest first, then the other way; names from the top.
    const scores = async () => (await page.getByTestId('host-score').allTextContents()).map((t) => Number(t.trim()));
    const nonIncreasing = (ns: number[]) => ns.every((n, i) => i === 0 || ns[i - 1] >= n);
    const nonDecreasing = (ns: number[]) => ns.every((n, i) => i === 0 || ns[i - 1] <= n);
    await page.getByRole('button', { name: 'Score' }).click();
    expect(nonIncreasing(await scores())).toBe(true);
    expect(await page.getByRole('button', { name: /^Score/ }).locator('xpath=..').getAttribute('aria-sort')).toBe('descending');
    await page.getByRole('button', { name: 'Score' }).click();
    expect(nonDecreasing(await scores())).toBe(true);
    await page.getByRole('button', { name: 'Host' }).click();
    expect((await order()).slice(0, 2)).toEqual(['at-risk.example', 'exposed.example:1012']);
    // No match says so, rather than showing an empty table with no explanation.
    await search.fill('nothing.matches.this');
    expect(await rows.count()).toBe(0);
    await see(page.getByTestId('hosts-empty'), /No host matches/i);
    await page.getByRole('button', { name: 'Clear filters' }).click();
    expect(await rows.count()).toBe(all);
    // The export is a real .xlsx downloaded as a blob: the tab stays on the metrics view.
    const [download] = await Promise.all([page.waitForEvent('download'), page.getByTestId('hosts-export').click()]);
    expect(download.suggestedFilename()).toMatch(/^quantum-ready-labs-hosts-\d{4}-\d{2}-\d{2}\.xlsx$/);
    expect(page.url()).toContain('/metrics');
    const file = await download.path();
    const bytes = new Uint8Array(await Bun.file(file!).arrayBuffer());
    expect([...bytes.subarray(0, 2)]).toEqual([0x50, 0x4b]); // a zip, PK
    expect(errors).toEqual([]);
    await page.context().close();
  });

  test('a long host list pages 50 at a time, on a phone as on a desktop', async () => {
    // The six rows above plus 131 more: 137 hosts, three pages, the last one short.
    const { page, errors } = await open('/metrics?demo=1&hosts=131');
    await see(page.getByRole('heading', { name: 'Hosts tested' }));
    const rows = page.getByTestId('host-row');
    expect(await rows.count()).toBe(50);
    await see(page.getByTestId('hosts-count'), /1\u201350 of 137/);
    await see(page.getByTestId('hosts-page'), /Page 1 of 3/);
    expect(await page.getByRole('button', { name: 'Previous page' }).isDisabled()).toBe(true);
    // Every column is offered on a desktop.
    expect(await page.getByRole('button', { name: /^Last tested/ }).isVisible()).toBe(true);
    await page.getByRole('button', { name: 'Next page' }).click();
    await see(page.getByTestId('hosts-page'), /Page 2 of 3/);
    await see(page.getByTestId('hosts-count'), /51\u2013100 of 137/);
    expect(await rows.count()).toBe(50);
    await page.getByRole('button', { name: 'Last page' }).click();
    await see(page.getByTestId('hosts-page'), /Page 3 of 3/);
    await see(page.getByTestId('hosts-count'), /101\u2013137 of 137/);
    expect(await rows.count()).toBe(37);
    expect(await page.getByRole('button', { name: 'Next page' }).isDisabled()).toBe(true);
    // A filter resets the pager: page 3 of a narrowed list is noise.
    await page.getByRole('searchbox', { name: 'Search hosts' }).fill('host-');
    await see(page.getByTestId('hosts-page'), /Page 1 of 3/);
    // Phones matter here: the row keeps host, stage and score, the two low-priority columns go, and
    // the table fits its wrap instead of scrolling sideways inside it.
    await page.setViewportSize({ width: 390, height: 844 });
    const first = rows.first();
    await see(first.getByRole('link'));
    await see(first.getByTestId('host-stage'));
    await see(first.getByTestId('host-score'));
    expect(await page.getByRole('button', { name: 'Last tested' }).isVisible()).toBe(false);
    const wrap = (await page.evaluate("(() => { const w = document.querySelector('.table-wrap'); return { scroll: w.scrollWidth, client: w.clientWidth }; })()")) as { scroll: number; client: number };
    expect(wrap.scroll).toBeLessThanOrEqual(wrap.client + 1);
    const overflow = await page.evaluate('document.documentElement.scrollWidth - document.documentElement.clientWidth');
    expect(overflow).toBeLessThanOrEqual(0);
    expect(errors).toEqual([]);
    await page.context().close();
  });

  test('view 4: the API page tells an agent how to scan, read, and fetch the PDF', async () => {
    const { page, errors } = await open('/api');
    await see(page.getByRole('heading', { level: 1 }), exact('The API'));
    await see(page.getByTestId('api-scan'), /POST \/api\/scan/);
    await see(page.getByTestId('api-scan'), /Accept: application\/json/);
    await see(page.getByTestId('api-result'), /GET \/api\/result\//);
    await see(page.getByTestId('api-report'), /GET \/api\/report\//);
    await see(page.getByTestId('api-limits'), /20 scans/);
    expect(await page.getByRole('link', { name: 'openapi.json' }).getAttribute('href')).toBe('/openapi.json');
    expect(await page.getByRole('link', { name: 'llms.txt' }).getAttribute('href')).toBe('/llms.txt');
    expect(errors).toEqual([]);
    await page.context().close();
  });
});

describe('view 5: a study, the state-of-readiness note', () => {
  test('the figures, the calm paragraph, every institution with its links, a filter by stage', async () => {
    const { page, errors } = await open('/studies/florida-financial-2026q4');
    await see(page.getByRole('heading', { level: 1 }), /Florida/);
    // The lead states the figures; the next paragraph says nothing is broken today (alarmism is a bug).
    await see(page.getByTestId('study-lead'), /81/);
    await see(page.getByTestId('study-lead'), /54/);
    await see(page.getByTestId('study-calm'), /nothing is broken today/i);
    await see(page.getByTestId('study-calm'), /The risk is time/);
    await see(page.getByTestId('study-calm'), /The fix is small/);
    // Stage words in the prose carry the stage colour, the same as the count under them.
    const inline = page.locator('[data-testid=study-lead] [data-stage=exposed]').first();
    await see(inline, exact('Exposed'));
    const inlineColour = await inline.evaluate('el => getComputedStyle(el).color');
    const countColour = await page.getByTestId('count-exposed').evaluate('el => getComputedStyle(el).color');
    expect(inlineColour).toBe(countColour);
    // Four counts, one per stage, and a distribution bar with four segments.
    await see(page.getByTestId('count-exposed'), exact('10'));
    await see(page.getByTestId('count-at-risk'), exact('17'));
    await see(page.getByTestId('count-protected'), exact('30'));
    await see(page.getByTestId('count-ready'), exact('24'));
    expect(await page.getByTestId('study-bar').locator('.seg').count()).toBe(4);
    // Every institution, alphabetical, with stage, score, the result page and the PDF.
    const rows = page.getByTestId('institution-row');
    expect(await rows.count()).toBe(81);
    const first = rows.first();
    await see(first.getByTestId('institution-name'), exact('121 Financial Credit Union'));
    await see(first.getByTestId('institution-stage'), exact('AT RISK'));
    await see(first.getByTestId('institution-score'), exact('43'));
    expect(await first.getByRole('link', { name: 'Report' }).getAttribute('href')).toMatch(/^https:\/\/quantumreadylabs\.com\/r\/[A-Za-z0-9_-]{12}$/);
    expect(await first.getByRole('link', { name: 'PDF' }).getAttribute('href')).toMatch(/\/api\/report\/[A-Za-z0-9_-]{12}\.pdf$/);
    expect(await first.getByRole('link', { name: 'Test again' }).getAttribute('href')).toBe('/scan?host=121fcu.org');
    // The filter: Exposed shows the ten, All brings them back.
    await page.getByRole('button', { name: /^Exposed/ }).click();
    expect(await rows.count()).toBe(10);
    await see(rows.first().getByTestId('institution-stage'), exact('EXPOSED'));
    await page.getByRole('button', { name: /^All/ }).click();
    expect(await rows.count()).toBe(81);
    // The method states the date and the handshakes; the page ends with a way to check one's own host.
    await see(page.getByTestId('study-method'), /18 October 2026/);
    await see(page.getByTestId('study-method'), /fourteen TLS handshakes/i);
    // The coverage of this study: a dated text list, each entry linking to the piece, no logos.
    const press = page.getByTestId('study-press');
    await see(press.getByRole('heading', { level: 2 }), /In the press/);
    const items = press.getByRole('listitem');
    expect(await items.count()).toBeGreaterThanOrEqual(3);
    await see(items.first(), /Quantum Zeitgeist/);
    await see(press, /Practical Commerce Chamber/);
    await see(press, /Morgan County Citizen/);
    const hrefs = (await page.evaluate("[...document.querySelectorAll('[data-testid=study-press] li a')].map(a => a.getAttribute('href'))")) as string[];
    expect(hrefs.length).toBe(await items.count());
    for (const href of hrefs) expect(href).toMatch(/^https:\/\//);
    await see(page.getByRole('link', { name: /check your own host/i }));
    expect(await page.title()).toMatch(/Florida/);
    expect(errors).toEqual([]);
    await page.context().close();
  });

  test('on a phone the table keeps name, stage, score and the report link, and nothing overflows', async () => {
    const { page } = await open('/studies/florida-financial-2026q4', { width: 390, height: 844 });
    const first = page.getByTestId('institution-row').first();
    await see(first.getByTestId('institution-name'));
    await see(first.getByTestId('institution-stage'));
    await see(first.getByRole('link', { name: 'Report' }));
    expect(await first.getByTestId('institution-next').isVisible()).toBe(false);
    // The table itself fits the phone: no sideways scroll inside the wrap either.
    const tableRight = await page.evaluate("document.querySelector('.study-table').getBoundingClientRect().right");
    expect(tableRight).toBeLessThanOrEqual(390);
    const overflow = await page.evaluate('document.documentElement.scrollWidth - document.documentElement.clientWidth');
    expect(overflow).toBeLessThanOrEqual(0);
    await page.context().close();
  });

  test('an unknown study says so, and /studies lists the studies', async () => {
    const { page, errors } = await open('/studies/nope');
    await see(page.getByRole('heading', { level: 1 }), exact('No such study'));
    await page.goto(vite.url + '/studies');
    await see(page.getByRole('heading', { level: 1 }), exact('Studies'));
    expect(await page.getByRole('link', { name: /Florida/ }).getAttribute('href')).toBe('/studies/florida-financial-2026q4');
    expect(errors).toEqual([]);
    await page.context().close();
  });
});

describe('languages: detected, chosen, remembered', () => {
  const pathOf = (page: Page) => new URL(page.url()).pathname + new URL(page.url()).search;

  test('a Spanish browser lands on /es/ in Spanish; links, refusals and the selector follow', async () => {
    const { page, errors } = await open('/', undefined, 'es-MX');
    await see(page.getByRole('heading', { level: 1 }), exact('¿Está listo para la era cuántica?'));
    expect(pathOf(page)).toBe('/es/');
    expect(await page.evaluate('document.documentElement.lang')).toBe('es');
    const selector = page.getByRole('combobox', { name: 'Idioma' });
    expect(await selector.inputValue()).toBe('es');
    expect(await selector.locator('option').allTextContents()).toEqual(['English', 'Español', 'Português', 'Français', 'Deutsch', '日本語']);
    const nav = page.getByRole('navigation', { name: 'Site' });
    expect(await nav.getByRole('link', { name: 'Estudios' }).getAttribute('href')).toBe('/es/studies');
    await see(page.getByRole('heading', { name: 'Preguntas' }));
    await page.getByRole('textbox', { name: 'Host' }).fill('not a host');
    await page.getByRole('button', { name: 'Probar' }).click();
    await see(page.getByRole('alert'), exact('No es un nombre de host válido.'));
    expect(errors).toEqual([]);
    await page.context().close();
  });

  test('the selector translates the report in place, without scanning again, and the choice is remembered', async () => {
    const { page, errors } = await open('/scan?host=protected.example&demo=protected');
    await see(page.getByTestId('next-step'), /Retire RSA key transport/, 15000);
    await page.getByRole('combobox', { name: 'Language' }).selectOption('fr');
    expect(pathOf(page)).toBe('/fr/scan?host=protected.example&demo=protected');
    // The finished report is re-worded at once; a new scan would hide the next step for seconds.
    await see(page.getByTestId('next-step'), /Retirez les suites de chiffrement/, 400);
    await see(page.getByTestId('stage-word'), exact('PROTÉGÉ'));
    await see(page.getByRole('heading', { level: 1 }), exact('Prêt pour l’ère quantique'));
    await see(page.getByTestId('verdict'), /protégées contre un futur déchiffrement quantique/);
    // Label and value are joined the French way, with a no-break space before the colon.
    await see(page.getByTestId('key-exchange-card'), /Groupes hybrides\u00a0: X25519MLKEM768/);
    expect(await page.title()).toBe('protected.example\u00a0: protégé · Quantum Ready Labs');
    expect(await page.evaluate('document.documentElement.lang')).toBe('fr');
    // An unprefixed address now opens in French: the choice beats the browser's English.
    await page.goto(vite.url + '/');
    await see(page.getByRole('heading', { level: 1 }), exact('Êtes-vous prêt pour l’ère quantique\u00a0?'));
    expect(pathOf(page)).toBe('/fr/');
    // And choosing English sticks too, even after a reload of the root.
    await page.getByRole('combobox', { name: 'Langue' }).selectOption('en');
    expect(pathOf(page)).toBe('/');
    await page.reload();
    await see(page.getByRole('heading', { level: 1 }), exact('Are you quantum ready?'));
    expect(pathOf(page)).toBe('/');
    expect(errors).toEqual([]);
    await page.context().close();
  });

  test('a shared link keeps its language whatever the browser speaks', async () => {
    const { page, errors } = await open('/es/r/demo-at-risk', undefined, 'de-DE');
    await see(page.getByTestId('stage-word'), exact('EN RIESGO'));
    expect(pathOf(page)).toBe('/es/r/demo-at-risk');
    await see(page.getByTestId('next-step'), /Active el intercambio de claves híbrido/);
    await see(page.getByTestId('certificate-card'), /Clásico, como toda la web pública/);
    await see(page.getByRole('link', { name: 'Pruebe su propio host' }));
    expect(await page.getByRole('link', { name: 'Pruebe su propio host' }).getAttribute('href')).toBe('/es/');
    expect(errors).toEqual([]);
    await page.context().close();
  });

  test('a refusal from the edge is said in the reader\'s language, from its code', async () => {
    const { page } = await open('/ja/scan?host=example.com');
    await page.route('**/api/scan', (route) =>
      route.fulfill({ status: 429, contentType: 'application/json', body: JSON.stringify({ error: 'Too many scans from your address. Please wait a few minutes.', code: 'rate-caller' }) }),
    );
    await page.reload();
    await see(page.getByRole('heading', { level: 1 }), exact('診断は実行されませんでした'));
    await see(page.getByTestId('verdict'), exact('お使いのアドレスからの診断が多すぎます。数分お待ちください。'));
    await page.context().close();
  });

  test('the study page reads in German: prose, live figures in colour, table, filter, method, press', async () => {
    const { page, errors } = await open('/de/studies/florida-financial-2026q4');
    await see(page.getByRole('heading', { level: 1 }), /^Banken und Kreditgenossenschaften in Florida/);
    await see(page.getByTestId('study-lead'), /^Von 81 Banken/);
    await see(page.getByTestId('study-lead'), /Der Median liegt bei 85 von 100/);
    const inline = page.locator('[data-testid=study-lead] [data-stage=exposed]').first();
    await see(inline, exact('Ungeschützt'));
    expect(await inline.evaluate('el => getComputedStyle(el).color')).toBe(await page.getByTestId('count-exposed').evaluate('el => getComputedStyle(el).color'));
    await see(page.getByTestId('study-calm'), /Heute ist nichts kaputt\./);
    await see(page.getByTestId('count-exposed'), exact('10'));
    await see(page.getByRole('columnheader', { name: 'Institut' }));
    const first = page.getByTestId('institution-row').first();
    await see(first.getByTestId('institution-stage'), exact('GEFÄHRDET'));
    await see(first.getByTestId('institution-next'), /Aktivieren Sie hybriden Post-Quanten-Schlüsselaustausch/);
    expect(await first.getByRole('link', { name: 'Bericht' }).getAttribute('href')).toMatch(/^https:\/\/quantumreadylabs\.com\/de\/r\/[A-Za-z0-9_-]{12}$/);
    expect(await first.getByRole('link', { name: 'Erneut testen' }).getAttribute('href')).toBe('/de/scan?host=121fcu.org');
    await page.getByRole('button', { name: /^Ungeschützt/ }).click();
    expect(await page.getByTestId('institution-row').count()).toBe(10);
    await see(page.getByTestId('study-method'), /18\. Oktober 2026/);
    await see(page.getByTestId('study-press').getByRole('heading', { level: 2 }), exact('In der Presse'));
    await see(page.getByTestId('study-press'), /hat darüber geschrieben/);
    expect(await page.title()).toMatch(/^Banken und Kreditgenossenschaften in Florida/);
    await page.goto(vite.url + '/ja/studies');
    await see(page.getByRole('heading', { level: 1 }), exact('調査'));
    expect(await page.getByRole('link', { name: /フロリダ/ }).getAttribute('href')).toBe('/ja/studies/florida-financial-2026q4');
    expect(errors).toEqual([]);
    await page.context().close();
  });

  test('on a phone, in every language, the study table still fits', async () => {
    for (const prefix of ['/de', '/es', '/pt', '/fr', '/ja']) {
      const { page } = await open(`${prefix}/studies/florida-financial-2026q4`, { width: 390, height: 844 });
      await see(page.getByTestId('institution-row').first().getByTestId('institution-name'));
      const fit = (await page.evaluate("(() => { const t = document.querySelector('.study-table'); return t.getBoundingClientRect().right - t.parentElement.getBoundingClientRect().right; })()")) as number;
      // Measured against its own scrolling wrap: a table wider than the wrap scrolls sideways out of sight.
      expect({ prefix, fits: fit <= 0.5 }).toEqual({ prefix, fits: true });
      const overflow = await page.evaluate('document.documentElement.scrollWidth - document.documentElement.clientWidth');
      expect(overflow).toBeLessThanOrEqual(0);
      await page.context().close();
    }
  });

  test('on a phone, in the longest words of every language, the selector stays and the ring word fits', async () => {
    const ringFit = (page: Page) =>
      page.evaluate(`(() => {
        const ring = document.querySelector('[data-testid="ring"] svg').getBoundingClientRect();
        const word = document.querySelector('[data-testid="stage-word"]').getBoundingClientRect();
        const r = ring.width / 2, cx = ring.left + r, cy = ring.top + r;
        // Every corner of the word's box sits inside the track circle (radius 110 of 130), with a margin.
        const inner = r * (104 / 130);
        const corners = [[word.left, word.top], [word.right, word.top], [word.left, word.bottom], [word.right, word.bottom]];
        return { inside: corners.every(([x, y]) => Math.hypot(x - cx, y - cy) <= inner) };
      })()`);
    const { page, errors } = await open('/de/scan?host=exposed.example:1012&demo=exposed', { width: 390, height: 844 });
    await see(page.getByTestId('stage-word'), exact('UNGESCHÜTZT'), 15000);
    await see(page.getByTestId('next-step'), /Aktivieren Sie TLS 1.3/, 15000);
    await see(page.getByRole('combobox', { name: 'Sprache' }));
    expect(await ringFit(page)).toEqual({ inside: true });
    const overflow = await page.evaluate('document.documentElement.scrollWidth - document.documentElement.clientWidth');
    expect(overflow).toBeLessThanOrEqual(0);
    // A refused scan shows the longest labels of all (the unreachable stage) in the ring.
    await page.route('**/api/scan', (route) => route.fulfill({ status: 429, contentType: 'application/json', body: JSON.stringify({ error: 'busy', code: 'engine-busy' }) }));
    for (const [prefix, word] of [['/de', 'UNERREICHBAR'], ['/es', 'INACCESIBLE'], ['', 'UNREACHABLE'], ['/fr', 'INJOIGNABLE'], ['/pt', 'INACESSÍVEL']] as const) {
      await page.goto(`${vite.url}${prefix}/scan?host=example.com`);
      await see(page.getByTestId('stage-word'), exact(word));
      expect({ word, ...((await ringFit(page)) as { inside: boolean }) }).toEqual({ word, inside: true });
    }
    expect(errors).toEqual([]);
    await page.context().close();
  });
});
