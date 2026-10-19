import { describe, expect, test } from 'bun:test';
import { banner, colorMode, plain, renderReport, summary } from '../engine/terminal';
import type { ScanResult } from '../engine/events';
import protectedFixture from '../web/src/fixtures/protected.json';
import exposedFixture from '../web/src/fixtures/exposed.json';
import atRiskFixture from '../web/src/fixtures/at-risk.json';

// The terminal renderer: what `bun run scan` prints. Pure text in, so the tests read it as a
// reader would; colours are a mode and strip cleanly.

const protectedR = protectedFixture.result as unknown as ScanResult;
const exposedR = exposedFixture.result as unknown as ScanResult;
const atRiskR = atRiskFixture.result as unknown as ScanResult;
const wide = { mode: 'none' as const, columns: 120 };

describe('colour mode', () => {
  test('follows NO_COLOR, the TTY and COLORTERM', () => {
    expect(colorMode({ NO_COLOR: '1', COLORTERM: 'truecolor' }, true)).toBe('none');
    expect(colorMode({}, false)).toBe('none');
    expect(colorMode({ COLORTERM: 'truecolor' }, true)).toBe('truecolor');
    expect(colorMode({}, true)).toBe('256');
    expect(colorMode({ FORCE_COLOR: '3' }, false)).toBe('truecolor');
  });
});

describe('the banner', () => {
  test('is block letters when the terminal is wide, one line when it is not, with the version', () => {
    const big = banner('0.1.0', wide);
    expect(big.split('\n').length).toBeGreaterThan(6);
    expect(big).toContain('POST-QUANTUM READINESS');
    expect(big).toContain('v0.1.0');
    const small = banner('0.1.0', { mode: 'none', columns: 40 });
    expect(small).toContain('Q R E A D Y');
    expect(small.split('\n').length).toBeLessThan(6);
  });

  test('colours strip back to the plain text', () => {
    const coloured = banner('0.1.0', { mode: 'truecolor', columns: 120 });
    expect(coloured).toContain('\x1b[');
    expect(plain(coloured)).toBe(banner('0.1.0', wide));
  });
});

describe('a report', () => {
  test('leads with the host, the stage word and the score, then the verdict and the one next step', () => {
    const out = renderReport(protectedR, wide);
    const lines = out.split('\n').map((l) => l.trimEnd());
    const head = lines.find((l) => l.includes('protected.example'))!;
    expect(head).toMatch(/PROTECTED/);
    expect(head).toMatch(/85 \/ 100/);
    expect(out).toContain(protectedR.assessment.verdict);
    expect(out).toContain('Next step');
    expect(out).toContain(protectedR.assessment.nextStep.title);
  });

  test('has the three cards in order and the probes as a grid, RSA key transport read as the warning it is', () => {
    const out = renderReport(atRiskR, wide);
    const i = (s: string) => out.indexOf(s);
    expect(i('Key exchange')).toBeGreaterThan(-1);
    expect(i('Key exchange')).toBeLessThan(i('Certificate'));
    expect(i('Certificate')).toBeLessThan(i('Foundations'));
    expect(i('Foundations')).toBeLessThan(i('Probes'));
    expect(out).toMatch(/Foundations\s+\d of 5 in place/);
    expect(out).toContain('X25519MLKEM768');
    expect(out).toMatch(/RSA key transport\s+still accepted/);
  });

  test('the chain and the score breakdown appear only with --verbose', () => {
    const quiet = renderReport(protectedR, wide);
    const verbose = renderReport(protectedR, { ...wide, verbose: true });
    expect(quiet).not.toContain('Score breakdown');
    expect(verbose).toContain('Score breakdown');
    expect(verbose).toMatch(/Key exchange\s+60 \/ 60/);
    expect(verbose).toContain(protectedR.findings.chain[1].subject);
  });

  test('an exposed host says so in the stage word and the next step', () => {
    const out = renderReport(exposedR, wide);
    expect(out).toContain('EXPOSED');
    expect(out).toContain('Enable TLS 1.3');
  });

  test('fits 80 columns without a line running over', () => {
    const out = renderReport(atRiskR, { mode: 'none', columns: 80, verbose: true });
    for (const line of out.split('\n')) expect(line.length, line).toBeLessThanOrEqual(80);
  });

  test('a share link is shown when given', () => {
    const out = renderReport(protectedR, { ...wide, share: { url: 'https://quantumreadylabs.com/r/abc', pdf: 'https://quantumreadylabs.com/api/report/abc.pdf' } });
    expect(out).toContain('quantumreadylabs.com/r/abc');
    expect(out).toContain('abc.pdf');
  });
});

describe('the summary', () => {
  test('is one line per host, worst first, with a count by stage', () => {
    const out = summary([protectedR, exposedR, atRiskR], wide);
    const lines = out.split('\n').filter((l) => /example/.test(l));
    expect(lines.length).toBe(3);
    expect(lines[0]).toContain('EXPOSED');
    expect(lines[2]).toContain('PROTECTED');
    expect(out).toMatch(/1 exposed/);
    expect(out).toMatch(/1 protected/);
  });
});
