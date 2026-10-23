import { describe, expect, test } from 'bun:test';
import { applyEvent, initialReport, type ReportState } from '../web/src/report-model';
import protectedFixture from '../web/src/fixtures/protected.json';
import exposedFixture from '../web/src/fixtures/exposed.json';
import type { ScanEvent } from '../engine/scan';

function replay(fixture: unknown): ReportState[] {
  const f = fixture as { events: unknown[]; result: unknown };
  // The engine's HTTP face appends the result after the events; fixtures store them apart.
  const events = [...(f.events as ScanEvent[]), { type: 'result', result: f.result } as never];
  const states: ReportState[] = [initialReport()];
  for (const e of events) states.push(applyEvent(states.at(-1)!, e));
  return states;
}

describe('report model: the live report built from the event stream', () => {
  test('before any event the ring is empty and the status is idle', () => {
    const s = initialReport();
    expect(s.status).toBe('idle');
    expect(s.assessment.score).toBe(0);
    expect(s.probes).toHaveLength(0);
  });

  test('replaying the protected fixture ends at the stage and score the engine computed', () => {
    const states = replay(protectedFixture);
    const last = states.at(-1)!;
    expect(last.status).toBe('done');
    expect(last.assessment.stage as string).toBe(protectedFixture.result.assessment.stage);
    expect(last.assessment.score).toBe(protectedFixture.result.assessment.score);
    expect(last.probes).toHaveLength(14);
  });

  test('the score climbs from worse to better: it never decreases while probes arrive', () => {
    for (const fixture of [protectedFixture, exposedFixture]) {
      const scores = replay(fixture).map((s) => s.assessment.score);
      for (let i = 1; i < scores.length; i++) expect(scores[i]).toBeGreaterThanOrEqual(scores[i - 1]);
      expect(scores[0]).toBe(0);
      expect(scores.at(-1)).toBe(fixture.result.assessment.score);
    }
  });

  test('a live partial picture never reads as inconclusive: TLS 1.3 yes with groups still untested is at risk', () => {
    const events = protectedFixture.events as ScanEvent[];
    let s = applyEvent(initialReport(), events[0]);
    s = applyEvent(s, events.find((e) => e.type === 'probe' && e.id === 'tls13')!);
    expect(s.assessment.stage).toBe('at-risk');
  });

  test('the stage word is live: exposed before TLS 1.3 answers, protected once the hybrid group answers yes', () => {
    const events = protectedFixture.events as ScanEvent[];
    let s = initialReport();
    s = applyEvent(s, events[0]); // start
    expect(s.status).toBe('scanning');
    const hybrid = events.find((e) => e.type === 'probe' && e.id === 'group:X25519MLKEM768')!;
    s = applyEvent(s, hybrid);
    expect(s.assessment.stage).toBe('protected');
  });

  test('the final result carries the chain and the connection, which probe events do not', () => {
    const last = replay(protectedFixture).at(-1)!;
    expect(last.result?.findings.chain.length).toBeGreaterThan(0);
    expect(last.assessment.certificate.chainLength).toBeGreaterThan(0);
  });

  test('an in-band error ends the report with the message', () => {
    const s = applyEvent(initialReport(), { type: 'error', error: 'refused' } as never);
    expect(s.status).toBe('error');
    expect(s.error).toBe('refused');
  });

  test('an error keeps its code and params, so the page can say it in the reader\'s language', () => {
    const s = applyEvent(initialReport(), { type: 'error', error: 'Port 8443 ...', code: 'port-not-allowed', params: { port: 8443, allowed: [443] } });
    expect(s.error).toBe('Port 8443 ...');
    expect(s.errorCode).toBe('port-not-allowed');
    expect(s.errorParams).toEqual({ port: 8443, allowed: [443] });
    expect(applyEvent(initialReport(), { type: 'error', error: 'plain' })).toMatchObject({ errorCode: null, errorParams: {} });
  });
});
