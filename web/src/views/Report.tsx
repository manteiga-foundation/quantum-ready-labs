import { Animator, Animated } from '@arwes/react';
import { useState } from 'react';
import { STAGE_LABEL, STAGE_MEANING, type Assessment, type Findings } from '../../../engine/assess';
import { GROUP_NAMES, type GroupName } from '../../../engine/hello';
import { subscribe } from '../api';
import { Panel } from '../components/Panel';
import { Ring, stageColor } from '../components/Ring';
import type { ReportState } from '../report-model';

const GOOD = new Set(['protected', 'ready']);

const GROUP_KIND: Record<GroupName, string> = {
  X25519MLKEM768: 'hybrid post-quantum (standard)',
  SecP256r1MLKEM768: 'hybrid post-quantum (standard)',
  SecP384r1MLKEM1024: 'hybrid post-quantum (standard)',
  X25519Kyber768Draft00: 'hybrid post-quantum (pre-standard draft)',
  x25519: 'classical elliptic curve',
  secp256r1: 'classical elliptic curve',
  secp384r1: 'classical elliptic curve',
  secp521r1: 'classical elliptic curve',
  ffdhe2048: 'classical finite field',
  ffdhe3072: 'classical finite field',
};

function yesNo(v: boolean | null, yes: string, no: string, unknown = 'not measured'): string {
  return v === null ? unknown : v ? yes : no;
}

export function Report({ state, shared, onAnother }: { state: ReportState; shared: boolean; onAnother: () => void }) {
  const { assessment: a, findings: f } = state;
  const live = state.status === 'scanning';
  const good = GOOD.has(a.stage);
  const settled = state.status === 'done' || state.status === 'error';
  const [dialog, setDialog] = useState(false);
  const [copied, setCopied] = useState(false);

  const shareUrl = state.shareId ? `${window.location.origin}/r/${state.shareId}` : null;
  const copyLink = async () => {
    if (!shareUrl) return;
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      window.prompt('Copy this link', shareUrl);
    }
  };

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
            {live ? `${state.probes.length} of 14 probes` : state.status === 'error' ? 'stopped' : state.ms !== null ? `${state.probes.length || 14} probes in ${state.ms} ms` : 'complete'}
          </div>
        </aside>

        <div className="main">
          <Animator>
            <Animated as="section" className="summary" data-testid="summary" animated={['fade', ['y', 10, 0]]}>
              <h1>
                <span className="mark" aria-hidden="true" data-mark={good ? '✓' : live ? '…' : '!'} />
                {live ? 'Testing' : state.status === 'error' ? 'Scan not run' : good ? 'Quantum ready' : a.stage === 'unreachable' || a.stage === 'inconclusive' ? STAGE_LABEL[a.stage].charAt(0) + STAGE_LABEL[a.stage].slice(1).toLowerCase() : 'Not yet quantum ready'}
              </h1>
              {state.status === 'error' ? (
                <p className="verdict alert" role="alert" data-testid="verdict">
                  {state.error}
                </p>
              ) : (
                <p className="verdict" data-testid="verdict">
                  {live ? 'The probes are answering. The ring fills as the picture improves; the verdict settles when the last one is in.' : a.verdict}
                </p>
              )}
              {settled && state.status !== 'error' && (
                <div className="next" data-testid="next-step">
                  <div className="label">{a.stage === 'ready' ? 'Standing' : 'The one next step'}</div>
                  <p className="title">{a.nextStep.title}</p>
                  <p>{a.nextStep.detail}</p>
                </div>
              )}
              <div className="actions">
                {settled && state.status !== 'error' && (
                  <button type="button" className="button" onClick={() => setDialog(true)}>
                    Download report
                  </button>
                )}
                {shareUrl && (
                  <button type="button" className="button ghost" onClick={copyLink}>
                    {copied ? 'Link copied' : 'Share link'}
                  </button>
                )}
                {shared ? (
                  <a className="button ghost" href="/" onClick={(e) => { e.preventDefault(); onAnother(); }}>
                    Check your own host
                  </a>
                ) : (
                  settled && (
                    <a className="button ghost" href="/" onClick={(e) => { e.preventDefault(); onAnother(); }}>
                      Check another host
                    </a>
                  )
                )}
              </div>
            </Animated>
          </Animator>

          {settled && state.status !== 'error' && (
            <>
              <section className="section recommendations">
                <h2>Recommendations</h2>
                <ol>
                  <li>
                    <strong>{a.nextStep.title}</strong>
                    <span>{a.nextStep.detail}</span>
                  </li>
                  {a.notes.map((n) => (
                    <li key={n.id}>
                      <span>{n.text}</span>
                    </li>
                  ))}
                  {a.stage !== 'unreachable' && a.stage !== 'inconclusive' && (
                    <li>
                      <strong>Authentication: nothing to do yet</strong>
                      <span>
                        {a.certificate.quantumSafe
                          ? 'This chain is already signed with a post-quantum algorithm.'
                          : 'Certificates on the public web cannot yet be made quantum-safe by anyone: the Web PKI has no post-quantum roots. A signature cannot be forged retroactively, so there is no harvest-now risk here. Watch for ML-DSA certificates and your certificate authority\'s roadmap.'}
                      </span>
                    </li>
                  )}
                </ol>
              </section>

              <section className="section">
                <h2>Technical details</h2>
                <div className="cards">
                  <KeyExchangeCard a={a} f={f} />
                  <CertificateCard a={a} f={f} />
                  <FoundationsCard a={a} />
                </div>
                <details className="tech">
                  <summary>Every probe, the chain link by link, and the rubric</summary>
                  <ProbeTable state={state} />
                  <ChainTable f={f} />
                  <Rubric a={a} />
                </details>
              </section>
            </>
          )}
        </div>
        {dialog && <DownloadDialog host={state.host ?? ''} onClose={() => setDialog(false)} />}
        <div className="print-footer">
          Quantum Ready Labs · quantumreadylabs.com · {state.host} · {state.startedAt ? new Date(state.startedAt).toUTCString() : ''} · A Manteiga Foundation project
        </div>
      </main>
    </Animator>
  );
}

function KeyExchangeCard({ a, f }: { a: Assessment; f: Findings }) {
  const k = a.keyExchange;
  const color = k.status === 'hybrid' ? 'var(--stage-protected)' : k.status === 'classical' ? 'var(--stage-at-risk)' : 'var(--stage-exposed)';
  return (
    <Panel testId="key-exchange-card">
      <h3>Key exchange · confidentiality</h3>
      <div className="state" style={{ ['--state-color' as string]: color }}>
        {k.status === 'hybrid' ? 'Hybrid post-quantum accepted' : k.status === 'classical' ? 'Classical only' : k.status === 'legacy' ? 'Legacy only' : 'No answer'}
      </div>
      <p>This is the urgent half. Traffic recorded today with a classical key exchange can be decrypted when a large quantum computer exists.</p>
      <ul>
        <li>Hybrid groups: {k.hybridGroups.length ? k.hybridGroups.join(', ') : 'none'}</li>
        <li>Classical groups: {k.classicalGroups.length ? k.classicalGroups.join(', ') : 'none'}</li>
        <li>Server's pick for a current browser: {k.preferred ?? 'not measured'}</li>
        <li>TLS 1.3: {yesNo(k.tls13, 'available', 'not available')}</li>
        <li>TLS 1.2 RSA key transport: {yesNo(k.rsaKeyTransport, 'still accepted (no forward secrecy)', 'refused')}</li>
        {f.connection && <li>A real connection negotiated {f.connection.protocol}, {f.connection.cipher}</li>}
      </ul>
    </Panel>
  );
}

function CertificateCard({ a, f }: { a: Assessment; f: Findings }) {
  const c = a.certificate;
  return (
    <Panel testId="certificate-card">
      <h3>Certificate · authentication</h3>
      <div className="state" style={{ ['--state-color' as string]: c.quantumSafe ? 'var(--stage-ready)' : 'var(--text)' }}>
        {c.status === 'unknown' ? 'Not read' : c.quantumSafe ? 'Post-quantum signed' : 'Classical, like all of the public web'}
      </div>
      <p>
        {c.quantumSafe
          ? 'The chain is signed with a post-quantum algorithm.'
          : 'Certificates cannot yet be made quantum-safe on the public web; nothing is to be done here today, and nothing is to be feared: a signature cannot be forged after the fact.'}
      </p>
      <ul>
        {c.leafKey && <li>Key: {c.leafKey}</li>}
        {c.leafSignature && <li>Signature: {c.leafSignature}</li>}
        {c.leafDaysValid !== null && (
          <li>
            Lifetime: {c.leafDaysValid} days{c.leafDaysRemaining !== null ? `, ${c.leafDaysRemaining} remaining` : ''}
          </li>
        )}
        <li>Chain: {c.chainLength} link{c.chainLength === 1 ? '' : 's'}</li>
        <li>Trusted: {yesNo(c.trusted, 'yes', f.trustError ? `no (${f.trustError})` : 'no')}</li>
      </ul>
    </Panel>
  );
}

function FoundationsCard({ a }: { a: Assessment }) {
  const fo = a.foundations;
  const inPlace = [fo.tls13, fo.noRsaKeyTransport, fo.shortLivedCertificate, fo.prefersHybrid, fo.trustedChain].filter((v) => v === true).length;
  return (
    <Panel testId="foundations-card">
      <h3>Foundations · agility</h3>
      <div className="state">{inPlace} of 5 in place</div>
      <p>The habits that make the next transition cheap: modern protocol, no legacy fallbacks, automated short-lived certificates.</p>
      <ul>
        <li>TLS 1.3: {yesNo(fo.tls13, 'yes', 'no')}</li>
        <li>No RSA key transport: {yesNo(fo.noRsaKeyTransport, 'yes', 'no, still accepted')}</li>
        <li>Short-lived certificate (100 days or less): {yesNo(fo.shortLivedCertificate, 'yes', 'no')}</li>
        <li>Server prefers hybrid when offered: {yesNo(fo.prefersHybrid, 'yes', 'no')}</li>
        <li>Chain trusted: {yesNo(fo.trustedChain, 'yes', 'no')}</li>
      </ul>
    </Panel>
  );
}

function ProbeTable({ state }: { state: ReportState }) {
  const rows = [...state.probes].sort((x, y) => x.id.localeCompare(y.id));
  return (
    <div className="table-wrap">
      <table className="table">
        <thead>
          <tr>
            <th>Probe</th>
            <th>Answer</th>
            <th>What the server said</th>
            <th>ms</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((p) => (
            <tr key={p.id} data-testid="probe-row">
              <td>
                {p.label}
                {p.id.startsWith('group:') && <div className="dim">{GROUP_KIND[p.id.slice(6) as GroupName]}</div>}
              </td>
              <td className={`answer answer-${p.answer}`}>{p.answer === 'yes' ? 'supported' : p.answer === 'no' ? 'not supported' : 'no answer'}</td>
              <td className="dim">{p.detail}</td>
              <td className="dim">{p.ms}</td>
            </tr>
          ))}
          {GROUP_NAMES.filter((g) => !state.probes.some((p) => p.id === `group:${g}`)).map((g) => (
            <tr key={g} className="dim">
              <td>{g}</td>
              <td className="answer">waiting</td>
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
  if (!f.chain.length) return <p className="probe-meta">No certificate chain was read.</p>;
  return (
    <div className="table-wrap">
      <table className="table">
        <thead>
          <tr>
            <th>Link</th>
            <th>Subject</th>
            <th>Issuer</th>
            <th>Key</th>
            <th>Signature</th>
            <th>Valid until</th>
          </tr>
        </thead>
        <tbody>
          {f.chain.map((l, i) => (
            <tr key={i} data-testid="chain-link">
              <td className="dim">{i === 0 ? 'leaf' : l.selfSigned ? 'root' : 'intermediate'}</td>
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
  return (
    <>
      <p className="probe-meta">
        Score {a.score} of 100: key exchange {a.points.keyExchange} of 60; foundations {a.points.noRsaKeyTransport + a.points.shortLivedCertificate + a.points.prefersHybrid + a.points.trustedChain} of 30 (no RSA key transport {a.points.noRsaKeyTransport}/10, short-lived certificate{' '}
        {a.points.shortLivedCertificate}/8, prefers hybrid {a.points.prefersHybrid}/6, trusted chain {a.points.trustedChain}/6); certificate {a.points.certificate} of 10.
      </p>
      <p className="probe-meta">
        Stages: {(['exposed', 'at-risk', 'protected', 'ready'] as const).map((s) => `${STAGE_LABEL[s]}: ${STAGE_MEANING[s]}`).join(' ')}
      </p>
      <p className="probe-meta">
        Standards: NIST FIPS 203 (ML-KEM), IR 8547 (deprecated after 2030, disallowed after 2035), NSA CNSA 2.0, IETF draft-ietf-tls-ecdhe-mlkem.
      </p>
    </>
  );
}

function DownloadDialog({ host, onClose }: { host: string; onClose: () => void }) {
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const print = () => {
    onClose();
    setTimeout(() => window.print(), 50);
  };
  const withEmail = async () => {
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return;
    setBusy(true);
    await subscribe(email, host).catch(() => false);
    setBusy(false);
    print();
  };
  return (
    <div className="dialog-backdrop" role="dialog" aria-modal="true" aria-labelledby="dl-title">
      <div className="dialog">
        <h2 id="dl-title">Download the report</h2>
        <p>The report prints to PDF from your browser. If you would like a quarterly readiness report for {host}, leave an address; this is optional, and nothing is sent until the quarterly reports begin.</p>
        <label htmlFor="email" className="sr-only">
          Email
        </label>
        <input id="email" type="email" placeholder="you@example.com" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
        <div className="actions">
          <button type="button" className="button" onClick={withEmail} disabled={busy || !email}>
            Download and subscribe
          </button>
          <button type="button" className="button ghost" onClick={print}>
            Download only
          </button>
          <button type="button" className="button ghost" onClick={onClose}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
