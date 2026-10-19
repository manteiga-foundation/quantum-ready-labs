// How `bun run scan` looks in the terminal, in the spirit of Artemis's launcher: a QREADY banner
// in gold faces with Egyptian-blue shadows, then one report per host that reads top-down the way
// the web page does: the host, the stage word and the score; the verdict; the one next step; the
// three cards; the probes as a grid; the chain and the score's parts with --verbose.
//
// Truecolor where the terminal says it has it (COLORTERM), the nearest of the 256 colours
// otherwise, plain text when the output is not a terminal or NO_COLOR is set. No dependencies.

import { GROUP, GROUP_NAMES, type GroupName } from './hello';
import { STAGE_LABEL, type Assessment, type Stage } from './assess';
import type { ScanResult } from './events';

export type ColorMode = 'none' | '256' | 'truecolor';

const C = {
  goldLight: '#f3dfa2',
  gold: '#e0b85c',
  amber: '#c88000',
  blue: '#5b7be0',
  paleBlue: '#9fb6ff',
  text: '#dfe7f5',
  dim: '#7a879c',
  red: '#e05a4f',
  green: '#43b48a',
  mint: '#8fe0c0',
} as const;

const STAGE_COLOUR: Record<Stage, string> = {
  unreachable: C.dim,
  inconclusive: C.dim,
  exposed: C.red,
  'at-risk': C.gold,
  protected: C.green,
  ready: C.mint,
};

export function colorMode(env: Record<string, string | undefined>, isTTY: boolean): ColorMode {
  if (env.NO_COLOR) return 'none';
  if (env.FORCE_COLOR === '0') return 'none';
  const truecolor = env.COLORTERM === 'truecolor' || env.COLORTERM === '24bit' || env.FORCE_COLOR === '3';
  if (!isTTY && env.FORCE_COLOR === undefined) return 'none';
  return truecolor ? 'truecolor' : '256';
}

const LEVELS6 = [0, 95, 135, 175, 215, 255];
const nearest6 = (v: number) => LEVELS6.reduce((best, l, i) => (Math.abs(l - v) < Math.abs(LEVELS6[best] - v) ? i : best), 0);
const rgb = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)) as [number, number, number];

function paint(text: string, hex: string, mode: ColorMode, extra = ''): string {
  if (mode === 'none' || !text) return text;
  const [r, g, b] = rgb(hex);
  const fg = mode === 'truecolor' ? `38;2;${r};${g};${b}` : `38;5;${16 + 36 * nearest6(r) + 6 * nearest6(g) + nearest6(b)}`;
  return `\x1b[${extra}${fg}m${text}\x1b[0m`;
}

/** The text without its colours. */
export const plain = (s: string) => s.replace(/\x1b\[[0-9;]*m/g, '');
const width = (s: string) => plain(s).length;
const padEnd = (s: string, n: number) => s + ' '.repeat(Math.max(0, n - width(s)));

// The block letters (ANSI Shadow): Q R E A D Y. Faces are █, shadows the box-drawing strokes.
const LETTERS: Record<string, string[]> = {
  Q: [' ██████╗ ', '██╔═══██╗', '██║   ██║', '██║▄▄ ██║', '╚██████╔╝', ' ╚══▀▀═╝ '],
  R: ['██████╗ ', '██╔══██╗', '██████╔╝', '██╔══██╗', '██║  ██║', '╚═╝  ╚═╝'],
  E: ['███████╗', '██╔════╝', '█████╗  ', '██╔══╝  ', '███████╗', '╚══════╝'],
  A: [' █████╗ ', '██╔══██╗', '███████║', '██╔══██║', '██║  ██║', '╚═╝  ╚═╝'],
  D: ['██████╗ ', '██╔══██╗', '██║  ██║', '██║  ██║', '██████╔╝', '╚═════╝ '],
  Y: ['██╗   ██╗', '╚██╗ ██╔╝', ' ╚████╔╝ ', '  ╚██╔╝  ', '   ██║   ', '   ╚═╝   '],
};
const BANNER = [0, 1, 2, 3, 4, 5].map((row) => [...'QREADY'].map((ch) => LETTERS[ch][row]).join(''));
const BANNER_WIDTH = Math.max(...BANNER.map((r) => r.length));
const FACE = ['#f3dfa2', '#ecd088', '#e6c271', '#e0b85c', '#d6a243', '#c88000'];
const bannerRow = (row: string, i: number, mode: ColorMode) => row.replace(/(█+)|([^█ ]+)/g, (_m, face: string, shadow: string) => (face ? paint(face, FACE[i], mode, '1;') : paint(shadow, C.blue, mode)));

export interface TerminalOptions {
  mode: ColorMode;
  columns: number;
  verbose?: boolean;
  share?: { url: string; pdf: string } | null;
}

export function banner(version: string, o: TerminalOptions): string {
  const { mode } = o;
  const wide = o.columns >= BANNER_WIDTH + 4;
  const title = wide ? BANNER.map((r, i) => '  ' + bannerRow(r, i, mode)) : ['  ' + paint('Q R E A D Y', C.gold, mode, '1;')];
  return ['', ...title, `  ${paint('POST-QUANTUM READINESS', C.paleBlue, mode)}  ${paint('·', C.dim, mode)}  ${paint(`v${version}`, C.dim, mode)}  ${paint('·', C.dim, mode)}  ${paint('quantumreadylabs.com', C.dim, mode)}`, ''].join('\n');
}

const hostOf = (r: ScanResult) => (r.target.port === 443 ? r.target.host : `${r.target.host}:${r.target.port}`);

/** Breaks a sentence into lines that fit, each with the indent. */
function wrap(text: string, indent: number, columns: number): string[] {
  const max = Math.max(20, columns - indent);
  const out: string[] = [];
  let line = '';
  for (const word of text.split(/\s+/)) {
    if (line && line.length + 1 + word.length > max) {
      out.push(' '.repeat(indent) + line);
      line = word;
    } else line = line ? `${line} ${word}` : word;
  }
  if (line) out.push(' '.repeat(indent) + line);
  return out;
}

const yes = (mode: ColorMode) => paint('✓', C.green, mode);
const no = (mode: ColorMode) => paint('✗', C.dim, mode);
const warnMark = (mode: ColorMode) => paint('!', C.amber, mode, '1;');

function mark(v: boolean | null, mode: ColorMode): string {
  return v === null ? paint('·', C.dim, mode) : v ? yes(mode) : no(mode);
}

/** Cells laid in columns that fit the width; each cell is already coloured, widths measured plain. */
function grid(cells: string[], indent: number, columns: number, gap = 3): string[] {
  const widest = Math.max(...cells.map(width));
  const per = Math.max(1, Math.floor((columns - indent + gap) / (widest + gap)));
  const rows: string[] = [];
  for (let i = 0; i < cells.length; i += per) rows.push(' '.repeat(indent) + cells.slice(i, i + per).map((c, j, arr) => (j === arr.length - 1 ? c : padEnd(c, widest + gap))).join('').trimEnd());
  return rows;
}

function label(text: string, mode: ColorMode): string {
  return paint(text.padEnd(14), C.paleBlue, mode);
}

const GROUP_SHORT: Record<GroupName, string> = {
  X25519MLKEM768: 'X25519MLKEM768',
  SecP256r1MLKEM768: 'P256MLKEM768',
  SecP384r1MLKEM1024: 'P384MLKEM1024',
  X25519Kyber768Draft00: 'Kyber768Draft',
  x25519: 'x25519',
  secp256r1: 'secp256r1',
  secp384r1: 'secp384r1',
  secp521r1: 'secp521r1',
  ffdhe2048: 'ffdhe2048',
  ffdhe3072: 'ffdhe3072',
};

export function renderReport(r: ScanResult, o: TerminalOptions): string {
  const { mode, columns } = o;
  const a = r.assessment;
  const f = r.findings;
  const colour = STAGE_COLOUR[a.stage];
  const out: string[] = [];
  const rule = '  ' + paint('─'.repeat(Math.min(columns - 4, 72)), C.blue, mode);

  // The head: host, stage word, score.
  out.push(rule);
  out.push(`  ${paint('◆', colour, mode)} ${paint(hostOf(r), C.goldLight, mode, '1;')}  ${paint(STAGE_LABEL[a.stage], colour, mode, '1;')}  ${paint(`${a.score} / 100`, C.text, mode)}  ${paint(`${r.address} · ${r.ms} ms`, C.dim, mode)}`);
  out.push(...wrap(a.verdict, 4, columns).map((l) => paint(l, C.text, mode)));
  out.push('');
  out.push(`    ${paint('Next step', C.gold, mode, '1;')}  ${paint(a.nextStep.title, C.goldLight, mode)}`);
  if (o.verbose) out.push(...wrap(a.nextStep.detail, 15, columns).map((l) => paint(l, C.dim, mode)));
  out.push('');

  // Key exchange.
  const k = a.keyExchange;
  const kState = k.status === 'hybrid' ? paint('hybrid post-quantum accepted', C.green, mode) : k.status === 'classical' ? paint('classical only', C.gold, mode) : k.status === 'legacy' ? paint('legacy only', C.red, mode) : paint('no answer', C.dim, mode);
  out.push(`  ${label('Key exchange', mode)}${kState}`);
  out.push(`    ${paint('hybrid groups', C.dim, mode).padEnd(0)}${' '.repeat(Math.max(1, 18 - 'hybrid groups'.length))}${k.hybridGroups.length ? k.hybridGroups.join(', ') : paint('none', C.dim, mode)}`);
  out.push(`    ${paint('classical groups', C.dim, mode)}${' '.repeat(2)}${k.classicalGroups.length ? k.classicalGroups.join(', ') : paint('none', C.dim, mode)}`);
  out.push(`    ${paint('browsers get', C.dim, mode)}${' '.repeat(6)}${k.preferred ? paint(k.preferred, /MLKEM/.test(k.preferred) ? C.green : C.text, mode) : paint('not measured', C.dim, mode)}`);
  const rsa = k.rsaKeyTransport === null ? paint('not measured', C.dim, mode) : k.rsaKeyTransport ? `${warnMark(mode)} ${paint('still accepted', C.amber, mode)}` : `${yes(mode)} ${paint('refused', C.text, mode)}`;
  out.push(`    ${paint('RSA key transport', C.dim, mode)} ${rsa}`);
  out.push('');

  // Certificate.
  const c = a.certificate;
  const cState = c.status === 'unknown' ? paint('not read', C.dim, mode) : c.quantumSafe ? paint('post-quantum signed', C.mint, mode) : paint('classical, like all of the public web', C.text, mode);
  out.push(`  ${label('Certificate', mode)}${cState}`);
  const leaf = f.chain[0];
  if (leaf) {
    const days = c.leafDaysRemaining !== null ? `${c.leafDaysRemaining} days left` : '';
    const facts = [leaf.keyDetail, leaf.signatureAlgorithm, c.leafDaysValid !== null ? `${c.leafDaysValid}-day certificate` : '', days].filter(Boolean);
    const head = `    leaf  ${leaf.subject}  `;
    if (head.length + facts.join(' · ').length <= columns) out.push(`    ${paint('leaf', C.dim, mode)}  ${paint(leaf.subject, C.text, mode)}  ${paint(facts.join(' · '), C.dim, mode)}`);
    else {
      out.push(`    ${paint('leaf', C.dim, mode)}  ${paint(leaf.subject, C.text, mode)}`);
      out.push(...wrap(facts.join(' · '), 10, columns).map((l) => paint(l, C.dim, mode)));
    }
    out.push(`    ${paint('chain', C.dim, mode)} ${paint(`${c.chainLength} link${c.chainLength === 1 ? '' : 's'}`, C.text, mode)}  ${c.trusted === null ? paint('trust not checked', C.dim, mode) : c.trusted ? `${yes(mode)} ${paint('trusted', C.text, mode)}` : `${warnMark(mode)} ${paint(f.trustError ?? 'not trusted', C.amber, mode)}`}`);
  }
  out.push('');

  // Foundations.
  const fo = a.foundations;
  const items: [string, boolean | null][] = [
    ['TLS 1.3', fo.tls13],
    ['RSA key transport refused', fo.noRsaKeyTransport],
    ['short-lived certificate', fo.shortLivedCertificate],
    ['prefers hybrid', fo.prefersHybrid],
    ['trusted chain', fo.trustedChain],
  ];
  const inPlace = items.filter(([, v]) => v === true).length;
  out.push(`  ${label('Foundations', mode)}${paint(`${inPlace} of 5 in place`, inPlace >= 4 ? C.green : inPlace >= 2 ? C.gold : C.red, mode)}`);
  out.push(...grid(items.map(([t, v]) => `${mark(v, mode)} ${paint(t, v === true ? C.text : C.dim, mode)}`), 4, columns));
  out.push('');

  // Probes.
  const conn = f.connection ? `${f.connection.protocol} · ${f.connection.cipher}${f.connection.alpn ? ` · ${f.connection.alpn}` : ''}` : 'no ordinary connection completed';
  out.push(`  ${label('Probes', mode)}${paint('14 handshakes and one connection', C.dim, mode)}`);
  out.push(`    ${paint('connection', C.dim, mode)}  ${paint(conn, C.text, mode)}`);
  const probeCell = (name: string, v: boolean | null | 'yes' | 'no' | 'error' | 'untested', good = true) => {
    const state = v === true || v === 'yes' ? 'yes' : v === false || v === 'no' ? 'no' : v === 'error' ? 'error' : 'none';
    const m = state === 'yes' ? (good ? yes(mode) : warnMark(mode)) : state === 'no' ? no(mode) : state === 'error' ? paint('?', C.red, mode) : paint('·', C.dim, mode);
    return `${m} ${paint(name, state === 'yes' ? (good ? C.text : C.amber) : C.dim, mode)}`;
  };
  out.push(...grid(GROUP_NAMES.map((g) => probeCell(GROUP_SHORT[g], f.groups[g])), 4, columns));
  const preferred = f.preferredModernGroup === null ? null : GROUP_NAMES.find((g) => GROUP[g] === f.preferredModernGroup) ?? `0x${f.preferredModernGroup.toString(16)}`;
  out.push(...grid([probeCell('TLS 1.3', f.tls13), probeCell('TLS 1.2 ephemeral', f.tls12), `${f.rsaKeyTransport === null ? paint('·', C.dim, mode) : f.rsaKeyTransport ? warnMark(mode) : yes(mode)} ${paint(`RSA key transport ${f.rsaKeyTransport === null ? 'not measured' : f.rsaKeyTransport ? 'still accepted' : 'refused'}`, f.rsaKeyTransport ? C.amber : C.text, mode)}`, `${paint('→', C.dim, mode)} ${paint(`browsers get ${preferred ?? 'nothing'}`, preferred && /MLKEM/.test(preferred) ? C.green : C.text, mode)}`], 4, columns));
  if (f.errors.length) out.push(`    ${paint(`${f.errors.length} probe${f.errors.length === 1 ? '' : 's'} without an answer`, C.amber, mode)}`);

  if (o.verbose) {
    out.push('');
    out.push(`  ${label('Chain', mode).trimEnd()}`);
    for (const [i, link] of f.chain.entries()) {
      const kind = i === 0 ? 'leaf' : link.selfSigned ? 'root' : 'CA  ';
      out.push(`    ${paint(kind, C.dim, mode)}  ${paint(link.subject, C.text, mode)}`);
      out.push(...wrap(link.selfSigned ? 'self-signed' : `issued by ${link.issuer}`, 10, columns).map((l) => paint(l, C.dim, mode)));
      out.push(`          ${paint(`${link.keyDetail} · ${link.signatureAlgorithm} · until ${link.notAfter.slice(0, 10)}`, C.dim, mode)}`);
    }
    out.push('');
    out.push(`  ${label('Score breakdown', mode).trimEnd()}`);
    const parts: [string, number, number][] = [
      ['Key exchange', a.points.keyExchange, 60],
      ['No RSA key transport', a.points.noRsaKeyTransport, 10],
      ['Short-lived certificate', a.points.shortLivedCertificate, 8],
      ['Server prefers hybrid', a.points.prefersHybrid, 6],
      ['Trusted chain', a.points.trustedChain, 6],
      ['Certificate algorithms', a.points.certificate, 10],
    ];
    for (const [name, got, max] of parts) out.push(`    ${paint(name.padEnd(24), C.dim, mode)}${paint(`${String(got).padStart(2)} / ${max}`, got === max ? C.green : got === 0 ? C.dim : C.text, mode)}`);
    for (const n of a.notes) out.push(...wrap(`note: ${n.text}`, 4, columns).map((l) => paint(l, C.dim, mode)));
  }

  if (o.share) {
    out.push('');
    out.push(`  ${label('Share', mode)}${paint(o.share.url, C.goldLight, mode, '4;')}`);
    out.push(`  ${label('PDF', mode)}${paint(o.share.pdf, C.dim, mode)}`);
  }
  out.push(rule);
  return out.join('\n');
}

const STAGE_ORDER: Stage[] = ['unreachable', 'inconclusive', 'exposed', 'at-risk', 'protected', 'ready'];

/** Several hosts: one line each, worst first, and the count by stage. */
export function summary(results: ScanResult[], o: TerminalOptions): string {
  const { mode } = o;
  const sorted = [...results].sort((x, y) => STAGE_ORDER.indexOf(x.assessment.stage) - STAGE_ORDER.indexOf(y.assessment.stage) || x.assessment.score - y.assessment.score);
  const w = Math.max(...sorted.map((r) => hostOf(r).length));
  const out = ['', `  ${paint(`${results.length} hosts`, C.paleBlue, mode, '1;')}`];
  for (const r of sorted) {
    const a: Assessment = r.assessment;
    out.push(`  ${paint('◆', STAGE_COLOUR[a.stage], mode)} ${padEnd(paint(hostOf(r), C.text, mode), w + 2)}${padEnd(paint(STAGE_LABEL[a.stage], STAGE_COLOUR[a.stage], mode, '1;'), 11)}${paint(String(a.score).padStart(3), C.text, mode)}  ${paint(a.nextStep.title, C.dim, mode)}`);
  }
  const counts = STAGE_ORDER.map((s) => [s, results.filter((r) => r.assessment.stage === s).length] as const).filter(([, n]) => n > 0);
  out.push(`  ${counts.map(([s, n]) => paint(`${n} ${s}`, STAGE_COLOUR[s], mode)).join(paint(' · ', C.dim, mode))}`);
  out.push('');
  return out.join('\n');
}
