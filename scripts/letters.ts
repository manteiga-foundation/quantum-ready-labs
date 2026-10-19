// Letters for a study: one portrait page per institution, printed by the renderer into a single
// PDF ready for envelopes.
//
//   bun run scripts/letters.ts <slug> [--stages exposed,at-risk] [--signer "Name|Title|email"]
//                              [--renderer https://qrl-render.fly.dev] [--pages]
//
// Reads studies/<slug>/results.csv (from scripts/study.ts) and the stored results from the public
// result API, writes studies/<slug>/letters.pdf, and with --pages a PNG per page for review.
// Tokens: ~/.config/quantum-ready-labs/render-token.

import { homedir } from 'node:os';
import { join } from 'node:path';
import { mkdirSync } from 'node:fs';
import type { Letter } from '../engine/letter-html';
import type { ScanResult } from '../engine/events';

const args = process.argv.slice(2);
const slug = args[0];
const flag = (name: string, fallback: string) => (args.includes(name) ? args[args.indexOf(name) + 1] : fallback);
const stages = flag('--stages', 'exposed,at-risk').split(',');
const [signerName, signerTitle, signerEmail] = flag('--signer', 'Jaime Manteiga|Manteiga Foundation|jaime@manteiga.org').split('|');
const renderer = flag('--renderer', 'https://qrl-render.fly.dev');
const origin = flag('--origin', 'https://quantumreadylabs.com');
const wantPages = args.includes('--pages');
if (!slug) {
  console.error('usage: bun run scripts/letters.ts <slug> [--stages exposed,at-risk] [--signer "Name|Title|email"]');
  process.exit(2);
}

const dir = join('studies', slug);
const csv = await Bun.file(join(dir, 'results.csv')).text();
const lines = csv.split('\n').filter((l) => l.trim());
const header = lines[0].split(',');
const col = (name: string) => header.indexOf(name);
function cells(line: string): string[] {
  const out: string[] = [];
  let cur = '';
  let q = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (q) {
      if (ch === '"' && line[i + 1] === '"') (cur += '"'), i++;
      else if (ch === '"') q = false;
      else cur += ch;
    } else if (ch === '"') q = true;
    else if (ch === ',') out.push(cur), (cur = '');
    else cur += ch;
  }
  out.push(cur);
  return out;
}
const rows = lines.slice(1).map(cells).map((c) => ({ name: c[col('name')], domain: c[col('domain')], stage: c[col('stage')], score: Number(c[col('score')]), share: c[col('share')] }));
const chosen = rows.filter((r) => stages.includes(r.stage) && r.share);
console.log(`${chosen.length} of ${rows.length} institutions in stages ${stages.join(', ')}`);

const all = rows.filter((r) => r.stage && r.stage !== 'unreachable' && r.stage !== 'inconclusive');
const scores = all.map((r) => r.score).sort((a, b) => a - b);
const population = { name: flag('--population', 'Florida-headquartered banks and credit unions'), size: all.length, ready: rows.filter((r) => r.stage === 'ready').length, median: scores[Math.floor(scores.length / 2)] };

const letters: Letter[] = [];
for (const r of chosen) {
  const id = r.share.split('/').pop();
  const res = await fetch(`${origin}/api/result/${id}`);
  if (!res.ok) {
    console.log(`  skip ${r.domain}: result ${res.status}`);
    continue;
  }
  const result = (await res.json()) as ScanResult;
  letters.push({ result, institution: r.name, shareUrl: r.share, population });
  console.log(`  ${r.domain.padEnd(30)} ${r.stage.padEnd(9)} ${r.name}`);
}

const token = (await Bun.file(join(homedir(), '.config/quantum-ready-labs/render-token')).text()).trim();
const body = JSON.stringify({ letters, signer: { name: signerName, title: signerTitle, email: signerEmail }, generatedAt: new Date().toISOString() });
const pdf = await fetch(`${renderer}/letters.pdf`, { method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body });
if (!pdf.ok) throw new Error(`renderer answered ${pdf.status}: ${await pdf.text()}`);
await Bun.write(join(dir, 'letters.pdf'), await pdf.arrayBuffer());
console.log(`${letters.length} letters -> ${dir}/letters.pdf`);

if (wantPages) {
  const { chromium } = await import('playwright');
  const html = await (await fetch(`${renderer}/letters.html`, { method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body })).text();
  const outDir = join(dir, 'letters');
  mkdirSync(outDir, { recursive: true });
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 900, height: 1100 }, deviceScaleFactor: 2 });
  await page.setContent(html, { waitUntil: 'load' });
  await page.evaluate('document.fonts.ready');
  await page.addStyleTag({ content: 'html,body{background:white!important;padding:0!important} .page{margin:0!important;box-shadow:none!important}' });
  const measures = (await page.evaluate(`[...document.querySelectorAll('.page')].map((el) => { const top = el.getBoundingClientRect().top; const f = el.querySelector('.footer'); const sig = el.querySelector('.signature'); return { sigBottom: Math.round(sig.getBoundingClientRect().bottom - top), footerTop: Math.round(f.getBoundingClientRect().top - top), height: el.clientHeight }; })`)) as { sigBottom: number; footerTop: number; height: number }[];
  const pages = page.locator('.page');
  for (let i = 0; i < letters.length; i++) {
    const file = join(outDir, `${letters[i].result.target.host}.png`);
    await pages.nth(i).screenshot({ path: file });
    const m = measures[i];
    console.log(`  ${file}  signature bottom ${m.sigBottom}px, footer top ${m.footerTop}px${m.sigBottom > m.footerTop ? '  <-- text runs into the footer' : ''}`);
  }
  await browser.close();
}
