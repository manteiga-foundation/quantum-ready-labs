// The PDF report: landscape Letter pages in the spirit of the medet.ink archetypes (one .slide
// per page, left accent bar, faint grid, section title light + black, divider, cards, footer with
// the confidentiality block and the page indicator), in Quantum Ready Labs' own identity. Pure:
// a ScanResult in, an HTML document out. The renderer prints it with Chromium.

import { STAGE_LABEL, STAGE_MEANING, type Assessment, type ChainLink, type Findings, type Stage } from './assess';
import type { ScanResult } from './events';
import { GROUP, GROUP_NAMES, type GroupName } from './hello';

export const REPORT_PAGES = 5;

export const FONT_FILES = ['titillium-web-latin-400-normal.woff2', 'titillium-web-latin-600-normal.woff2', 'titillium-web-latin-700-normal.woff2', 'jetbrains-mono-latin-400-normal.woff2'] as const;
export type FontFile = (typeof FONT_FILES)[number];

export interface ReportOptions {
  generatedAt: Date;
  shareUrl: string | null;
  /** Where the bundled fonts come from: a URL prefix (`/fonts` by default) or, for a self-contained document, a map of file name to data URL. */
  fontBase?: string;
  fontUrls?: Partial<Record<FontFile, string>>;
  /** Optional client or organization name for the cover. Escaped like everything else. */
  preparedFor?: string | null;
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

const GROUP_KIND: Record<GroupName, string> = {
  X25519MLKEM768: 'Hybrid post-quantum (standard)',
  SecP256r1MLKEM768: 'Hybrid post-quantum (standard)',
  SecP384r1MLKEM1024: 'Hybrid post-quantum (standard)',
  X25519Kyber768Draft00: 'Hybrid post-quantum (pre-standard draft)',
  x25519: 'Classical elliptic curve',
  secp256r1: 'Classical elliptic curve',
  secp384r1: 'Classical elliptic curve',
  secp521r1: 'Classical elliptic curve',
  ffdhe2048: 'Classical finite field',
  ffdhe3072: 'Classical finite field',
};

function dateLine(d: Date): string {
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
}

function hostOf(result: ScanResult): string {
  const { host, port } = result.target;
  return port === 443 ? host : `${host}:${port}`;
}

function yesNo(v: boolean | null, yes: string, no: string, unknown = 'Not measured'): string {
  return v === null ? unknown : v ? yes : no;
}

function ring(stage: Stage, score: number, size: number, stroke: number): string {
  const r = size / 2 - stroke;
  const c = 2 * Math.PI * r;
  const offset = c * (1 - Math.max(0, Math.min(100, score)) / 100);
  return `<svg class="ring" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}" aria-hidden="true">
    <circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="#E2E8F0" stroke-width="${stroke}"/>
    <circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="${STAGE_COLOUR[stage]}" stroke-width="${stroke}" stroke-dasharray="${c.toFixed(2)}" stroke-dashoffset="${offset.toFixed(2)}" transform="rotate(-90 ${size / 2} ${size / 2})"/>
  </svg>`;
}

function footer(page: number, result: ScanResult, when: Date): string {
  return `<div class="footer">
    <div class="footer-info">
      <div class="confidential-block"><strong>Public result.</strong> This report describes the TLS configuration of ${esc(hostOf(result))} as observed from the public Internet on ${esc(dateLine(when))}. It contains no private data and may be shared.</div>
      <div class="footer-bottom-row"><span class="footer-mark"></span><span class="footer-line"><strong>Quantum Ready Labs</strong> · Post-quantum readiness report · quantumreadylabs.com</span><span class="tag">Post-quantum readiness</span></div>
    </div>
    <div class="footer-right"><span class="page-indicator">${page} <span class="page-total">/ ${REPORT_PAGES}</span></span></div>
  </div>`;
}

function slide(page: number, result: ScanResult, when: Date, body: string, extraClass = ''): string {
  return `<div class="slide ${extraClass}" data-page="${page}">
    <div class="content">${body}</div>
    ${footer(page, result, when)}
  </div>`;
}

function title(light: string, strong: string): string {
  return `<h2 class="section-title">${esc(light)} <strong>${esc(strong)}</strong></h2><div class="divider"></div>`;
}

const STAGES: Stage[] = ['exposed', 'at-risk', 'protected', 'ready'];

function ladder(stage: Stage): string {
  const index = STAGES.indexOf(stage);
  return `<div class="ladder">${STAGES.map(
    (s, i) => `<div class="rung ${i === index ? 'current' : i < index ? 'passed' : ''}" style="--rung:${STAGE_COLOUR[s]}">
      <div class="rung-word">${esc(STAGE_LABEL[s])}</div>
      <div class="rung-desc">${esc(STAGE_MEANING[s])}</div>
      ${i === index ? '<div class="rung-marker">This host</div>' : ''}
    </div>`,
  ).join('')}</div>`;
}

function card(heading: string, state: string, stateColour: string, text: string, items: string[]): string {
  return `<div class="card">
    <h3>${esc(heading)}</h3>
    <div class="state" style="color:${stateColour}">${esc(state)}</div>
    <p>${esc(text)}</p>
    <ul>${items.map((i) => `<li>${esc(i)}</li>`).join('')}</ul>
  </div>`;
}

function probeRows(f: Findings): string {
  const rows: { label: string; kind: string; answer: string; cls: string }[] = [];
  const ans = (v: boolean | null | 'yes' | 'no' | 'error' | 'untested', yes = 'Supported', no = 'Not supported') => {
    if (v === true || v === 'yes') return { answer: yes, cls: 'yes' };
    if (v === false || v === 'no') return { answer: no, cls: 'no' };
    if (v === 'error') return { answer: 'No answer', cls: 'err' };
    return { answer: 'Not measured', cls: 'dim' };
  };
  for (const g of GROUP_NAMES) rows.push({ label: g, kind: GROUP_KIND[g], ...ans(f.groups[g]) });
  rows.push({ label: 'TLS 1.3', kind: 'Protocol', ...ans(f.tls13, 'Available', 'Not available') });
  rows.push({ label: 'TLS 1.2 with ephemeral keys', kind: 'Protocol, forward secrecy', ...ans(f.tls12, 'Negotiated', 'Refused') });
  // Accepting RSA key transport is the bad answer: amber when still accepted, green when refused.
  const rsa = ans(f.rsaKeyTransport, 'Still accepted', 'Refused');
  rows.push({ label: 'TLS 1.2 RSA key transport', kind: 'Legacy, no forward secrecy', answer: rsa.answer, cls: rsa.cls === 'yes' ? 'warn' : rsa.cls === 'no' ? 'yes' : rsa.cls });
  const preferred = f.preferredModernGroup === null ? null : GROUP_NAMES.find((g) => f.groups[g] !== undefined && GROUP[g] === f.preferredModernGroup) ?? null;
  rows.push({ label: "Server's pick for a current browser", kind: 'Offered what Chrome offers', answer: preferred ?? (f.preferredModernGroup === null ? 'Not measured' : `0x${f.preferredModernGroup.toString(16)}`), cls: preferred && /MLKEM/.test(preferred) ? 'yes' : 'dim' });
  return rows
    .map((r) => `<tr data-probe="${esc(r.label)}"><td>${esc(r.label)}<div class="kind">${esc(r.kind)}</div></td><td class="answer ${r.cls}">${esc(r.answer)}</td></tr>`)
    .join('');
}

function chainRows(chain: ChainLink[]): string {
  if (!chain.length) return '<tr><td colspan="6" class="dim">No certificate chain was read.</td></tr>';
  return chain
    .map(
      (l, i) => `<tr data-chain-link="${i}"><td class="dim">${i === 0 ? 'Leaf' : l.selfSigned ? 'Root' : 'Intermediate'}</td><td class="mono">${esc(l.subject)}</td><td class="mono dim">${esc(l.issuer)}</td><td>${esc(l.keyDetail)}</td><td>${esc(l.signatureAlgorithm)}</td><td class="dim">${esc(l.notAfter.slice(0, 10))}</td></tr>`,
    )
    .join('');
}

function execParagraphs(result: ScanResult, a: Assessment): string[] {
  const host = hostOf(result);
  const good = a.stage === 'protected' || a.stage === 'ready';
  const p1 = `On ${dateLine(new Date(result.startedAt))}, Quantum Ready Labs tested ${host} (${result.address}) from the public Internet: fourteen TLS probes and one ordinary connection, the same traffic a browser visit causes. The question was a narrow one: where does this host stand on the post-quantum transition, and what is the next step.`;
  const p2 =
    a.stage === 'unreachable' || a.stage === 'inconclusive'
      ? a.verdict
      : good
        ? `${a.verdict} The key exchange, which is the urgent half of the transition, accepts the hybrid post-quantum group that current browsers already send; traffic recorded today cannot be decrypted later by a quantum computer.`
        : a.stage === 'at-risk'
          ? `${a.verdict} The connection is sound by today's standards (TLS 1.3, forward secrecy), but every session recorded now becomes readable when a large quantum computer exists. This is the "harvest now, decrypt later" risk, and it is the one thing the post-quantum transition fixes first.`
          : `${a.verdict} Without TLS 1.3 the hybrid post-quantum key exchange cannot be offered at all, and sessions recorded now fall when a large quantum computer exists.`;
  const p3 = `Authentication (the certificate chain) is reported but not scored against the host: no certificate on the public web can be made quantum-safe yet, and a signature cannot be forged retroactively, so there is nothing to do there today and nothing to fear. The stage name is the summary; the score under it (${a.score} of 100) is for those who want a number.`;
  return [p1, p2, p3];
}

export function renderReportHtml(result: ScanResult, options: ReportOptions): string {
  const { generatedAt, shareUrl, fontBase = '/fonts', fontUrls = {}, preparedFor = null } = options;
  const font = (file: FontFile) => fontUrls[file] ?? `${fontBase}/${file}`;
  const a = result.assessment;
  const f = result.findings;
  const host = hostOf(result);
  const colour = STAGE_COLOUR[a.stage];
  const good = a.stage === 'protected' || a.stage === 'ready';
  const k = a.keyExchange;
  const c = a.certificate;
  const fo = a.foundations;
  const inPlace = [fo.tls13, fo.noRsaKeyTransport, fo.shortLivedCertificate, fo.prefersHybrid, fo.trustedChain].filter((v) => v === true).length;

  const cover = `<div class="slide cover" data-page="1">
    <div class="cover-body">
      <div class="brand"><span class="mark"></span>Quantum Ready Labs</div>
      <div class="cover-kicker">Post-quantum readiness report</div>
      <h1 class="cover-host">${esc(host)}</h1>
      <div class="cover-meta">${esc(dateLine(generatedAt))}${preparedFor ? ` · Prepared for ${esc(preparedFor)}` : ''}</div>
      <div class="cover-grid">
        <div class="cover-ring">${ring(a.stage, a.score, 260, 18)}<div class="cover-ring-text"><div class="word" style="color:${colour}">${esc(STAGE_LABEL[a.stage])}</div><div class="num">${a.score}</div><div class="of">of 100</div></div></div>
        <div class="cover-verdict">
          <div class="cover-heading">${good ? 'Quantum ready' : a.stage === 'unreachable' || a.stage === 'inconclusive' ? esc(STAGE_LABEL[a.stage].charAt(0) + STAGE_LABEL[a.stage].slice(1).toLowerCase()) : 'Not yet quantum ready'}</div>
          <p>${esc(a.verdict)}</p>
          <div class="next"><div class="label">The one next step</div><div class="title">${esc(a.nextStep.title)}</div></div>
        </div>
      </div>
    </div>
    <div class="footer cover-footer">
      <div class="footer-info">
        <div class="confidential-block"><strong>Public result.</strong> Observed from the public Internet; contains no private data and may be shared.${shareUrl ? ` Live result: ${esc(shareUrl)}` : ''}</div>
        <div class="footer-bottom-row"><span class="footer-mark"></span><span class="footer-line"><strong>Quantum Ready Labs</strong> · A Manteiga Foundation project · quantumreadylabs.com</span></div>
      </div>
      <div class="footer-right"><span class="page-indicator">1 <span class="page-total">/ ${REPORT_PAGES}</span></span></div>
    </div>
  </div>`;

  const summary = slide(
    2,
    result,
    generatedAt,
    `${title('Executive', 'summary')}
    <div class="exec-text">${execParagraphs(result, a)
      .map((p) => `<p>${esc(p)}</p>`)
      .join('')}</div>
    <div class="rating-card">
      <div class="rating-callout"><div class="label">The one next step</div><div class="title">${esc(a.nextStep.title)}</div><p>${esc(a.nextStep.detail)}</p></div>
      <div class="rating-visual">${ring(a.stage, a.score, 140, 14)}<div class="rating-visual-text" style="color:${colour}">${esc(STAGE_LABEL[a.stage])}<br><span class="rating-score">${a.score}</span></div><div class="rating-label">Readiness</div></div>
    </div>
    <div class="legend-container">${STAGES.map(
      (st) => `<div class="legend-item ${st === a.stage ? 'current' : ''}" style="--rung:${STAGE_COLOUR[st]}"><div class="legend-dot"></div><div class="legend-content"><div class="legend-title">${esc(STAGE_LABEL[st])}</div><div class="legend-desc">${esc(STAGE_MEANING[st])}</div></div></div>`,
    ).join('')}</div>`,
  );

  const findings = slide(
    3,
    result,
    generatedAt,
    `${title('Where the host', 'stands')}
    ${ladder(a.stage)}
    <div class="cards">
      ${card(
        'Key exchange · confidentiality',
        k.status === 'hybrid' ? 'Hybrid post-quantum accepted' : k.status === 'classical' ? 'Classical only' : k.status === 'legacy' ? 'Legacy only' : 'No answer',
        k.status === 'hybrid' ? STAGE_COLOUR.protected : k.status === 'classical' ? STAGE_COLOUR['at-risk'] : STAGE_COLOUR.exposed,
        'The urgent half: traffic recorded today with a classical key exchange can be decrypted when a large quantum computer exists.',
        [
          `Hybrid groups: ${k.hybridGroups.length ? k.hybridGroups.join(', ') : 'none'}`,
          `Classical groups: ${k.classicalGroups.length ? k.classicalGroups.join(', ') : 'none'}`,
          `Server's pick for a current browser: ${k.preferred ?? 'not measured'}`,
          `TLS 1.3: ${yesNo(k.tls13, 'available', 'not available')}`,
          `TLS 1.2 RSA key transport: ${yesNo(k.rsaKeyTransport, 'still accepted (no forward secrecy)', 'refused')}`,
        ],
      )}
      ${card(
        'Certificate · authentication',
        c.status === 'unknown' ? 'Not read' : c.quantumSafe ? 'Post-quantum signed' : 'Classical, like all of the public web',
        c.quantumSafe ? STAGE_COLOUR.ready : INK,
        c.quantumSafe ? 'The chain is signed with a post-quantum algorithm.' : 'Nothing to do today, and nothing to fear: the Web PKI has no post-quantum roots yet, and a signature cannot be forged after the fact.',
        [
          c.leafKey ? `Key: ${c.leafKey}` : 'Key: not read',
          c.leafSignature ? `Signature: ${c.leafSignature}` : 'Signature: not read',
          c.leafDaysValid !== null ? `Lifetime: ${c.leafDaysValid} days${c.leafDaysRemaining !== null ? `, ${c.leafDaysRemaining} remaining` : ''}` : 'Lifetime: not read',
          `Chain: ${c.chainLength} link${c.chainLength === 1 ? '' : 's'}; trusted: ${yesNo(c.trusted, 'yes', 'no')}`,
        ],
      )}
      ${card(
        'Foundations · agility',
        `${inPlace} of 5 in place`,
        INK,
        'The habits that make the next transition cheap: modern protocol, no legacy fallbacks, automated short-lived certificates.',
        [
          `TLS 1.3: ${yesNo(fo.tls13, 'yes', 'no')}`,
          `No RSA key transport: ${yesNo(fo.noRsaKeyTransport, 'yes', 'no, still accepted')}`,
          `Short-lived certificate (100 days or less): ${yesNo(fo.shortLivedCertificate, 'yes', 'no')}`,
          `Server prefers hybrid when offered: ${yesNo(fo.prefersHybrid, 'yes', 'no')}`,
          `Chain trusted: ${yesNo(fo.trustedChain, 'yes', 'no')}`,
        ],
      )}
    </div>`,
  );

  const technical = slide(
    4,
    result,
    generatedAt,
    `${title('Technical', 'details')}
    <div class="two-col">
      <div>
        <h4>Probes</h4>
        <table class="table"><thead><tr><th>Probe</th><th>Answer</th></tr></thead><tbody>${probeRows(f)}</tbody></table>
      </div>
      <div>
        <h4>Certificate chain</h4>
        <table class="table chain"><thead><tr><th>Link</th><th>Subject</th><th>Issuer</th><th>Key</th><th>Signature</th><th>Until</th></tr></thead><tbody>${chainRows(f.chain)}</tbody></table>
        <h4>Connection</h4>
        <p class="small">${f.connection ? `A real connection negotiated ${esc(f.connection.protocol)} with ${esc(f.connection.cipher)}${f.connection.alpn ? `, ALPN ${esc(f.connection.alpn)}` : ''}.` : 'No ordinary connection could be completed.'} Scan time ${result.ms} ms from ${esc(result.address)}.${f.errors.length ? ` Probes without an answer: ${esc(f.errors.length)}.` : ''}</p>
        ${a.notes.length ? `<h4>Notes</h4><ul class="small">${a.notes.map((n) => `<li>${esc(n.text)}</li>`).join('')}</ul>` : ''}
      </div>
    </div>`,
  );

  const method = slide(
    5,
    result,
    generatedAt,
    `${title('Method, rubric and', 'standards')}
    <div class="two-col">
      <div>
        <h4>How the host was tested</h4>
        <p class="small">The engine builds TLS ClientHello messages by hand and reads the server's first reply in clear: offered one key-exchange group with no key share, a supporting server answers HelloRetryRequest naming it; a non-supporting server sends an alert. No post-quantum cryptography is implemented, no handshake completes, and the result is identical on every platform. One ordinary connection reads the negotiated parameters and the certificate chain. Fourteen probes, run concurrently, on port ${result.target.port}.</p>
        <h4>Why key exchange, and not the certificate</h4>
        <p class="small">A quantum computer able to break RSA and elliptic curves does not exist. The threat today is "harvest now, decrypt later": encrypted traffic recorded now falls when such a machine exists. That is solved in the key exchange, which current browsers, OpenSSL 3.5 and the large CDNs already do with hybrid post-quantum groups. Certificates authenticate the moment a connection happens; a signature cannot be forged retroactively, and the Web PKI has no post-quantum roots yet.</p>
      </div>
      <div>
        <h4>Score ${a.score} of 100</h4>
        <table class="table rubric"><tbody>
          <tr><td>Key exchange</td><td class="num">${a.points.keyExchange} / 60</td></tr>
          <tr><td>No RSA key transport</td><td class="num">${a.points.noRsaKeyTransport} / 10</td></tr>
          <tr><td>Short-lived certificate</td><td class="num">${a.points.shortLivedCertificate} / 8</td></tr>
          <tr><td>Server prefers hybrid</td><td class="num">${a.points.prefersHybrid} / 6</td></tr>
          <tr><td>Trusted chain</td><td class="num">${a.points.trustedChain} / 6</td></tr>
          <tr><td>Certificate algorithms</td><td class="num">${a.points.certificate} / 10</td></tr>
        </tbody></table>
        <h4>The stages</h4>
        <table class="table stages"><tbody>${STAGES.map((st) => `<tr><td class="stage-word" style="color:${STAGE_COLOUR[st]}">${esc(STAGE_LABEL[st])}</td><td>${esc(STAGE_MEANING[st])}</td></tr>`).join('')}</tbody></table>
        <h4>Standards</h4>
        <p class="small">NIST FIPS 203 (ML-KEM), FIPS 204 (ML-DSA), FIPS 205 (SLH-DSA); NIST IR 8547 (quantum-vulnerable algorithms deprecated after 2030, disallowed after 2035); NSA CNSA 2.0; IETF draft-ietf-tls-ecdhe-mlkem (the hybrid groups). Full rubric: quantumreadylabs.com, How we score.</p>
        <h4>Re-test</h4>
        <p class="small">Results are a snapshot. Re-test after any change at quantumreadylabs.com${shareUrl ? `; this result stays at ${esc(shareUrl)}` : ''}.</p>
      </div>
    </div>`,
  );

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>${esc(host)} · Post-quantum readiness report · Quantum Ready Labs</title>
<style>
@font-face { font-family: 'Titillium Web'; font-weight: 400; src: url('${font('titillium-web-latin-400-normal.woff2')}') format('woff2'); }
@font-face { font-family: 'Titillium Web'; font-weight: 600; src: url('${font('titillium-web-latin-600-normal.woff2')}') format('woff2'); }
@font-face { font-family: 'Titillium Web'; font-weight: 700; src: url('${font('titillium-web-latin-700-normal.woff2')}') format('woff2'); }
@font-face { font-family: 'JetBrains Mono'; font-weight: 400; src: url('${font('jetbrains-mono-latin-400-normal.woff2')}') format('woff2'); }
@page { size: 11in 8.5in; margin: 0; }
* { margin: 0; padding: 0; box-sizing: border-box; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
html, body { font-family: 'Titillium Web', sans-serif; font-size: 12px; line-height: 1.4; background: white; color: ${INK}; }
.slide { width: 11in; height: 8.5in; position: relative; overflow: hidden; page-break-after: always; page-break-inside: avoid; background: linear-gradient(145deg, #FFFFFF 0%, #F8FAFC 50%, #F1F5F9 100%); display: flex; flex-direction: column; }
.slide:last-child { page-break-after: auto; }
.slide::before { content: ''; position: absolute; left: 0; top: 0; width: 8px; height: 100%; background: linear-gradient(180deg, ${BASE} 0%, #4A6BD8 45%, ${GOLD} 100%); }
.slide::after { content: ''; position: absolute; inset: 0; background-image: linear-gradient(rgba(16,52,166,0.035) 1px, transparent 1px), linear-gradient(90deg, rgba(16,52,166,0.035) 1px, transparent 1px); background-size: 48px 48px; pointer-events: none; }
.content { flex: 1; display: flex; flex-direction: column; padding: 0.3in 0.8in 0; position: relative; z-index: 1; min-height: 0; }
.section-title { font-size: 32px; font-weight: 300; letter-spacing: -0.3px; text-transform: uppercase; margin-bottom: 12px; }
.section-title strong { font-weight: 700; }
.divider { width: 80px; height: 5px; background: linear-gradient(90deg, ${GOLD}, ${BASE}); border-radius: 2.5px; margin-bottom: 20px; }
h4 { font-size: 11px; font-weight: 700; letter-spacing: 1px; text-transform: uppercase; color: #475569; margin: 14px 0 8px; }
h4:first-child { margin-top: 0; }
.small { font-size: 12px; color: #475569; line-height: 1.6; }
.table.stages td { font-size: 11px; }
.table.stages .stage-word { font-weight: 700; letter-spacing: 1px; white-space: nowrap; }
ul.small { padding-left: 16px; }
.mono { font-family: 'JetBrains Mono', monospace; font-size: 10px; }
.dim { color: #94A3B8; }

/* Cover */
.cover .cover-body { flex: 1; padding: 0.7in 0.9in 0; position: relative; z-index: 1; display: flex; flex-direction: column; }
.brand { display: flex; align-items: center; gap: 10px; font-size: 13px; font-weight: 700; letter-spacing: 2px; text-transform: uppercase; color: ${BASE}; }
.mark, .footer-mark { display: inline-block; width: 18px; height: 18px; border-radius: 50%; border: 2.5px solid ${GOLD}; box-shadow: inset 0 0 0 3px white, inset 0 0 0 5px ${BASE}; }
.footer-mark { width: 14px; height: 14px; border-width: 2px; box-shadow: inset 0 0 0 2px white, inset 0 0 0 4px ${BASE}; }
.cover-kicker { margin-top: 0.55in; font-size: 14px; font-weight: 600; letter-spacing: 3px; text-transform: uppercase; color: #64748B; }
.cover-host { font-family: 'JetBrains Mono', monospace; font-size: 44px; font-weight: 400; letter-spacing: -0.5px; margin-top: 8px; word-break: break-all; }
.cover-meta { font-size: 13px; color: #64748B; margin-top: 6px; }
.cover-grid { display: flex; align-items: center; gap: 0.6in; margin-top: 0.45in; }
.cover-ring { position: relative; width: 260px; height: 260px; flex: none; }
.cover-ring .ring { position: absolute; inset: 0; }
.cover-ring-text { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; }
.cover-ring-text .word { font-size: 20px; font-weight: 700; letter-spacing: 3px; }
.cover-ring-text .num { font-family: 'JetBrains Mono', monospace; font-size: 64px; line-height: 1; margin-top: 4px; }
.cover-ring-text .of { font-size: 10px; letter-spacing: 2px; text-transform: uppercase; color: #94A3B8; margin-top: 4px; }
.cover-verdict { flex: 1; }
.cover-heading { font-size: 34px; font-weight: 700; letter-spacing: -0.3px; }
.cover-verdict p { font-size: 15px; color: #475569; line-height: 1.55; margin-top: 10px; }
.next { margin-top: 16px; padding: 12px 16px; border-left: 4px solid ${GOLD}; background: rgba(184,144,46,0.07); }
.next .label { font-size: 9px; letter-spacing: 2px; text-transform: uppercase; color: ${GOLD}; font-weight: 700; }
.next .title { font-size: 15px; font-weight: 600; margin-top: 2px; }

/* Executive summary */
.exec-text { font-size: 14px; line-height: 1.65; color: #475569; }
.exec-text p { margin-bottom: 12px; }
.rating-card { background: white; padding: 22px 36px; border-radius: 12px; box-shadow: 0 8px 30px rgba(0,0,0,0.04); border: 1px solid #E2E8F0; display: flex; align-items: center; justify-content: space-between; gap: 40px; margin-top: 14px; }
.rating-callout { flex: 1; }
.rating-callout .label { font-size: 9px; letter-spacing: 2px; text-transform: uppercase; color: ${GOLD}; font-weight: 700; }
.rating-callout .title { font-size: 17px; font-weight: 700; margin: 4px 0 8px; }
.rating-callout p { font-size: 12px; color: #475569; line-height: 1.55; }
.rating-visual { position: relative; width: 140px; height: 140px; flex: none; display: flex; align-items: center; justify-content: center; }
.rating-visual .ring { position: absolute; inset: 0; }
.rating-visual-text { position: relative; font-size: 10px; font-weight: 700; text-align: center; text-transform: uppercase; letter-spacing: 1px; line-height: 1.3; }
.rating-score { font-family: 'JetBrains Mono', monospace; font-size: 26px; color: ${INK}; letter-spacing: 0; }
.rating-label { position: absolute; bottom: -20px; font-size: 9px; color: #94A3B8; font-weight: 600; text-transform: uppercase; letter-spacing: 1px; }

/* Stage legend (summary page) */
.legend-container { display: flex; gap: 12px; margin-top: auto; margin-bottom: 8px; }
.legend-item { flex: 1; display: flex; gap: 10px; align-items: flex-start; background: #F8FAFC; padding: 12px 14px; border-radius: 8px; border: 1px solid #F1F5F9; }
.legend-item.current { background: white; border-color: var(--rung); box-shadow: 0 8px 30px rgba(0,0,0,0.05); }
.legend-dot { width: 12px; height: 12px; border-radius: 50%; background: var(--rung); flex: none; margin-top: 2px; }
.legend-title { font-size: 10px; font-weight: 700; letter-spacing: 1px; color: var(--rung); }
.legend-desc { font-size: 10px; color: #64748B; line-height: 1.4; margin-top: 2px; }

/* Ladder and cards */
.ladder { display: flex; gap: 10px; margin: 10px 0 18px; }
.rung { flex: 1; position: relative; padding: 14px 16px 14px; border-radius: 8px; background: #F8FAFC; border: 1px solid #E2E8F0; border-top: 4px solid var(--rung); opacity: 0.55; }
.rung.passed { opacity: 0.8; }
.rung.current { opacity: 1; background: white; box-shadow: 0 8px 30px rgba(0,0,0,0.06); }
.rung-word { font-size: 12px; font-weight: 700; letter-spacing: 1.5px; color: var(--rung); }
.rung-desc { font-size: 11px; color: #64748B; margin-top: 5px; line-height: 1.45; }
.rung-marker { position: absolute; top: -22px; right: 10px; font-size: 8px; font-weight: 700; letter-spacing: 1px; text-transform: uppercase; color: white; background: var(--rung); padding: 3px 7px; border-radius: 3px; }
.cards { display: flex; gap: 14px; flex: 1; margin-bottom: 14px; }
.card { flex: 1; display: flex; flex-direction: column; background: white; border-radius: 12px; border: 1px solid #E2E8F0; box-shadow: 0 8px 30px rgba(0,0,0,0.04); padding: 20px 22px; }
.card h3 { font-size: 9px; letter-spacing: 1.5px; text-transform: uppercase; color: #64748B; font-weight: 700; }
.card .state { font-size: 16px; font-weight: 700; margin: 8px 0 8px; }
.card p { font-size: 12px; color: #64748B; line-height: 1.5; }
.card ul { margin-top: auto; padding-top: 14px; padding-left: 16px; font-size: 12px; color: #475569; line-height: 1.65; }

/* Tables */
.two-col { display: flex; gap: 0.5in; min-height: 0; }
.two-col > div { flex: 1; min-width: 0; }
.table { width: 100%; border-collapse: collapse; font-size: 10.5px; }
.table th, .table td { text-align: left; padding: 4px 8px; border-bottom: 1px solid #E2E8F0; vertical-align: top; }
.table th { font-size: 8.5px; letter-spacing: 1px; text-transform: uppercase; color: #94A3B8; font-weight: 700; }
.table .kind { font-size: 8.5px; color: #94A3B8; }
.table .answer { font-weight: 600; white-space: nowrap; }
.table .answer.yes { color: ${STAGE_COLOUR.protected}; }
.table .answer.no { color: #94A3B8; }
.table .answer.err { color: ${STAGE_COLOUR.exposed}; }
.table .answer.warn { color: ${STAGE_COLOUR['at-risk']}; }
.table.rubric td.num { text-align: right; font-family: 'JetBrains Mono', monospace; }
.table.chain td { font-size: 9.5px; }

/* Footer */
.footer { padding: 0.12in 0.8in 0.28in 0.8in; display: flex; justify-content: space-between; align-items: flex-end; position: relative; z-index: 1; }
.footer-info { display: flex; flex-direction: column; gap: 6px; max-width: 760px; }
.confidential-block { font-size: 8.5px; color: #64748B; line-height: 1.5; }
.confidential-block strong { color: #475569; text-transform: uppercase; letter-spacing: 0.5px; }
.footer-bottom-row { display: flex; align-items: center; gap: 10px; }
.footer-line { font-size: 9.5px; color: #94A3B8; }
.footer-line strong { font-weight: 600; color: ${BASE}; }
.tag { font-size: 7px; font-weight: 700; text-transform: uppercase; letter-spacing: 1px; padding: 3px 6px; border-radius: 3px; background: rgba(16,52,166,0.08); color: ${BASE}; border: 1px solid rgba(16,52,166,0.15); }
.footer-right { display: flex; align-items: center; margin-bottom: 2px; }
.page-indicator { font-size: 12px; font-weight: 700; color: ${BASE}; }
.page-total { font-size: 12px; font-weight: 400; color: #94A3B8; }
.cover-footer { padding-left: 0.9in; }

@media screen { html { background: #64748B; } body { padding: 0.5in; background: #64748B; } .slide { margin: 0 auto 0.5in; box-shadow: 0 4px 6px rgba(0,0,0,0.05), 0 10px 40px rgba(0,0,0,0.15); } }
@media print { * { box-shadow: none !important; filter: none !important; } }
</style>
</head>
<body>
${cover}
${summary}
${findings}
${technical}
${method}
</body>
</html>`;
}
