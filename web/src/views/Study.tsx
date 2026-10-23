// A study: the state-of-readiness note for a named population. The figures come from the
// study's results.csv through study-model.ts; nothing numeric is typed here. The tone follows the
// letters: nothing is broken today, the one next step, no comparison meant to shame. The frame's
// words live in the message catalogues; the study's own words (title, population, lead) on its meta.
import { useState } from 'react';
import { Animated, Animator } from '@arwes/react';
import { STEPS } from '../../../engine/assess';
import { Panel } from '../components/Panel';
import { HTML_LANG, localePath, type Locale } from '../i18n/locales';
import { Rich, useI18n } from '../i18n/react';
import { allStudies, studyFor } from '../studies';
import { STUDY_STAGES, studyText, summarize, type StudyStage } from '../study-model';

/** 2026-10-18 -> 18 October 2026, 18. Oktober 2026, 2026年10月18日 ... */
export function longDate(iso: string, locale: Locale = 'en'): string {
  const [y, m, d] = iso.split('-').map(Number);
  return new Intl.DateTimeFormat(locale === 'en' ? 'en-GB' : HTML_LANG[locale], { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(Date.UTC(y, m - 1, d)));
}

/** EXPOSED -> Exposed, EN RIESGO -> En riesgo; scripts without case stay as they are. */
function wordCase(label: string): string {
  return label.charAt(0) + label.slice(1).toLowerCase();
}

/** A stage word inside prose, in the stage's colour: Exposed, At risk, Protected, Ready. */
function Word({ stage }: { stage: StudyStage }) {
  const { t } = useI18n();
  return (
    <span className="stage-inline" data-stage={stage} style={{ color: `var(--stage-${stage})` }}>
      {wordCase(t.stage.label[stage])}
    </span>
  );
}

const STAGE_WORDS = { exposed: <Word stage="exposed" />, 'at-risk': <Word stage="at-risk" />, protected: <Word stage="protected" />, ready: <Word stage="ready" /> };

/** The CSV carries the engine's English next-step title; say it in the reader's language. */
const STEP_BY_TITLE = new Map(Object.entries(STEPS).map(([id, s]) => [s.title, id as keyof typeof STEPS]));

export function StudyIndex({ go }: { go: (path: string) => void }) {
  const { t, locale } = useI18n();
  return (
    <main className="metrics study">
      <h1>{t.study.indexTitle}</h1>
      <p className="notice">{t.study.indexIntro}</p>
      <ul className="study-list">
        {allStudies().map((m) => {
          const text = studyText(m, locale);
          return (
            <li key={m.slug}>
              <a href={localePath(locale, `/studies/${m.slug}`)} onClick={(e) => { e.preventDefault(); go(`/studies/${m.slug}`); }}>{text.title}</a>
              <span className="dim">
                {text.subtitle}. {t.study.observed(longDate(m.observedOn, locale))}
              </span>
            </li>
          );
        })}
      </ul>
    </main>
  );
}

export function Study({ slug, go }: { slug: string; go: (path: string) => void }) {
  const { t, locale } = useI18n();
  const st = t.study;
  const study = studyFor(slug);
  const [filter, setFilter] = useState<'all' | StudyStage>('all');
  if (!study) {
    return (
      <main className="metrics study">
        <h1>{st.notFoundTitle}</h1>
        <p className="notice">
          <Rich text={st.notFoundBody} />
        </p>
      </main>
    );
  }
  const { meta, rows } = study;
  const text = studyText(meta, locale);
  const s = summarize(rows);
  const observed = longDate(meta.observedOn, locale);
  const shown = filter === 'all' ? rows : rows.filter((r) => r.stage === filter);
  const slots = {
    ...STAGE_WORDS,
    notYet: s.notYetCount,
    exposedCount: s.counts.exposed,
    atRiskCount: s.counts['at-risk'],
    protectedTotal: s.protectedCount,
    protectedCount: s.counts.protected,
    readyCount: s.counts.ready,
    median: s.median,
    date: observed,
    exposedWord: wordCase(t.stage.label.exposed),
  };

  return (
    <Animator combine manager="stagger">
      <main className="metrics study">
        <div>
          <Animator>
            <Animated as="h1" animated={['fade', ['y', 16, 0]]}>{text.title}</Animated>
          </Animator>
          <p className="notice">{st.byline(text.subtitle, observed)}</p>
        </div>

        <section className="section" aria-label={st.findings}>
          <p className="lead" data-testid="study-lead">
            {text.lead} <Rich text={st.leadRest} slots={slots} />
          </p>
          <div className="calm" data-testid="study-calm">
            <p>
              <Rich text={st.calmBroken} />
            </p>
            <p>
              <Rich text={st.calmTime} />
            </p>
            <p>
              <Rich text={st.calmFix} slots={slots} />
            </p>
          </div>
          <div className="counts">
            {STUDY_STAGES.map((stage) => (
              <Panel key={stage} className="count" corners>
                <div className="label">{t.stage.label[stage]}</div>
                <div className="value" data-testid={`count-${stage}`} style={{ color: `var(--stage-${stage})` }}>{s.counts[stage]}</div>
              </Panel>
            ))}
          </div>
          <div className="study-bar" data-testid="study-bar" role="img" aria-label={st.barAria(s.protectedShare)}>
            {STUDY_STAGES.map((stage) => (
              <div key={stage} className="seg" style={{ flex: s.counts[stage], background: `var(--stage-${stage})` }} title={`${t.stage.label[stage]}${t.report.sep}${s.counts[stage]}`} />
            ))}
          </div>
          <div className="legend">
            {STUDY_STAGES.map((stage) => (
              <span key={stage} title={t.stage.meaning[stage]}>
                <span className="swatch" style={{ background: `var(--stage-${stage})` }} />
                {t.stage.label[stage]}
              </span>
            ))}
            <span className="dim">{st.share(s.protectedShare)}</span>
          </div>
        </section>

        <section className="section" aria-labelledby="institutions-title">
          <h2 id="institutions-title">{st.institutions}</h2>
          <p className="notice">{st.institutionsNotice(s.total, observed)}</p>
          <div className="chips" role="group" aria-label={st.filter}>
            <button type="button" className="chip" aria-pressed={filter === 'all'} onClick={() => setFilter('all')}>{st.all(s.total)}</button>
            {STUDY_STAGES.map((stage) => (
              <button key={stage} type="button" className="chip" aria-pressed={filter === stage} onClick={() => setFilter(stage)} style={{ ['--chip' as string]: `var(--stage-${stage})` }}>
                {wordCase(t.stage.label[stage])} {s.counts[stage]}
              </button>
            ))}
          </div>
          <div className="table-wrap">
            <table className="table study-table">
              <thead>
                <tr>
                  <th>{st.colInstitution}</th>
                  <th>{st.colStage}</th>
                  <th>{st.colScore}</th>
                  <th className="optional">{st.colNext}</th>
                  <th>{st.colResult}</th>
                </tr>
              </thead>
              <tbody>
                {shown.map((r) => {
                  const stepId = STEP_BY_TITLE.get(r.nextStep);
                  const reportHref = r.id ? new URL(r.share).origin + localePath(locale, `/r/${r.id}`) : r.share;
                  return (
                    <tr key={r.domain} data-testid="institution-row">
                      <td>
                        <span data-testid="institution-name">{r.name}</span>
                        <span className="mono domain">{r.domain}</span>
                      </td>
                      <td className="answer" data-testid="institution-stage" style={{ color: `var(--stage-${r.stage})` }}>{t.stage.label[r.stage]}</td>
                      <td className="mono" data-testid="institution-score">{r.score ?? '\u2014'}</td>
                      <td className="optional dim" data-testid="institution-next">{r.error ? r.error : stepId ? t.report.steps[stepId].title : r.nextStep}</td>
                      <td className="links">
                        {r.id ? (
                          <>
                            <a href={reportHref} rel="noopener">{st.report}</a>
                            <a href={r.pdf} rel="noopener">{st.pdf}</a>
                          </>
                        ) : (
                          <span className="dim">{st.none}</span>
                        )}
                        <a href={localePath(locale, `/scan?host=${encodeURIComponent(r.domain)}`)} onClick={(e) => { e.preventDefault(); go(`/scan?host=${encodeURIComponent(r.domain)}`); }}>{st.testAgain}</a>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>

        <section className="section" aria-labelledby="method-title" data-testid="study-method">
          <h2 id="method-title">{st.method}</h2>
          <p>{text.population}</p>
          <p>
            <Rich text={st.methodTested} slots={slots} />
          </p>
          <p>
            <Rich text={st.methodRubric} />
          </p>
          <p>{st.corrections}</p>
        </section>

        {(meta.press ?? []).length > 0 && (
          <section className="section" aria-labelledby="press-title" data-testid="study-press">
            <h2 id="press-title">{st.press}</h2>
            <ul className="press-list">
              {meta.press!.map((p) => (
                <li key={p.url}>
                  <span className="mono dim">{longDate(p.date, locale)}</span>
                  <span className="press-outlet">{p.outlet}</span>
                  {/* The article's own title, in the language it was published in. */}
                  <a href={p.url} rel="noopener" lang="en">{p.title}</a>
                  <span className="mono dim press-kind">{p.kind === 'coverage' ? st.pressCoverage : p.kind === 'release' ? st.pressRelease : st.pressSyndication}</span>
                </li>
              ))}
            </ul>
          </section>
        )}

        <p className="cta">
          <a className="button" href={localePath(locale, '/')} onClick={(e) => { e.preventDefault(); go('/'); }}>{t.report.checkOwn}</a>
        </p>
      </main>
    </Animator>
  );
}
