import { useEffect, useReducer, useRef, useState } from 'react';
import { loadResult, startScan, type ScanHandle } from './api';
import { applyEvent, initialReport, reportFromResult, type ReportState, type StreamEvent } from './report-model';
import { FaBalanceScale, FaChartBar, FaGithub, FaPlug } from 'react-icons/fa';
import { Api } from './views/Api';
import { Entry } from './views/Entry';
import { Metrics } from './views/Metrics';
import { Report } from './views/Report';
import { Study, StudyIndex } from './views/Study';
import { STUDY_META } from './study-model';

type Route =
  | { view: 'entry' }
  | { view: 'scan'; host: string }
  | { view: 'shared'; id: string }
  | { view: 'metrics' }
  | { view: 'api' }
  | { view: 'studies' }
  | { view: 'study'; slug: string };

function routeFromLocation(): Route {
  const { pathname, search } = window.location;
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
  const [report, dispatch] = useReducer(reducer, undefined, initialReport);
  const handle = useRef<ScanHandle | null>(null);

  useEffect(() => {
    const onPop = () => setRoute(routeFromLocation());
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
        if ('error' in r) dispatch({ type: 'error', error: r.error });
        else dispatch({ type: 'load', state: reportFromResult(r.result, route.id) });
      });
    }
    return () => handle.current?.cancel();
  }, [route]);

  useEffect(() => {
    if (import.meta.env.DEV) (window as unknown as { __qrl: () => ReportState }).__qrl = () => report;
  }, [report]);

  const go = (path: string) => {
    window.history.pushState({}, '', keepDemo(path));
    setRoute(routeFromLocation());
    window.scrollTo(0, 0);
  };

  useEffect(() => {
    const host = report.host;
    const stage = report.assessment.stage;
    if (route.view === 'entry') document.title = 'Quantum Ready Labs: is your host ready for the quantum era?';
    else if (route.view === 'metrics') document.title = 'Metrics · Quantum Ready Labs';
    else if (route.view === 'api') document.title = 'API · Quantum Ready Labs';
    else if (route.view === 'studies') document.title = 'Studies · Quantum Ready Labs';
    else if (route.view === 'study') document.title = `${STUDY_META[route.slug]?.title ?? 'No such study'} · Quantum Ready Labs`;
    else if (host && report.status === 'done') document.title = `${host}: ${stage.replace('-', ' ')} · Quantum Ready Labs`;
    else if (host) document.title = `Testing ${host} · Quantum Ready Labs`;
  }, [route, report.host, report.status, report.assessment.stage]);

  return (
    <div className="shell">
      <header className="topbar">
        <div className="brand-block">
          <a className="brand" href="/" onClick={(e) => { e.preventDefault(); go('/'); }}>
            <span className="mark" aria-hidden="true" />
            Quantum Ready Labs
          </a>
          <a className="byline" data-testid="byline" href="https://manteiga.org" rel="noopener">
            By Manteiga Foundation
          </a>
        </div>
        <nav aria-label="Site">
          <a href="https://github.com/manteiga-foundation/quantum-ready-labs" rel="noopener">
            <FaGithub aria-hidden="true" />
            Source
          </a>
          <a href="https://github.com/manteiga-foundation/quantum-ready-labs/blob/main/docs/scoring.md" rel="noopener">
            <FaBalanceScale aria-hidden="true" />
            How we score
          </a>
          <a href="/studies" onClick={(e) => { e.preventDefault(); go('/studies'); }}>
            <FaChartBar aria-hidden="true" />
            Studies
          </a>
          <a href="/api" onClick={(e) => { e.preventDefault(); go('/api'); }}>
            <FaPlug aria-hidden="true" />
            API
          </a>
        </nav>
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
        <p>Quantum Ready Labs tests the key exchange, protocol versions and certificate chain a host negotiates, and explains where it stands on the post-quantum transition. It is not a general TLS audit.</p>
        <p>
          Open source under the MIT licence. A <a href="https://manteiga.org" rel="noopener">Manteiga Foundation</a> project. <a href="/api">API</a> for scripts, services and agents. Abuse or questions: hello@manteiga.org
        </p>
      </footer>
    </div>
  );
}
