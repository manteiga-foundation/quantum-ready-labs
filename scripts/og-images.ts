// Link-preview images, one per stage plus the default and one per study: 1200x630, rendered
// from a template in Chromium. `bun run scripts/og-images.ts` writes web/public/og/*.png.
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { parseStudyCsv, STUDY_META, summarize } from '../web/src/study-model';

interface Card {
  word: string;
  colour: string;
  line: string;
  score: string;
  /** Overrides for study cards: the ring's fill, the small caption under the number, the title. */
  pct?: number;
  of?: string;
  h1?: string;
}

const STAGES: Record<string, Card> = {
  default: { word: 'ARE YOU QUANTUM READY?', colour: '#e0b85c', line: 'Test any public host for post-quantum readiness.', score: '' },
  exposed: { word: 'EXPOSED', colour: '#e05a4f', line: 'TLS 1.3 is not available. Sessions can be recorded today and decrypted later.', score: '27' },
  'at-risk': { word: 'AT RISK', colour: '#e0b85c', line: 'Safe today; recordable now and decryptable when a large quantum computer exists.', score: '49' },
  protected: { word: 'PROTECTED', colour: '#43b48a', line: 'Hybrid post-quantum key exchange accepted. Confidentiality protected.', score: '85' },
  ready: { word: 'READY', colour: '#8fe0c0', line: 'Protected, and the foundations for the next step are in place.', score: '95' },
  unreachable: { word: 'UNREACHABLE', colour: '#6b7698', line: 'No TLS server answered at this address.', score: '0' },
  inconclusive: { word: 'INCONCLUSIVE', colour: '#9aa8d8', line: 'The server answered in a way the probes could not read with confidence.', score: '' },
};

// One card per study, its figures computed from results.csv, never typed.
for (const meta of Object.values(STUDY_META)) {
  const s = summarize(parseStudyCsv(await Bun.file(`studies/${meta.slug}/results.csv`).text()));
  STAGES[`study-${meta.slug}`] = {
    word: 'PROTECTED OR READY',
    colour: '#43b48a',
    line: meta.lead,
    score: String(s.protectedCount),
    pct: s.protectedShare,
    of: `OF ${s.total}`,
    h1: meta.title.split(':')[0],
  };
}

function html(stage: string): string {
  const s = STAGES[stage];
  const isDefault = stage === 'default';
  const pct = s.pct ?? (s.score ? Number(s.score) : 100);
  const C = 2 * Math.PI * 150;
  return `<!doctype html><html><head><meta charset="utf-8"><style>
  body{margin:0;width:1200px;height:630px;background:#060c22;color:#eef2ff;font-family:'Titillium Web','Helvetica Neue',Arial,sans-serif;position:relative;overflow:hidden}
  .grid{position:absolute;inset:0;background-image:linear-gradient(rgba(120,140,220,.10) 1px,transparent 1px),linear-gradient(90deg,rgba(120,140,220,.10) 1px,transparent 1px);background-size:48px 48px}
  .glow{position:absolute;inset:0;background:radial-gradient(ellipse at 20% 50%,rgba(16,52,166,.55),transparent 55%)}
  .ring{position:absolute;left:90px;top:115px;width:400px;height:400px}
  .ring svg{transform:rotate(-90deg)}
  .centre{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:4px}
  .word{font-weight:700;letter-spacing:.14em;font-size:${s.word.length > 10 ? 26 : s.word.length > 7 ? 30 : 40}px;color:${s.colour};text-align:center;padding:0 40px}
  .num{font-family:JetBrains Mono,Menlo,monospace;font-size:84px;line-height:1}
  .of{font-size:16px;letter-spacing:.2em;color:#9aa8d8}
  .text{position:absolute;left:560px;top:150px;width:560px}
  .brand{font-size:22px;letter-spacing:.14em;text-transform:uppercase;color:#c7d0f0;display:flex;align-items:center;gap:14px}
  .mark{width:26px;height:26px;border:3px solid #e0b85c;border-radius:50%;box-shadow:inset 0 0 0 5px #060c22,inset 0 0 0 7px #6f86d6}
  h1{font-size:${isDefault ? 64 : 54}px;line-height:1.1;margin:28px 0 20px;font-weight:700}
  p{font-size:26px;line-height:1.35;color:#c7d0f0;margin:0}
  .url{position:absolute;left:560px;bottom:60px;font-size:22px;color:#e0b85c;letter-spacing:.04em}
  </style></head><body><div class="grid"></div><div class="glow"></div>
  <div class="ring"><svg viewBox="0 0 400 400" width="400" height="400">
    <circle cx="200" cy="200" r="190" fill="none" stroke="rgba(150,170,230,.35)" stroke-width="2" stroke-dasharray="3 9"/>
    <circle cx="200" cy="200" r="150" fill="none" stroke="rgba(150,170,230,.18)" stroke-width="10"/>
    <circle cx="200" cy="200" r="150" fill="none" stroke="${s.colour}" stroke-width="16" stroke-dasharray="${C}" stroke-dashoffset="${C * (1 - pct / 100)}"/>
  </svg><div class="centre">${isDefault ? `<div class="word" style="font-size:34px">QUANTUM<br>READY<br>LABS</div>` : `<div class="word">${s.word}</div>${s.score ? `<div class="num">${s.score}</div><div class="of">${s.of ?? 'OF 100'}</div>` : ''}`}</div></div>
  <div class="text"><div class="brand"><span class="mark"></span>Quantum Ready Labs</div>
  <h1${s.h1 ? ' style="font-size:46px"' : ''}>${s.h1 ?? (isDefault ? 'Are you quantum ready?' : `This host is <span style="color:${s.colour}">${s.word.toLowerCase()}</span>`)}</h1>
  <p${s.h1 ? ' style="font-size:24px"' : ''}>${s.line}</p></div>
  <div class="url">quantumreadylabs.com</div>
  </body></html>`;
}

mkdirSync('web/public/og', { recursive: true });
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 });
for (const stage of Object.keys(STAGES)) {
  await page.setContent(html(stage));
  await page.waitForTimeout(150);
  await page.screenshot({ path: `web/public/og/${stage}.png` });
  console.log(`web/public/og/${stage}.png`);
}
await browser.close();
