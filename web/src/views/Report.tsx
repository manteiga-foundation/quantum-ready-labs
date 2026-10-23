import { Animator, Animated } from '@arwes/react';
import { useEffect, useState } from 'react';
import type { Assessment, Findings, NextStepId, NoteId } from '../../../engine/assess';
import { GROUP_NAMES, type GroupName } from '../../../engine/hello';
import { subscribe } from '../api';
import { Panel } from '../components/Panel';
import { Ring, stageColor } from '../components/Ring';
import type { Messages } from '../i18n/en';
import { HTML_LANG, localePath } from '../i18n/locales';
import { errorText, useI18n } from '../i18n/react';
import type { ReportState } from '../report-model';

const GOOD = new Set(['protected', 'ready']);

const GROUP_KIND: Record<GroupName, keyof Messages['report']['probes']> = {
  X25519MLKEM768: 'pqStandard',
  SecP256r1MLKEM768: 'pqStandard',
  SecP384r1MLKEM1024: 'pqStandard',
  X25519Kyber768Draft00: 'pqDraft',
  x25519: 'ecc',
  secp256r1: 'ecc',
  secp384r1: 'ecc',
  secp521r1: 'ecc',
  ffdhe2048: 'ff',
  ffdhe3072: 'ff',
};

function yesNo(v: boolean | null, yes: string, no: string, unknown: string): string {
  return v === null ? unknown : v ? yes : no;
}

/** The next step in the reader's words, by id; a step the catalogue does not know keeps the engine's words. */
function stepText(t: Messages, step: Assessment['nextStep']): { title: string; detail: string } {
  return t.report.steps[step.id as NextStepId] ?? step;
}

export function Report({ state, shared, onAnother }: { state: ReportState; shared: boolean; onAnother: () => void }) {
  const { t, locale } = useI18n();
  const r = t.report;
  const { assessment: a, findings: f } = state;
  const live = state.status === 'scanning';
  const good = GOOD.has(a.stage);
  const settled = state.status === 'done' || state.status === 'error';
  const [dialog, setDialog] = useState(false);
  const [copied, setCopied] = useState(false);
  const step = stepText(t, a.nextStep);

  // A shared link opens in the language it was shared in.
  const shareUrl = state.shareId ? `${window.location.origin}${localePath(locale, `/r/${state.shareId}`)}` : null;
  const copyLink = async () => {
    if (!shareUrl) return;
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      window.prompt(r.copyPrompt, shareUrl);
    }
  };

  const heading = live
    ? r.headingTesting
    : state.status === 'error'
      ? r.headingNotRun
      : good
        ? r.headingReady
        : a.stage === 'unreachable'
          ? r.headingUnreachable
          : a.stage === 'inconclusive'
            ? r.headingInconclusive
            : r.headingNotReady;

  return (
    <Animator combine manager="stagger">
      <main className="report" data-stage={a.stage} style={{ ['--stage-color' as string]: stageColor(a.stage) }}>
        <aside className="aside">
          <Ring stage={a.stage} score={a.score} live={live} />
          <div className="target-line">
            {state.host}
            {state.port && state.port !== 443 ? `:${state.port}` : ''}
            {state.address ? ` · ${state.address}` : ''}
          </div>
          <div className={`status-line ${live ? 'live' : ''}`}>
            {live ? r.probesLive(state.probes.length) : state.status === 'error' ? r.stopped : state.ms !== null ? r.probesDone(state.probes.length || 14, state.ms) : r.complete}
          </div>
        </aside>

        <div className="main">
          <Animator>
            <Animated as="section" className="summary" data-testid="summary" animated={['fade', ['y', 10, 0]]}>
              <h1>
                <span className="mark" aria-hidden="true" data-mark={good ? '✓' : live ? '…' : '!'} />
                {heading}
              </h1>
              {state.status === 'error' ? (
                <p className="verdict alert" role="alert" data-testid="verdict">
                  {errorText(t, state.error, state.errorCode, state.errorParams)}
                </p>
              ) : (
                <p className="verdict" data-testid="verdict">
                  {live ? r.liveVerdict : r.verdict[a.stage]}
                </p>
              )}
              {settled && state.status !== 'error' && (
                <div className="next" data-testid="next-step">
                  <div className="label">{a.stage === 'ready' ? r.standing : r.nextStep}</div>
                  <p className="title">{step.title}</p>
                  <p>{step.detail}</p>
                </div>
              )}
              <div className="actions">
                {settled && state.status !== 'error' && (
                  <button type="button" className="button" onClick={() => setDialog(true)}>
                    {r.download}
                  </button>
                )}
                {shareUrl && (
                  <button type="button" className="button ghost" onClick={copyLink}>
                    {copied ? r.copied : r.share}
                  </button>
                )}
                {shared ? (
                  <a className="button ghost" href={localePath(locale, '/')} onClick={(e) => { e.preventDefault(); onAnother(); }}>
                    {r.checkOwn}
                  </a>
                ) : (
                  settled && (
                    <a className="button ghost" href={localePath(locale, '/')} onClick={(e) => { e.preventDefault(); onAnother(); }}>
                      {r.checkAnother}
                    </a>
                  )
                )}
              </div>
            </Animated>
          </Animator>

          {settled && state.status !== 'error' && (
            <>
              <section className="section recommendations">
                <h2>{r.recommendations}</h2>
                <ol>
                  <li>
                    <strong>{step.title}</strong>
                    <span>{step.detail}</span>
                  </li>
                  {a.notes.map((n) => (
                    <li key={n.id}>
                      <span>{r.notes[n.id as NoteId]?.(f.trustError ?? r.unknownReason) ?? n.text}</span>
                    </li>
                  ))}
                  {a.stage !== 'unreachable' && a.stage !== 'inconclusive' && (
                    <li>
                      <strong>{r.authTitle}</strong>
                      <span>{a.certificate.quantumSafe ? r.authPq : r.authClassical}</span>
                    </li>
                  )}
                </ol>
              </section>

              <section className="section">
                <h2>{r.technical}</h2>
                <div className="cards">
                  <KeyExchangeCard a={a} f={f} />
                  <CertificateCard a={a} f={f} />
                  <FoundationsCard a={a} />
                </div>
                <details className="tech">
                  <summary>{r.detailsSummary}</summary>
                  <ProbeTable state={state} />
                  <ChainTable f={f} />
                  <Rubric a={a} />
                </details>
              </section>
            </>
          )}
        </div>
        {dialog && <DownloadDialog host={state.host ?? ''} pdfUrl={state.shareId ? `/api/report/${state.shareId}.pdf` : null} onClose={() => setDialog(false)} />}
        <div className="print-footer">
          Quantum Ready Labs · quantumreadylabs.com · {state.host} · {state.startedAt ? new Date(state.startedAt).toLocaleString(HTML_LANG[locale], { timeZone: 'UTC', dateStyle: 'medium', timeStyle: 'short' }) + ' UTC' : ''} · {r.printFooter}
        </div>
      </main>
    </Animator>
  );
}

function KeyExchangeCard({ a, f }: { a: Assessment; f: Findings }) {
  const { t } = useI18n();
  const r = t.report;
  const k = a.keyExchange;
  const color = k.status === 'hybrid' ? 'var(--stage-protected)' : k.status === 'classical' ? 'var(--stage-at-risk)' : 'var(--stage-exposed)';
  return (
    <Panel testId="key-exchange-card">
      <h3>{r.kx.title}</h3>
      <div className="state" style={{ ['--state-color' as string]: color }}>
        {k.status === 'hybrid' ? r.kx.hybrid : k.status === 'classical' ? r.kx.classical : k.status === 'legacy' ? r.kx.legacy : r.kx.noAnswer}
      </div>
      <p>{r.kx.body}</p>
      <ul>
        <li>
          {r.kx.hybridGroups}{r.sep}{k.hybridGroups.length ? k.hybridGroups.join(', ') : r.none}
        </li>
        <li>
          {r.kx.classicalGroups}{r.sep}{k.classicalGroups.length ? k.classicalGroups.join(', ') : r.none}
        </li>
        <li>
          {r.kx.preferred}{r.sep}{k.preferred ?? r.notMeasured}
        </li>
        <li>
          {r.kx.tls13}{r.sep}{yesNo(k.tls13, r.kx.available, r.kx.notAvailable, r.notMeasured)}
        </li>
        <li>
          {r.kx.rsaTransport}{r.sep}{yesNo(k.rsaKeyTransport, r.kx.stillAcceptedNoFs, r.kx.refused, r.notMeasured)}
        </li>
        {f.connection && <li>{r.kx.realConnection(f.connection.protocol, f.connection.cipher)}</li>}
      </ul>
    </Panel>
  );
}

function CertificateCard({ a, f }: { a: Assessment; f: Findings }) {
  const { t } = useI18n();
  const r = t.report;
  const c = a.certificate;
  return (
    <Panel testId="certificate-card">
      <h3>{r.cert.title}</h3>
      <div className="state" style={{ ['--state-color' as string]: c.quantumSafe ? 'var(--stage-ready)' : 'var(--text)' }}>
        {c.status === 'unknown' ? r.cert.notRead : c.quantumSafe ? r.cert.pqSigned : r.cert.classical}
      </div>
      <p>{c.quantumSafe ? r.cert.bodyPq : r.cert.bodyClassical}</p>
      <ul>
        {c.leafKey && (
          <li>
            {r.cert.key}{r.sep}{c.leafKey}
          </li>
        )}
        {c.leafSignature && (
          <li>
            {r.cert.signature}{r.sep}{c.leafSignature}
          </li>
        )}
        {c.leafDaysValid !== null && (
          <li>
            {r.cert.lifetime}{r.sep}{r.cert.days(c.leafDaysValid)}
            {c.leafDaysRemaining !== null ? `, ${r.cert.remaining(c.leafDaysRemaining)}` : ''}
          </li>
        )}
        <li>
          {r.cert.chain}{r.sep}{r.cert.links(c.chainLength)}
        </li>
        <li>
          {r.cert.trusted}{r.sep}{yesNo(c.trusted, r.yes, f.trustError ? `${r.no} (${f.trustError})` : r.no, r.notMeasured)}
        </li>
      </ul>
    </Panel>
  );
}

function FoundationsCard({ a }: { a: Assessment }) {
  const { t } = useI18n();
  const r = t.report;
  const fo = a.foundations;
  const inPlace = [fo.tls13, fo.noRsaKeyTransport, fo.shortLivedCertificate, fo.prefersHybrid, fo.trustedChain].filter((v) => v === true).length;
  return (
    <Panel testId="foundations-card">
      <h3>{r.foundations.title}</h3>
      <div className="state">{r.foundations.inPlace(inPlace)}</div>
      <p>{r.foundations.body}</p>
      <ul>
        <li>
          {r.foundations.tls13}{r.sep}{yesNo(fo.tls13, r.yes, r.no, r.notMeasured)}
        </li>
        <li>
          {r.foundations.noRsa}{r.sep}{yesNo(fo.noRsaKeyTransport, r.yes, r.foundations.noRsaNo, r.notMeasured)}
        </li>
        <li>
          {r.foundations.shortLived}{r.sep}{yesNo(fo.shortLivedCertificate, r.yes, r.no, r.notMeasured)}
        </li>
        <li>
          {r.foundations.prefersHybrid}{r.sep}{yesNo(fo.prefersHybrid, r.yes, r.no, r.notMeasured)}
        </li>
        <li>
          {r.foundations.chainTrusted}{r.sep}{yesNo(fo.trustedChain, r.yes, r.no, r.notMeasured)}
        </li>
      </ul>
    </Panel>
  );
}

function ProbeTable({ state }: { state: ReportState }) {
  const { t } = useI18n();
  const p = t.report.probes;
  const rows = [...state.probes].sort((x, y) => x.id.localeCompare(y.id));
  return (
    <div className="table-wrap">
      <table className="table">
        <thead>
          <tr>
            <th>{p.probe}</th>
            <th>{p.answer}</th>
            <th>{p.said}</th>
            <th>{p.ms}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id} data-testid="probe-row">
              <td>
                {row.label}
                {row.id.startsWith('group:') && <div className="dim">{p[GROUP_KIND[row.id.slice(6) as GroupName]]}</div>}
              </td>
              <td className={`answer answer-${row.id === 'rsa-transport' && row.answer !== 'error' ? (row.answer === 'yes' ? 'warn' : 'yes') : row.answer}`}>
                {row.id === 'rsa-transport'
                  ? row.answer === 'yes'
                    ? p.stillAccepted
                    : row.answer === 'no'
                      ? p.refused
                      : p.noAnswer
                  : row.answer === 'yes'
                    ? p.supported
                    : row.answer === 'no'
                      ? p.notSupported
                      : p.noAnswer}
              </td>
              <td className="dim">{row.detail}</td>
              <td className="dim">{row.ms}</td>
            </tr>
          ))}
          {GROUP_NAMES.filter((g) => !state.probes.some((row) => row.id === `group:${g}`)).map((g) => (
            <tr key={g} className="dim">
              <td>{g}</td>
              <td className="answer">{p.waiting}</td>
              <td />
              <td />
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ChainTable({ f }: { f: Findings }) {
  const { t } = useI18n();
  const c = t.report.chain;
  if (!f.chain.length) return <p className="probe-meta">{c.none}</p>;
  return (
    <div className="table-wrap">
      <table className="table">
        <thead>
          <tr>
            <th>{c.link}</th>
            <th>{c.subject}</th>
            <th>{c.issuer}</th>
            <th>{c.key}</th>
            <th>{c.signature}</th>
            <th>{c.validUntil}</th>
          </tr>
        </thead>
        <tbody>
          {f.chain.map((l, i) => (
            <tr key={i} data-testid="chain-link">
              <td className="dim">{i === 0 ? c.leaf : l.selfSigned ? c.root : c.intermediate}</td>
              <td className="mono">{l.subject}</td>
              <td className="mono dim">{l.issuer}</td>
              <td>{l.keyDetail}</td>
              <td>{l.signatureAlgorithm}</td>
              <td className="dim">{l.notAfter.slice(0, 10)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Rubric({ a }: { a: Assessment }) {
  const { t } = useI18n();
  const r = t.report;
  const p = a.points;
  return (
    <>
      <p className="probe-meta">
        {r.rubric(a.score, p.keyExchange, p.noRsaKeyTransport + p.shortLivedCertificate + p.prefersHybrid + p.trustedChain, p.noRsaKeyTransport, p.shortLivedCertificate, p.prefersHybrid, p.trustedChain, p.certificate)}
      </p>
      <p className="probe-meta">
        {r.stages}{r.sep}{(['exposed', 'at-risk', 'protected', 'ready'] as const).map((s) => `${t.stage.label[s]}${r.sep}${t.stage.meaning[s]}`).join(' ')}
      </p>
      <p className="probe-meta">{r.standards}</p>
    </>
  );
}

function DownloadDialog({ host, pdfUrl, onClose }: { host: string; pdfUrl: string | null; onClose: () => void }) {
  const { t } = useI18n();
  const d = t.dialog;
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const pdf = usePreparedPdf(pdfUrl);
  const download = () => {
    if (pdfUrl) {
      if (pdf.status !== 'ready') return;
      const a = document.createElement('a');
      a.href = pdf.objectUrl;
      a.download = pdf.filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      onClose();
    } else {
      onClose();
      setTimeout(() => window.print(), 50);
    }
  };
  const withEmail = async () => {
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return;
    setBusy(true);
    await subscribe(email, host).catch(() => false);
    setBusy(false);
    download();
  };
  const notReady = pdfUrl !== null && pdf.status !== 'ready';
  return (
    <div className="dialog-backdrop" role="dialog" aria-modal="true" aria-labelledby="dl-title">
      <div className="dialog">
        <h2 id="dl-title">{d.title}</h2>
        <p>
          {pdfUrl ? d.bodyPdf : d.bodyPrint} {d.subscribe(host)}
        </p>
        {pdfUrl && (
          <div className={`pdf-progress pdf-${pdf.status}`} data-testid="pdf-progress" role="status" aria-live="polite">
            <div className="pdf-bar" aria-hidden="true">
              <span />
            </div>
            <span className="pdf-text">
              {pdf.status === 'preparing' && (pdf.slow ? d.preparingSlow : d.preparing)}
              {pdf.status === 'ready' && d.ready(Math.max(1, Math.round(pdf.bytes / 1024)))}
              {pdf.status === 'error' && d.error}
            </span>
          </div>
        )}
        <label htmlFor="email" className="sr-only">
          {d.email}
        </label>
        <input id="email" type="email" placeholder="you@example.com" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
        <div className="actions">
          <button type="button" className="button" onClick={withEmail} disabled={busy || !email || notReady}>
            {d.downloadSubscribe}
          </button>
          <button type="button" className="button ghost" onClick={download} data-testid="download-only" disabled={notReady}>
            {pdfUrl ? (pdf.status === 'preparing' ? d.preparingButton : d.downloadPdf) : d.print}
          </button>
          <button type="button" className="button ghost" onClick={onClose}>
            {d.cancel}
          </button>
        </div>
      </div>
    </div>
  );
}

type PreparedPdf = { status: 'preparing'; slow: boolean } | { status: 'ready'; objectUrl: string; filename: string; bytes: number } | { status: 'error' };

/** Fetches the PDF as soon as the dialog opens, so the wait overlaps the reader's decision. */
function usePreparedPdf(pdfUrl: string | null): PreparedPdf {
  const [state, setState] = useState<PreparedPdf>({ status: 'preparing', slow: false });
  useEffect(() => {
    if (!pdfUrl) return;
    let cancelled = false;
    let objectUrl: string | null = null;
    const slowTimer = setTimeout(() => !cancelled && setState((s) => (s.status === 'preparing' ? { status: 'preparing', slow: true } : s)), 2500);
    (async () => {
      try {
        const res = await fetch(pdfUrl);
        if (!res.ok) throw new Error(String(res.status));
        const blob = await res.blob();
        if (cancelled) return;
        objectUrl = URL.createObjectURL(blob);
        const filename = res.headers.get('content-disposition')?.match(/filename="([^"]+)"/)?.[1] ?? 'quantum-readiness.pdf';
        setState({ status: 'ready', objectUrl, filename, bytes: blob.size });
      } catch {
        if (!cancelled) setState({ status: 'error' });
      }
    })();
    return () => {
      cancelled = true;
      clearTimeout(slowTimer);
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [pdfUrl]);
  return state;
}
