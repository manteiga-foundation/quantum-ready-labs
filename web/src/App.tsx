import { useEffect, useReducer, useRef, useState } from 'react';
import { loadResult, startScan, type ScanHandle } from './api';
import { applyEvent, initialReport, reportFromResult, type ReportState, type StreamEvent } from './report-model';
import { FaBalanceScale, FaChartBar, FaGithub, FaPlug } from 'react-icons/fa';
import { Api } from './views/Api';
import { Entry } from './views/Entry';
import { Metrics } from './views/Metrics';
import { Report } from './views/Report';
import { Study, StudyIndex } from './views/Study';
import { STUDY_META, studyText } from './study-model';
import { HTML_LANG, LOCALE_NAME, LOCALES, localePath, splitPath, STORAGE_KEY, type Locale } from './i18n/locales';
import { MESSAGES } from './i18n/messages';
import { I18nProvider, Rich } from './i18n/react';

type Route =
  | { view: 'entry' }
  | { view: 'scan'; host: string }
  | { view: 'shared'; id: string }
  | { view: 'metrics' }
  | { view: 'api' }
  | { view: 'studies' }
  | { view: 'study'; slug: string };

/** The view, read from the path without its language prefix. */
function routeFromLocation(): Route {
  const { search } = window.location;
  const pathname = splitPath(window.location.pathname).rest;
  if (pathname === '/metrics') return { view: 'metrics' };
  if (pathname === '/api') return { view: 'api' };
  if (pathname === '/studies' || pathname === '/studies/') return { view: 'studies' };
  const study = pathname.match(/^\/studies\/([a-z0-9-]+)$/);
  if (study) return { view: 'study', slug: study[1] };
  const shared = pathname.match(/^\/r\/([A-Za-z0-9_-]+)$/);
  if (shared) return { view: 'shared', id: shared[1] };
  const host = new URLSearchParams(search).get('host');
  if (pathname === '/scan' && host) return { view: 'scan', host };
  return { view: 'entry' };
}

function localeFromLocation(): Locale {
  return splitPath(window.location.pathname).locale;
}

function keepDemo(path: string): string {
  const demo = new URLSearchParams(window.location.search).get('demo');
  if (!demo) return path;
  return path + (path.includes('?') ? '&' : '?') + 'demo=' + encodeURIComponent(demo);
}

function reducer(state: ReportState, event: StreamEvent | { type: 'reset' } | { type: 'load'; state: ReportState }): ReportState {
  if (event.type === 'reset') return initialReport();
  if (event.type === 'load') return event.state;
  return applyEvent(state, event);
}

export function App() {
  const [route, setRoute] = useState<Route>(routeFromLocation);
  const [locale, setLocale] = useState<Locale>(localeFromLocation);
  const [report, dispatch] = useReducer(reducer, undefined, initialReport);
  const handle = useRef<ScanHandle | null>(null);
  const t = MESSAGES[locale];
  // The scan restarts when the view changes, never when only the language does.
  const routeKey = JSON.stringify(route);

  useEffect(() => {
    const onPop = () => {
      setRoute(routeFromLocation());
      setLocale(localeFromLocation());
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  useEffect(() => {
    handle.current?.cancel();
    handle.current = null;
    if (route.view === 'scan') {
      dispatch({ type: 'reset' });
      handle.current = startScan(route.host, (e) => dispatch(e), () => {});
    } else if (route.view === 'shared') {
      dispatch({ type: 'reset' });
      loadResult(route.id).then((r) => {
        if ('error' in r) dispatch({ type: 'error', error: r.error, code: r.code, params: r.params });
        else dispatch({ type: 'load', state: reportFromResult(r.result, route.id) });
      });
    }
    return () => handle.current?.cancel();
  }, [routeKey]);

  useEffect(() => {
    if (import.meta.env.DEV) (window as unknown as { __qrl: () => ReportState }).__qrl = () => report;
  }, [report]);

  useEffect(() => {
    document.documentElement.lang = HTML_LANG[locale];
  }, [locale]);

  /** Navigates within the current language: the views pass unprefixed paths. */
  const go = (path: string) => {
    window.history.pushState({}, '', keepDemo(localePath(locale, path)));
    setRoute(routeFromLocation());
    window.scrollTo(0, 0);
  };

  /** The selector: the same page in another language, remembered for the next visit. */
  const switchLocale = (next: Locale) => {
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // storage unavailable: the choice holds for this page only
    }
    const { pathname, search, hash } = window.location;
    window.history.pushState({}, '', localePath(next, pathname + search) + hash);
    setLocale(next);
  };

  useEffect(() => {
    const host = report.host;
    const stage = report.assessment.stage;
    const suffix = ' · Quantum Ready Labs';
    if (route.view === 'entry') document.title = t.meta.title;
    else if (route.view === 'metrics') document.title = t.titles.metrics + suffix;
    else if (route.view === 'api') document.title = t.titles.api + suffix;
    else if (route.view === 'studies') document.title = t.titles.studies + suffix;
    else if (route.view === 'study') document.title = (STUDY_META[route.slug] ? studyText(STUDY_META[route.slug], locale).title : t.titles.noStudy) + suffix;
    else if (host && report.status === 'done') document.title = t.titles.done(host, t.stage.label[stage]) + suffix;
    else if (host) document.title = t.titles.testing(host) + suffix;
  }, [route, t, report.host, report.status, report.assessment.stage]);

  return (
    <I18nProvider locale={locale}>
      <div className="shell">
        <header className="topbar">
          <div className="brand-block">
            <a className="brand" href={localePath(locale, '/')} onClick={(e) => { e.preventDefault(); go('/'); }}>
              <span className="mark" aria-hidden="true" />
              Quantum Ready Labs
            </a>
            <a className="byline" data-testid="byline" href="https://manteiga.org" rel="noopener">
              {t.shell.byline}
            </a>
          </div>
          <div className="topbar-end">
            <nav aria-label="Site">
              <a href="https://github.com/manteiga-foundation/quantum-ready-labs" rel="noopener">
                <FaGithub aria-hidden="true" />
                {t.shell.source}
              </a>
              <a href="https://github.com/manteiga-foundation/quantum-ready-labs/blob/main/docs/scoring.md" rel="noopener">
                <FaBalanceScale aria-hidden="true" />
                {t.shell.howWeScore}
              </a>
              <a href={localePath(locale, '/studies')} onClick={(e) => { e.preventDefault(); go('/studies'); }}>
                <FaChartBar aria-hidden="true" />
                {t.shell.studies}
              </a>
              <a href={localePath(locale, '/api')} onClick={(e) => { e.preventDefault(); go('/api'); }}>
                <FaPlug aria-hidden="true" />
                {t.shell.api}
              </a>
            </nav>
            <select className="lang-select" aria-label={t.shell.language} value={locale} onChange={(e) => switchLocale(e.target.value as Locale)}>
              {LOCALES.map((l) => (
                <option key={l} value={l} lang={HTML_LANG[l]}>
                  {LOCALE_NAME[l]}
                </option>
              ))}
            </select>
          </div>
        </header>
        <div className="content">
          {route.view === 'entry' && <Entry onScan={(host) => go(`/scan?host=${encodeURIComponent(host)}`)} />}
          {route.view === 'scan' && <Report state={report} shared={false} onAnother={() => go('/')} />}
          {route.view === 'shared' && <Report state={report} shared onAnother={() => go('/')} />}
          {route.view === 'metrics' && <Metrics />}
          {route.view === 'api' && <Api />}
          {route.view === 'studies' && <StudyIndex go={go} />}
          {route.view === 'study' && <Study key={route.slug} slug={route.slug} go={go} />}
        </div>
        <footer className="footer">
          <p>{t.shell.footerScope}</p>
          <p>
            <Rich text={t.shell.footerLicense} />
          </p>
        </footer>
      </div>
    </I18nProvider>
  );
}
