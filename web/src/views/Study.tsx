// A study: the state-of-readiness note for a named population. The figures come from the
// study's results.csv through study-model.ts; nothing numeric is typed here. The tone follows the
// letters: nothing is broken today, the one next step, no comparison meant to shame.
import { useState } from 'react';
import { Animated, Animator } from '@arwes/react';
import { STAGE_LABEL, STAGE_MEANING } from '../../../engine/assess';
import { Panel } from '../components/Panel';
import { allStudies, studyFor } from '../studies';
import { STUDY_STAGES, summarize, type StudyStage } from '../study-model';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

/** 2026-10-18 -> 18 October 2026. */
export function longDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  return `${d} ${MONTHS[m - 1]} ${y}`;
}

export function StudyIndex({ go }: { go: (path: string) => void }) {
  return (
    <main className="metrics study">
      <h1>Studies</h1>
      <p className="notice">
        A study is a named population scanned by the maintainer on one day, published as a state-of-readiness note: the figures, every institution with its result, the method. Studies are kept apart from the scanner's organic use.
      </p>
      <ul className="study-list">
        {allStudies().map((m) => (
          <li key={m.slug}>
            <a href={`/studies/${m.slug}`} onClick={(e) => { e.preventDefault(); go(`/studies/${m.slug}`); }}>{m.title}</a>
            <span className="dim">{m.subtitle}. Observed {longDate(m.observedOn)}.</span>
          </li>
        ))}
      </ul>
    </main>
  );
}

export function Study({ slug, go }: { slug: string; go: (path: string) => void }) {
  const study = studyFor(slug);
  const [filter, setFilter] = useState<'all' | StudyStage>('all');
  if (!study) {
    return (
      <main className="metrics study">
        <h1>No such study</h1>
        <p className="notice">
          Nothing is published under this name. The studies that exist are listed at <a href="/studies" onClick={(e) => { e.preventDefault(); go('/studies'); }}>/studies</a>.
        </p>
      </main>
    );
  }
  const { meta, rows } = study;
  const s = summarize(rows);
  const observed = longDate(meta.observedOn);
  const shown = filter === 'all' ? rows : rows.filter((r) => r.stage === filter);

  return (
    <Animator combine manager="stagger">
      <main className="metrics study">
        <div>
          <Animator>
            <Animated as="h1" animated={['fade', ['y', 16, 0]]}>{meta.title}</Animated>
          </Animator>
          <p className="notice">{meta.subtitle}. Observed {observed}. By Manteiga Foundation, with the open-source Quantum Ready Labs scanner.</p>
        </div>

        <section className="section" aria-label="Findings">
          <p className="lead" data-testid="study-lead">
            {meta.lead} {s.counts.exposed} do not offer TLS 1.3 at all (Exposed); {s.counts['at-risk']} offer TLS 1.3 without a post-quantum key exchange (At risk); {s.counts.protected} accept a hybrid post-quantum key exchange (Protected); {s.counts.ready} add the foundations for what comes next (Ready). The median institution scores {s.median} of 100.
          </p>
          <p className="calm" data-testid="study-calm">
            Nothing is broken today. No account, login or transaction at any of these institutions is at risk from what this note describes; every connection tested is encrypted with algorithms no computer that exists can break. The question is about recordings: traffic captured now can be kept and decrypted once a large enough quantum computer exists, which is why NIST has set 2030 and 2035 as the dates for retiring today's key exchange, and why browsers and the largest web properties already negotiate a hybrid post-quantum key exchange. For {s.counts.exposed} of the {s.notYetCount} not yet protected, the next step is to enable TLS 1.3; for the other {s.counts['at-risk']} it is to enable the X25519MLKEM768 key exchange, which on current servers and content-delivery networks is a configuration line or a toggle.
          </p>
          <div className="counts">
            {STUDY_STAGES.map((st) => (
              <Panel key={st} className="count" corners>
                <div className="label">{STAGE_LABEL[st]}</div>
                <div className="value" data-testid={`count-${st}`} style={{ color: `var(--stage-${st})` }}>{s.counts[st]}</div>
              </Panel>
            ))}
          </div>
          <div className="study-bar" data-testid="study-bar" role="img" aria-label={`${s.protectedShare} percent protected or ready`}>
            {STUDY_STAGES.map((st) => (
              <div key={st} className="seg" style={{ flex: s.counts[st], background: `var(--stage-${st})` }} title={`${STAGE_LABEL[st]}: ${s.counts[st]}`} />
            ))}
          </div>
          <div className="legend">
            {STUDY_STAGES.map((st) => (
              <span key={st} title={STAGE_MEANING[st]}>
                <span className="swatch" style={{ background: `var(--stage-${st})` }} />
                {STAGE_LABEL[st]}
              </span>
            ))}
            <span className="dim">{s.protectedShare}% protected or ready</span>
          </div>
        </section>

        <section className="section" aria-labelledby="institutions-title">
          <h2 id="institutions-title">Every institution</h2>
          <p className="notice">
            Alphabetical, all {s.total}. Each row links to the full result page and the PDF report as observed on {observed}; Test again runs a fresh scan now. Stage and score measure quantum readiness only, not general security.
          </p>
          <div className="chips" role="group" aria-label="Filter by stage">
            <button type="button" className="chip" aria-pressed={filter === 'all'} onClick={() => setFilter('all')}>All {s.total}</button>
            {STUDY_STAGES.map((st) => (
              <button key={st} type="button" className="chip" aria-pressed={filter === st} onClick={() => setFilter(st)} style={{ ['--chip' as string]: `var(--stage-${st})` }}>
                {STAGE_LABEL[st].charAt(0) + STAGE_LABEL[st].slice(1).toLowerCase()} {s.counts[st]}
              </button>
            ))}
          </div>
          <div className="table-wrap">
            <table className="table study-table">
              <thead>
                <tr>
                  <th>Institution</th>
                  <th>Stage</th>
                  <th>Score</th>
                  <th className="optional">Next step</th>
                  <th>Result</th>
                </tr>
              </thead>
              <tbody>
                {shown.map((r) => (
                  <tr key={r.domain} data-testid="institution-row">
                    <td>
                      <span data-testid="institution-name">{r.name}</span>
                      <span className="mono domain">{r.domain}</span>
                    </td>
                    <td className="answer" data-testid="institution-stage" style={{ color: `var(--stage-${r.stage})` }}>{STAGE_LABEL[r.stage]}</td>
                    <td className="mono" data-testid="institution-score">{r.score ?? '\u2014'}</td>
                    <td className="optional dim" data-testid="institution-next">{r.error ? r.error : r.nextStep}</td>
                    <td className="links">
                      {r.id ? (
                        <>
                          <a href={r.share} rel="noopener">Report</a>
                          <a href={r.pdf} rel="noopener">PDF</a>
                        </>
                      ) : (
                        <span className="dim">none</span>
                      )}
                      <a href={`/scan?host=${encodeURIComponent(r.domain)}`} onClick={(e) => { e.preventDefault(); go(`/scan?host=${encodeURIComponent(r.domain)}`); }}>Test again</a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="section" aria-labelledby="method-title" data-testid="study-method">
          <h2 id="method-title">Method</h2>
          <p>{meta.population}</p>
          <p>
            Each domain was tested on {observed} exactly as a browser visit would be: fourteen TLS handshakes and one ordinary connection, nothing more. No page was opened and no login was attempted. The probes read, in clear, whether the server offers TLS 1.3, which key-exchange groups it accepts, among them the hybrid post-quantum group X25519MLKEM768 that current browsers propose, whether it still accepts RSA key transport, and the certificate chain.            The {s.counts.exposed} Exposed results were cross-checked with OpenSSL 3 and curl, which could not complete a TLS 1.3 handshake with any of them either.
          </p>
          <p>
            The rubric is public: <a href="https://github.com/manteiga-foundation/quantum-ready-labs/blob/main/docs/scoring.md" rel="noopener">How we score</a>. The scanner is open source under the MIT licence; anyone can repeat the measurement with <span className="mono">bun run scan &lt;host&gt;</span> or the <a href="/api" onClick={(e) => { e.preventDefault(); go('/api'); }}>API</a>. Standards cited: NIST IR 8547 (transition to post-quantum cryptography: deprecate quantum-vulnerable key exchange by 2030, disallow by 2035), FIPS 203 (ML-KEM), CNSA 2.0.
          </p>
          <p>
            A domain that is wrong, or a change made since the observation: write to hello@manteiga.org. Test again shows today's state at once, and the population is re-scanned each quarter; a fresh result replaces the row at the next run.
          </p>
        </section>

        <p className="cta">
          <a className="button" href="/" onClick={(e) => { e.preventDefault(); go('/'); }}>Check your own host</a>
        </p>
      </main>
    </Animator>
  );
}
