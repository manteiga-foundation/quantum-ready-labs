// The views' only door to data. Live: the edge's /api. Demo (?demo=<fixture>): recorded events
// replayed with short delays, so every view can be built and tested offline.

import type { ScanResult } from '../../engine/events';
import { demoMetrics, SCAN_FIXTURES, type MetricsData } from './fixtures';
import type { StreamEvent } from './report-model';

export function demoName(): string | null {
  const demo = new URLSearchParams(window.location.search).get('demo');
  return demo && demo in SCAN_FIXTURES ? demo : demo === '1' ? 'protected' : null;
}

export interface ScanHandle {
  cancel(): void;
}

const DEMO_DELAY_MS = 90;

export function startScan(host: string, onEvent: (e: StreamEvent) => void, onEnd: () => void): ScanHandle {
  const demo = demoName();
  if (demo) return replayFixture(demo, host, onEvent, onEnd);

  const controller = new AbortController();
  (async () => {
    try {
      const res = await fetch('/api/scan', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ host }),
        signal: controller.signal,
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        onEvent({ type: 'error', error: body.error ?? (res.status === 429 ? 'Too many scans right now. Try again in a moment.' : `The scan could not start (${res.status}).`) });
        return;
      }
      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        let nl: number;
        while ((nl = buffer.indexOf('\n')) !== -1) {
          const line = buffer.slice(0, nl).trim();
          buffer = buffer.slice(nl + 1);
          if (line) onEvent(JSON.parse(line) as StreamEvent);
        }
      }
    } catch (e) {
      if (!controller.signal.aborted) onEvent({ type: 'error', error: 'The connection to the scanner was lost.' });
    } finally {
      onEnd();
    }
  })();
  return { cancel: () => controller.abort() };
}

function replayFixture(name: string, host: string, onEvent: (e: StreamEvent) => void, onEnd: () => void): ScanHandle {
  const fixture = SCAN_FIXTURES[name];
  const alias = fixture.result.target.host;
  const rename = <T,>(v: T): T => JSON.parse(JSON.stringify(v).replaceAll(alias, host)) as T;
  const events: StreamEvent[] = [...fixture.events.map(rename), { type: 'result', result: rename(fixture.result) }, { type: 'saved', id: `demo-${name}` }];
  let i = 0;
  let timer: ReturnType<typeof setTimeout> | null = null;
  const step = () => {
    if (i >= events.length) {
      onEnd();
      return;
    }
    onEvent(events[i++]);
    timer = setTimeout(step, DEMO_DELAY_MS);
  };
  timer = setTimeout(step, DEMO_DELAY_MS);
  return {
    cancel: () => {
      if (timer) clearTimeout(timer);
    },
  };
}

export async function loadResult(id: string): Promise<{ result: ScanResult } | { error: string }> {
  if (id.startsWith('demo-')) {
    const fixture = SCAN_FIXTURES[id.slice(5)];
    return fixture ? { result: fixture.result } : { error: 'There is no such demo result.' };
  }
  const res = await fetch(`/api/result/${encodeURIComponent(id)}`);
  if (!res.ok) return { error: res.status === 404 ? 'This result has expired or never existed. Results are kept for 30 days.' : `The result could not be loaded (${res.status}).` };
  return { result: (await res.json()) as ScanResult };
}

export async function loadMetrics(): Promise<MetricsData | { error: string }> {
  if (new URLSearchParams(window.location.search).has('demo')) return demoMetrics();
  const res = await fetch('/api/metrics');
  if (!res.ok) return { error: `Metrics could not be loaded (${res.status}).` };
  return (await res.json()) as MetricsData;
}

export async function subscribe(email: string, host: string): Promise<boolean> {
  if (demoName()) return true;
  const res = await fetch('/api/subscribe', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email, host }) });
  return res.ok;
}
