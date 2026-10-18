// Emulated data for the views: recorded scans (neutral host names) and a derived "ready" case.
// Everything the views can show is exercised here before any backend is wired.

import { assess, type Findings } from '../../engine/assess';
import type { ScanEvent, ScanResult } from '../../engine/events';
import exposed from './fixtures/exposed.json';
import atRisk from './fixtures/at-risk.json';
import protectedHost from './fixtures/protected.json';

export interface ScanFixture {
  events: ScanEvent[];
  result: ScanResult;
}

function readyFromProtected(): ScanFixture {
  const base = protectedHost as unknown as ScanFixture;
  const findings: Findings = JSON.parse(JSON.stringify(base.result.findings));
  findings.rsaKeyTransport = false;
  const events = (JSON.parse(JSON.stringify(base.events)) as ScanEvent[]).map((e) => {
    if (e.type === 'probe' && e.id === 'rsa-transport') return { ...e, answer: 'no' as const, detail: 'alert 40' };
    return e;
  });
  const result: ScanResult = { ...base.result, findings, assessment: assess(findings), target: { ...base.result.target, host: 'ready.example' } };
  const text = JSON.stringify({ events, result }).replaceAll('protected.example', 'ready.example');
  return JSON.parse(text) as ScanFixture;
}

export const SCAN_FIXTURES: Record<string, ScanFixture> = {
  exposed: exposed as unknown as ScanFixture,
  'at-risk': atRisk as unknown as ScanFixture,
  protected: protectedHost as unknown as ScanFixture,
  ready: readyFromProtected(),
};

export const FIXTURE_NAMES = Object.keys(SCAN_FIXTURES);

/** The metrics the private view shows, generated deterministically for 30 days. */
export interface MetricsData {
  generatedAt: string;
  totals: { scans: number; hosts: number; cacheHits: number; sharedOpens: number; failures: number };
  days: { date: string; scans: number; hosts: number; stages: Record<string, number>; failures: number; p50: number; p95: number }[];
  failures: { reason: string; count: number }[];
  referrers: { source: string; count: number }[];
  countries: { country: string; count: number }[];
  signals: { label: string; detail: string }[];
}

export function demoMetrics(now = new Date('2026-10-18T12:00:00Z')): MetricsData {
  let seed = 7;
  const rand = () => {
    seed = (seed * 9301 + 49297) % 233280;
    return seed / 233280;
  };
  const days: MetricsData['days'] = [];
  for (let i = 29; i >= 0; i--) {
    const date = new Date(now.getTime() - i * 86400_000).toISOString().slice(0, 10);
    const growth = 1 + (29 - i) / 12;
    const scans = Math.round((40 + rand() * 60) * growth);
    const hosts = Math.round(scans * (0.55 + rand() * 0.2));
    const failures = Math.round(scans * (0.03 + rand() * 0.04));
    const ok = scans - failures;
    const protectedShare = 0.28 + (29 - i) * 0.004;
    const exposedShare = 0.12 - (29 - i) * 0.001;
    const readyShare = 0.05 + (29 - i) * 0.001;
    const stages = {
      exposed: Math.round(ok * exposedShare),
      'at-risk': 0,
      protected: Math.round(ok * protectedShare),
      ready: Math.round(ok * readyShare),
    };
    stages['at-risk'] = ok - stages.exposed - stages.protected - stages.ready;
    days.push({ date, scans, hosts, stages, failures, p50: Math.round(180 + rand() * 90), p95: Math.round(600 + rand() * 500) });
  }
  const totals = days.reduce(
    (t, d) => ({ scans: t.scans + d.scans, hosts: t.hosts + d.hosts, cacheHits: t.cacheHits + Math.round(d.scans * 0.3), sharedOpens: t.sharedOpens + Math.round(d.scans * 0.18), failures: t.failures + d.failures }),
    { scans: 0, hosts: 0, cacheHits: 0, sharedOpens: 0, failures: 0 },
  );
  return {
    generatedAt: now.toISOString(),
    totals,
    days,
    failures: [
      { reason: 'Host does not resolve', count: Math.round(totals.failures * 0.46) },
      { reason: 'Connection timed out', count: Math.round(totals.failures * 0.27) },
      { reason: 'Refused: not a public address', count: Math.round(totals.failures * 0.17) },
      { reason: 'Port closed', count: Math.round(totals.failures * 0.1) },
    ],
    referrers: [
      { source: 'Direct', count: Math.round(totals.scans * 0.41) },
      { source: 'linkedin.com', count: Math.round(totals.scans * 0.24) },
      { source: 'Search', count: Math.round(totals.scans * 0.2) },
      { source: 'github.com', count: Math.round(totals.scans * 0.09) },
      { source: 'Other', count: Math.round(totals.scans * 0.06) },
    ],
    countries: [
      { country: 'United States', count: Math.round(totals.scans * 0.38) },
      { country: 'Germany', count: Math.round(totals.scans * 0.13) },
      { country: 'United Kingdom', count: Math.round(totals.scans * 0.11) },
      { country: 'Brazil', count: Math.round(totals.scans * 0.09) },
      { country: 'Other', count: Math.round(totals.scans * 0.29) },
    ],
    signals: [
      { label: 'Probe disagreement', detail: '3 hosts answered the hybrid probe but a real connection negotiated x25519 (server preference). Worth a note in the report.' },
      { label: 'Ports requested', detail: '8443 asked 41 times, 993 asked 12 times, 22 asked 9 times. Demand for the next allowlist.' },
      { label: 'Flaky hosts', detail: '7 hosts timed out once and answered on retry; all behind the same CDN.' },
    ],
  };
}
