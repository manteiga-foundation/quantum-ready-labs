import { describe, expect, test } from 'bun:test';
import { renderLetterHtml, renderLettersHtml, type Letter } from '../engine/letter-html';
import type { ScanResult } from '../engine/events';
import exposedFixture from '../web/src/fixtures/exposed.json';
import atRiskFixture from '../web/src/fixtures/at-risk.json';

// The one-page letter to an institution's information security officer: portrait Letter, one
// page per institution, the result as a card, the one next step, the link and a QR code. Pure.

const when = new Date('2026-10-18T12:00:00Z');
const exposed = exposedFixture.result as unknown as ScanResult;
const atRisk = atRiskFixture.result as unknown as ScanResult;

const letter: Letter = {
  result: exposed,
  institution: 'Example Bank & Trust',
  attention: 'Information Security Officer',
  shareUrl: 'https://quantumreadylabs.com/r/abc',
  population: { name: 'Florida-headquartered banks and credit unions', size: 81, ready: 24, median: 85 },
};

describe('the letter', () => {
  test('is one portrait Letter page with the institution, the stage, the next step, the link and a QR code', async () => {
    const html = await renderLetterHtml(letter, { generatedAt: when, signer: { name: 'A. Signer', title: 'Manteiga Foundation' } });
    expect((html.match(/class="page/g) ?? []).length).toBe(1);
    expect(html).toContain('size: 8.5in 11in');
    expect(html).toContain('Example Bank &amp; Trust');
    expect(html).toContain('Attention: Information Security Officer');
    expect(html).toContain('exposed.example');
    expect(html).toContain('EXPOSED');
    expect(html).toContain(exposed.assessment.nextStep.title);
    expect(html).toContain('https://quantumreadylabs.com/r/abc');
    expect(html).toContain('<svg'); // the QR code and the ring
    expect(html).toContain('18 October 2026');
    expect(html).toContain('81');
    expect(html).toContain('A. Signer');
  });

  test('a batch is one document with one page per letter, in order', async () => {
    const html = await renderLettersHtml([letter, { ...letter, result: atRisk, institution: 'Second Credit Union', shareUrl: null }], { generatedAt: when, signer: { name: 'A. Signer', title: 'Manteiga Foundation' } });
    expect((html.match(/class="page/g) ?? []).length).toBe(2);
    expect(html.indexOf('Example Bank')).toBeLessThan(html.indexOf('Second Credit Union'));
    expect(html).toContain('AT RISK');
  });

  test('escapes what comes from the list', async () => {
    const html = await renderLetterHtml({ ...letter, institution: '<script>alert(1)</script>' }, { generatedAt: when, signer: { name: 'x', title: 'y' } });
    expect(html).not.toContain('<script>alert');
    expect(html).toContain('&lt;script&gt;');
  });
});
