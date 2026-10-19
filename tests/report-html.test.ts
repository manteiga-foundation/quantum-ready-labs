import { describe, expect, test } from 'bun:test';
import { renderReportHtml, REPORT_PAGES } from '../engine/report-html';
import protectedFixture from '../web/src/fixtures/protected.json';
import exposedFixture from '../web/src/fixtures/exposed.json';
import type { ScanResult } from '../engine/events';

const when = new Date('2026-10-18T12:00:00Z');

describe('the PDF report HTML (medet.ink-inspired landscape pages)', () => {
  test('renders one slide per page with the host, the stage word and the page indicators', () => {
    const html = renderReportHtml(protectedFixture.result as unknown as ScanResult, { generatedAt: when, shareUrl: 'https://quantumreadylabs.com/r/abc' });
    expect((html.match(/class="slide/g) ?? []).length).toBe(REPORT_PAGES);
    expect(html).toContain('protected.example');
    expect(html).toContain('PROTECTED');
    expect(html).toContain(`1 <span class="page-total">/ ${REPORT_PAGES}</span>`);
    expect(html).toContain(`${REPORT_PAGES} <span class="page-total">/ ${REPORT_PAGES}</span>`);
    expect(html).toContain('@page');
    expect(html).toContain('size: 11in 8.5in');
    expect(html).toContain('https://quantumreadylabs.com/r/abc');
  });

  test('the probe matrix has fourteen rows and the chain every link, derived from the stored result alone', () => {
    const html = renderReportHtml(protectedFixture.result as unknown as ScanResult, { generatedAt: when, shareUrl: null });
    expect((html.match(/data-probe=/g) ?? []).length).toBe(14);
    expect((html.match(/data-chain-link=/g) ?? []).length).toBe(protectedFixture.result.findings.chain.length);
  });

  test('says the verdict and the one next step, and never leaks placeholders', () => {
    for (const fixture of [protectedFixture, exposedFixture]) {
      const result = fixture.result as unknown as ScanResult;
      const html = renderReportHtml(result, { generatedAt: when, shareUrl: null });
      expect(html).toContain(result.assessment.verdict);
      expect(html).toContain(result.assessment.nextStep.title);
      expect(html).not.toMatch(/undefined|NaN|\[object|null,/);
    }
  });

  test('accepting RSA key transport reads as a warning, refusing it as good', () => {
    const html = renderReportHtml(protectedFixture.result as unknown as ScanResult, { generatedAt: when, shareUrl: null });
    expect(html).toMatch(/data-probe="TLS 1.2 RSA key transport">.*?class="answer warn">Still accepted/s);
  });

  test('escapes what comes from the network (host names, certificate subjects)', () => {
    const result = JSON.parse(JSON.stringify(protectedFixture.result)) as ScanResult;
    result.findings.chain[0].subject = '<script>alert(1)</script>';
    const html = renderReportHtml(result, { generatedAt: when, shareUrl: null });
    expect(html).not.toContain('<script>alert(1)');
    expect(html).toContain('&lt;script&gt;');
  });

  test('uses only the bundled fonts, so the render is the same on every machine', () => {
    const html = renderReportHtml(protectedFixture.result as unknown as ScanResult, { generatedAt: when, shareUrl: null, fontBase: '/fonts' });
    expect(html).not.toContain('fonts.googleapis.com');
    expect(html).toContain("url('/fonts/");
  });
});
