// The letter: one portrait Letter page to an institution's information security officer. A
// courtesy, not a pitch: who we are, what was observed and when, the stage, the one next step,
// the link and a QR code to the live report. Pure apart from the QR encoder; the renderer prints
// it with the same Chromium as the report.

import QRCode from 'qrcode';
import { STAGE_LABEL, STAGE_MEANING, type Stage } from './assess';
import type { ScanResult } from './events';
import { FONT_FILES, type FontFile } from './report-html';

export interface Population {
  name: string;
  size: number;
  ready: number;
  median: number;
}

export interface Letter {
  result: ScanResult;
  institution: string;
  attention?: string;
  /** Postal address lines under the institution, when known. */
  addressLines?: string[];
  shareUrl: string | null;
  population?: Population | null;
}

export interface LetterOptions {
  generatedAt: Date;
  signer: { name: string; title: string; email?: string };
  fontBase?: string;
  fontUrls?: Partial<Record<FontFile, string>>;
}

const esc = (v: unknown): string =>
  String(v ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

const STAGE_COLOUR: Record<Stage, string> = {
  unreachable: '#64748B',
  inconclusive: '#94A3B8',
  exposed: '#D9463B',
  'at-risk': '#C9961E',
  protected: '#1F9D6B',
  ready: '#157A54',
};
const INK = '#0A2540';
const BASE = '#1034A6';
const GOLD = '#B8902E';

const dateLine = (d: Date) => d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });

function ring(stage: Stage, score: number, size: number, stroke: number): string {
  const r = size / 2 - stroke;
  const c = 2 * Math.PI * r;
  const offset = c * (1 - Math.max(0, Math.min(100, score)) / 100);
  return `<svg class="ring" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}" aria-hidden="true">
    <circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="#E2E8F0" stroke-width="${stroke}"/>
    <circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="${STAGE_COLOUR[stage]}" stroke-width="${stroke}" stroke-dasharray="${c.toFixed(2)}" stroke-dashoffset="${offset.toFixed(2)}" transform="rotate(-90 ${size / 2} ${size / 2})"/>
  </svg>`;
}

function hostOf(result: ScanResult): string {
  const { host, port } = result.target;
  return port === 443 ? host : `${host}:${port}`;
}

function body(letter: Letter, when: Date): string[] {
  void when;
  const a = letter.result.assessment;
  const host = hostOf(letter.result);
  const scanned = dateLine(new Date(letter.result.startedAt));
  const pop = letter.population;
  const good = a.stage === 'protected' || a.stage === 'ready';
  const p: string[] = [];
  p.push(
    `Quantum Ready Labs is a free, open-source service of the Manteiga Foundation, a Florida public benefit company. It tests one thing: whether a web host's TLS configuration is ready for the post-quantum transition that NIST, the NSA and the major browsers began in 2024.`,
  );
  p.push(
    `${pop ? `On ${scanned} we included ${host} in a review of ${pop.size} ${pop.name}.` : `On ${scanned} we tested ${host}.`} It was tested exactly as a browser visit would be: fourteen TLS handshakes and one ordinary connection, nothing more. Its result is ${STAGE_LABEL[a.stage]}, ${a.score} of 100. ${STAGE_MEANING[a.stage]}${pop ? ` The change is within reach: ${pop.ready} of the ${pop.size} are already Ready.` : ''}`,
  );
  if (!good) {
    p.push(
      `Nothing is broken today. The concern is "harvest now, decrypt later": traffic recorded now can be read once a large enough quantum computer exists, and records of an institution's customers keep their value for decades. The fix lives in the key exchange and is, in most deployments, a configuration or CDN setting rather than a project.`,
    );
  }
  p.push(`The one change that moves it: ${a.nextStep.title}. ${a.nextStep.detail}`);
  p.push(
    `The full report, with the method and the standards it follows, is at the link and code at right; the page is unlisted and downloads as a PDF. This letter asks nothing of you. If a conversation would help, my address is below.`,
  );
  return p;
}

async function page(letter: Letter, options: LetterOptions, index: number): Promise<string> {
  const a = letter.result.assessment;
  const host = hostOf(letter.result);
  const colour = STAGE_COLOUR[a.stage];
  const qr = letter.shareUrl ? await QRCode.toString(letter.shareUrl, { type: 'svg', margin: 0, errorCorrectionLevel: 'M', color: { dark: INK, light: '#ffffff00' } }) : '';
  const shortUrl = letter.shareUrl?.replace(/^https?:\/\//, '') ?? 'quantumreadylabs.com';
  return `<div class="page" data-page="${index + 1}">
    <div class="letterhead">
      <div class="brand"><span class="mark"></span>Quantum Ready Labs</div>
      <div class="brand-sub">A Manteiga Foundation project · quantumreadylabs.com</div>
    </div>
    <div class="columns">
      <div class="text">
        <div class="date">${esc(dateLine(options.generatedAt))}</div>
        <div class="addressee">
          <div class="institution">${esc(letter.institution)}</div>
          ${(letter.addressLines ?? []).map((l) => `<div>${esc(l)}</div>`).join('')}
          <div class="attention">Attention: ${esc(letter.attention ?? 'Information Security Officer')}</div>
        </div>
        <p class="salutation">Dear ${esc(letter.attention ?? 'Information Security Officer')},</p>
        ${body(letter, options.generatedAt)
          .map((p) => `<p>${esc(p)}</p>`)
          .join('')}
        <p class="closing">Respectfully,</p>
        <div class="signature">
          <div class="signature-line"></div>
          <div class="signer">${esc(options.signer.name)}</div>
          <div class="signer-title">${esc(options.signer.title)}${options.signer.email ? ` · ${esc(options.signer.email)}` : ''}</div>
        </div>
      </div>
      <aside class="card">
        <div class="card-host">${esc(host)}</div>
        <div class="card-ring">${ring(a.stage, a.score, 150, 12)}<div class="card-ring-text"><div class="word" style="color:${colour}">${esc(STAGE_LABEL[a.stage])}</div><div class="num">${a.score}</div><div class="of">of 100</div></div></div>
        <div class="card-label">The one next step</div>
        <div class="card-step">${esc(a.nextStep.title)}</div>
        ${letter.shareUrl ? `<div class="qr">${qr}</div>` : ''}
        <div class="card-url">${letter.shareUrl ? `<a href="${esc(letter.shareUrl)}">${esc(shortUrl)}</a>` : esc(shortUrl)}</div>
        <div class="card-note">Live report, unlisted. Download as PDF from the page.</div>
      </aside>
    </div>
    <div class="footer">
      <span>This letter describes the public TLS configuration of ${esc(host)} as observed from the Internet on ${esc(dateLine(new Date(letter.result.startedAt)))}. It contains no private data. Method and source: github.com/manteiga-foundation/quantum-ready-labs</span>
    </div>
  </div>`;
}

function styles(options: LetterOptions): string {
  const { fontBase = '/fonts', fontUrls = {} } = options;
  const font = (file: FontFile) => fontUrls[file] ?? `${fontBase}/${file}`;
  void FONT_FILES;
  return `
@font-face { font-family: 'Titillium Web'; font-weight: 400; src: url('${font('titillium-web-latin-400-normal.woff2')}') format('woff2'); }
@font-face { font-family: 'Titillium Web'; font-weight: 600; src: url('${font('titillium-web-latin-600-normal.woff2')}') format('woff2'); }
@font-face { font-family: 'Titillium Web'; font-weight: 700; src: url('${font('titillium-web-latin-700-normal.woff2')}') format('woff2'); }
@font-face { font-family: 'JetBrains Mono'; font-weight: 400; src: url('${font('jetbrains-mono-latin-400-normal.woff2')}') format('woff2'); }
@page { size: 8.5in 11in; margin: 0; }
* { margin: 0; padding: 0; box-sizing: border-box; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
html, body { font-family: 'Titillium Web', sans-serif; font-size: 10.5pt; line-height: 1.45; background: white; color: ${INK}; }
.page { width: 8.5in; height: 11in; position: relative; overflow: hidden; page-break-after: always; page-break-inside: avoid; background: white; padding: 0.6in 0.8in 0.5in 0.9in; display: flex; flex-direction: column; }
.page:last-child { page-break-after: auto; }
.page::before { content: ''; position: absolute; left: 0; top: 0; width: 6px; height: 100%; background: linear-gradient(180deg, ${BASE} 0%, #4A6BD8 45%, ${GOLD} 100%); }
.letterhead { display: flex; justify-content: space-between; align-items: baseline; padding-bottom: 10px; border-bottom: 1px solid #E2E8F0; }
.brand { display: flex; align-items: center; gap: 10px; font-size: 12pt; font-weight: 700; letter-spacing: 2px; text-transform: uppercase; color: ${BASE}; }
.mark { display: inline-block; width: 16px; height: 16px; border-radius: 50%; border: 2.5px solid ${GOLD}; box-shadow: inset 0 0 0 3px white, inset 0 0 0 5px ${BASE}; }
.brand-sub { font-size: 8.5pt; color: #94A3B8; }
.date { margin-top: 0; font-size: 10.5pt; color: #475569; }
.addressee { margin: 14px 0 18px; font-size: 10.5pt; line-height: 1.4; color: #475569; }
.institution { font-weight: 700; color: ${INK}; font-size: 11.5pt; }
.attention { margin-top: 2px; }
.columns { display: flex; gap: 0.35in; margin-top: 22px; flex: 1; min-height: 0; }
.text { flex: 1; min-width: 0; }
.text p { margin-bottom: 8pt; text-align: left; }
.salutation { margin-bottom: 9pt; }
.closing { margin-top: 4pt; }
.signature { margin-top: 40pt; }
.signature-line { width: 2.4in; border-top: 1px solid #94A3B8; margin-bottom: 4pt; }
.signer { font-weight: 700; }
.signer-title { font-size: 9.5pt; color: #64748B; }
.card { width: 2.05in; flex: none; align-self: flex-start; background: #F8FAFC; border: 1px solid #E2E8F0; border-top: 4px solid ${GOLD}; border-radius: 10px; padding: 14px 14px 12px; text-align: center; }
.card-host { font-family: 'JetBrains Mono', monospace; font-size: 9pt; word-break: break-all; color: ${INK}; }
.card-ring { position: relative; width: 150px; height: 150px; margin: 10px auto 8px; }
.card-ring .ring { position: absolute; inset: 0; }
.card-ring-text { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; }
.card-ring-text .word { font-size: 10pt; font-weight: 700; letter-spacing: 2px; }
.card-ring-text .num { font-family: 'JetBrains Mono', monospace; font-size: 30pt; line-height: 1; margin-top: 2px; }
.card-ring-text .of { font-size: 7pt; letter-spacing: 1.5px; text-transform: uppercase; color: #94A3B8; margin-top: 3px; }
.card-label { font-size: 7pt; letter-spacing: 1.5px; text-transform: uppercase; color: ${GOLD}; font-weight: 700; margin-top: 6px; }
.card-step { font-size: 9.5pt; font-weight: 600; line-height: 1.3; margin-top: 2px; }
.qr { width: 1.1in; height: 1.1in; margin: 12px auto 6px; }
.qr svg { width: 100%; height: 100%; display: block; }
.card-url { font-family: 'JetBrains Mono', monospace; font-size: 8pt; color: ${BASE}; word-break: break-all; }
.card-url a { color: inherit; text-decoration: none; }
.card-note { font-size: 7.5pt; color: #94A3B8; margin-top: 4px; line-height: 1.3; }
.footer { font-size: 7.5pt; color: #94A3B8; line-height: 1.4; padding-top: 8px; border-top: 1px solid #E2E8F0; }
@media screen { html { background: #64748B; } body { padding: 0.5in; background: #64748B; } .page { margin: 0 auto 0.5in; box-shadow: 0 4px 6px rgba(0,0,0,0.05), 0 10px 40px rgba(0,0,0,0.15); } }
@media print { .page { box-shadow: none !important; } }
`;
}

export async function renderLettersHtml(letters: Letter[], options: LetterOptions): Promise<string> {
  const pages: string[] = [];
  for (let i = 0; i < letters.length; i++) pages.push(await page(letters[i], options, i));
  const title = letters.length === 1 ? `${hostOf(letters[0].result)} · Letter · Quantum Ready Labs` : `${letters.length} letters · Quantum Ready Labs`;
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>${esc(title)}</title>
<style>${styles(options)}</style>
</head>
<body>
${pages.join('\n')}
</body>
</html>`;
}

export function renderLetterHtml(letter: Letter, options: LetterOptions): Promise<string> {
  return renderLettersHtml([letter], options);
}
