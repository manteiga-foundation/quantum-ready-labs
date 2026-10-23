import { describe, expect, test } from 'bun:test';
import { parseStudyCsv, STUDY_META, studyPreview, studyText, summarize, type StudyRow } from '../web/src/study-model';
import { LOCALES } from '../web/src/i18n/locales';

// The state-of-readiness note reads a study's results.csv as written by scripts/study.ts. The
// figures the note states (counts per stage, the median, the share protected) are computed here,
// never typed by hand, so the page and the press text cannot drift from the data.

const florida = await Bun.file('studies/florida-financial-2026q4/results.csv').text();

describe('parseStudyCsv', () => {
  test('reads every institution with its stage, score, next step and links', () => {
    const rows = parseStudyCsv(florida);
    expect(rows.length).toBe(81);
    const south = rows.find((r) => r.domain === 'southstatebank.com')!;
    expect(south.name).toBe('SouthState Bank');
    expect(south.stage).toBe('exposed');
    expect(south.score).toBe(29);
    expect(south.nextStep).toBe('Enable TLS 1.3');
    expect(south.share).toMatch(/^https:\/\/quantumreadylabs\.com\/r\/[A-Za-z0-9_-]{12}$/);
    expect(south.id).toBe(south.share.slice(-12));
    expect(south.pdf).toBe(`https://quantumreadylabs.com/api/report/${south.id}.pdf`);
  });

  test('handles quoted fields with commas and sorts by name, case-insensitive', () => {
    const rows = parseStudyCsv('name,domain,stage,score,next_step,share,pdf,ms,error\n"Zeta, Inc.",zeta.example,ready,95,Keep it up,https://x/r/aaaaaaaaaaaa,https://x/api/report/aaaaaaaaaaaa.pdf,10,\nalpha,alpha.example,exposed,19,Enable TLS 1.3,https://x/r/bbbbbbbbbbbb,https://x/api/report/bbbbbbbbbbbb.pdf,10,\n');
    expect(rows.map((r) => r.name)).toEqual(['alpha', 'Zeta, Inc.']);
  });

  test('a row the scan could not finish is kept with its error and no links', () => {
    const rows = parseStudyCsv('name,domain,stage,score,next_step,share,pdf,ms,error\nGone,gone.example,,,,,,,No TLS server answered\n');
    expect(rows[0].stage).toBe('unreachable');
    expect(rows[0].error).toBe('No TLS server answered');
    expect(rows[0].id).toBeNull();
  });
});

describe('summarize', () => {
  test('the Florida figures: 81 institutions, 10 / 17 / 30 / 24, median 85, two thirds protected', () => {
    const s = summarize(parseStudyCsv(florida));
    expect(s.total).toBe(81);
    expect(s.counts).toEqual({ exposed: 10, 'at-risk': 17, protected: 30, ready: 24 });
    expect(s.median).toBe(85);
    expect(s.protectedCount).toBe(54);
    expect(s.notYetCount).toBe(27);
    expect(s.protectedShare).toBe(67);
  });

  test('an even count takes the lower middle score, and unfinished rows do not count', () => {
    const row = (score: number | null, stage: StudyRow['stage']): StudyRow => ({ name: 'x', domain: 'x', stage, score, nextStep: '', share: '', pdf: '', id: null, error: '' });
    const s = summarize([row(90, 'ready'), row(40, 'at-risk'), row(60, 'protected'), row(20, 'exposed'), row(null, 'unreachable')]);
    expect(s.total).toBe(4);
    expect(s.median).toBe(40);
  });
});

describe('the registry and its link preview', () => {
  test('the Florida study is registered with an observation date and a title', () => {
    const meta = STUDY_META['florida-financial-2026q4'];
    expect(meta.observedOn).toBe('2026-10-18');
    expect(meta.title).toMatch(/Florida/);
  });

  test('the lead sentence states the figures summarize() computes from the CSV (no drift)', () => {
    const s = summarize(parseStudyCsv(florida));
    const lead = STUDY_META['florida-financial-2026q4'].lead;
    for (const n of [s.total, s.protectedCount, s.notYetCount]) expect(lead).toContain(String(n));
  });

  test('studyPreview gives a title, a description with the figures, the image and the canonical URL', () => {
    const p = studyPreview('florida-financial-2026q4', 'https://quantumreadylabs.com');
    expect(p).not.toBeNull();
    expect(p!.title).toMatch(/Florida/);
    expect(p!.description).toMatch(/81/);
    expect(p!.image).toBe('https://quantumreadylabs.com/og/study-florida-financial-2026q4.png');
    expect(p!.url).toBe('https://quantumreadylabs.com/studies/florida-financial-2026q4');
    expect(studyPreview('nope', 'https://quantumreadylabs.com')).toBeNull();
  });

  test('every language states the same figures in its lead, so no translation drifts from the CSV', () => {
    const s = summarize(parseStudyCsv(florida));
    const meta = STUDY_META['florida-financial-2026q4'];
    for (const locale of LOCALES) {
      const text = studyText(meta, locale);
      for (const n of [s.total, s.protectedCount, s.notYetCount]) expect({ locale, has: text.lead.includes(String(n)) }).toEqual({ locale, has: true });
      for (const n of [s.total]) expect({ locale, has: text.subtitle.includes(String(n)) }).toEqual({ locale, has: true });
      if (locale !== 'en') expect({ locale, translated: text.lead !== meta.lead && text.population !== meta.population }).toEqual({ locale, translated: true });
    }
    expect(studyText(meta, 'en')).toEqual({ title: meta.title, subtitle: meta.subtitle, population: meta.population, lead: meta.lead });
  });

  test('a study page in another language previews in that language, at its own address', () => {
    const p = studyPreview('florida-financial-2026q4', 'https://quantumreadylabs.com', 'es');
    expect(p!.title).toMatch(/^Bancos y cooperativas de crédito de Florida/);
    expect(p!.description).toMatch(/^De 81 bancos/);
    expect(p!.url).toBe('https://quantumreadylabs.com/es/studies/florida-financial-2026q4');
  });
});
