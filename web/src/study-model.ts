// A study is a named population the maintainer scanned (scripts/study.ts). This module reads its
// results.csv and computes the figures the state-of-readiness note states, so the page and the
// press text never carry a number typed by hand. Pure: the worker (link previews) and the browser
// (the page) both import it; the CSV itself is bound in web/src/studies.ts.

import type { Stage } from '../../engine/assess';

export interface StudyRow {
  name: string;
  domain: string;
  stage: Stage;
  /** null when the scan did not finish. */
  score: number | null;
  nextStep: string;
  share: string;
  pdf: string;
  /** The share id, the last path segment of `share`; null when there is no result. */
  id: string | null;
  error: string;
}

export interface StudyMeta {
  slug: string;
  title: string;
  /** Under the title: the population and the quarter. */
  subtitle: string;
  /** The day the scans ran (results.csv is a point in time). */
  observedOn: string;
  /** How the population was chosen, one paragraph. */
  population: string;
  /** The one-sentence finding. Its numbers are checked against the CSV by a test. */
  lead: string;
  /** Where the study was written about or carried, newest first. Text links only. */
  press?: StudyPress[];
}

export interface StudyPress {
  date: string;
  outlet: string;
  /** coverage: someone wrote about it; release: our own words on the wire; syndication: the release carried by the outlet. */
  kind: 'coverage' | 'release' | 'syndication';
  title: string;
  url: string;
}

export const STUDY_META: Record<string, StudyMeta> = {
  'florida-financial-2026q4': {
    slug: 'florida-financial-2026q4',
    title: "Florida's banks and credit unions: state of quantum readiness",
    subtitle: '81 Florida-headquartered financial institutions, fourth quarter of 2026',
    observedOn: '2026-10-18',
    population:
      'Banks and credit unions headquartered in Florida, with two large Florida financial companies, chosen from public regulator lists and compiled by hand. Each institution is represented by its public primary domain, the one customers type; online-banking portals that live on a vendor\u2019s host were not tested. Every domain was verified (DNS and home-page title) before the scan; institutions that had merged, renamed or answered for another name were dropped and are listed in the study\u2019s source file.',
    lead: 'Of 81 Florida banks and credit unions, 54 already protect their customers\u2019 connections against future quantum decryption; 27 do not yet.',
    press: [
      { date: '2026-10-20', outlet: 'Quantum Zeitgeist', kind: 'coverage', title: 'Manteiga Foundation Scans Florida Banks for Quantum Readiness', url: 'https://quantumzeitgeist.com/manteiga-foundation-scans-florida-banks/' },
      { date: '2026-10-20', outlet: 'Yahoo Finance', kind: 'syndication', title: "One Third of Florida's Banks and Credit Unions Not Yet Protected Against Future Quantum Decryption", url: 'https://finance.yahoo.com/technology/ai/articles/one-third-floridas-banks-credit-125200422.html' },
      { date: '2026-10-20', outlet: 'Morningstar', kind: 'syndication', title: "One Third of Florida's Banks and Credit Unions Not Yet Protected Against Future Quantum Decryption", url: 'https://www.morningstar.com/news/pr-newswire/20261020ph75865/one-third-of-floridas-banks-and-credit-unions-not-yet-protected-against-future-quantum-decryption-open-source-scan-finds' },
      { date: '2026-10-20', outlet: 'PR Newswire', kind: 'release', title: "One Third of Florida's Banks and Credit Unions Not Yet Protected Against Future Quantum Decryption, Open-Source Scan Finds", url: 'https://www.prnewswire.com/news-releases/one-third-of-floridas-banks-and-credit-unions-not-yet-protected-against-future-quantum-decryption-open-source-scan-finds-302913890.html' },
    ],
  },
};

export const STUDY_STAGES = ['exposed', 'at-risk', 'protected', 'ready'] as const;
export type StudyStage = (typeof STUDY_STAGES)[number];

export interface StudySummary {
  /** Rows with a finished scan. */
  total: number;
  counts: Record<StudyStage, number>;
  /** Median score, lower middle for an even count; 0 with no rows. */
  median: number;
  protectedCount: number;
  notYetCount: number;
  /** Whole percent of total that is protected or ready. */
  protectedShare: number;
}

function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (quoted) {
      if (c === '"' && line[i + 1] === '"') {
        field += '"';
        i++;
      } else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') {
      out.push(field);
      field = '';
    } else field += c;
  }
  out.push(field);
  return out;
}

/** Reads results.csv (header `name,domain,stage,score,next_step,share,pdf,ms,error`), sorted by name. */
export function parseStudyCsv(text: string): StudyRow[] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim() && !l.startsWith('#'));
  if (lines.length === 0) return [];
  const header = splitCsvLine(lines[0]);
  const col = (name: string) => header.indexOf(name);
  const rows: StudyRow[] = [];
  for (const line of lines.slice(1)) {
    const f = splitCsvLine(line);
    const get = (name: string) => (col(name) >= 0 ? (f[col(name)] ?? '') : '');
    const share = get('share');
    const scoreText = get('score');
    const stage = (get('stage') || 'unreachable') as Stage;
    rows.push({
      name: get('name'),
      domain: get('domain'),
      stage,
      score: scoreText === '' ? null : Number(scoreText),
      nextStep: get('next_step'),
      share,
      pdf: get('pdf'),
      id: /\/r\/[A-Za-z0-9_-]{12}$/.test(share) ? share.slice(-12) : null,
      error: get('error'),
    });
  }
  return rows.sort((a, b) => a.name.localeCompare(b.name, 'en', { sensitivity: 'base' }));
}

export function summarize(rows: StudyRow[]): StudySummary {
  const done = rows.filter((r) => r.score !== null && (STUDY_STAGES as readonly string[]).includes(r.stage));
  const counts: Record<StudyStage, number> = { exposed: 0, 'at-risk': 0, protected: 0, ready: 0 };
  for (const r of done) counts[r.stage as StudyStage]++;
  const scores = done.map((r) => r.score as number).sort((a, b) => a - b);
  const median = scores.length ? scores[Math.floor((scores.length - 1) / 2)] : 0;
  const protectedCount = counts.protected + counts.ready;
  const total = done.length;
  return {
    total,
    counts,
    median,
    protectedCount,
    notYetCount: counts.exposed + counts['at-risk'],
    protectedShare: total ? Math.round((protectedCount / total) * 100) : 0,
  };
}

export interface StudyPreview {
  title: string;
  description: string;
  image: string;
  url: string;
}

/** The link preview of a study page; null for a slug that is not a study. */
export function studyPreview(slug: string, origin: string): StudyPreview | null {
  const meta = STUDY_META[slug];
  if (!meta) return null;
  return {
    title: `${meta.title} \u00b7 Quantum Ready Labs`,
    description: meta.lead,
    image: `${origin}/og/study-${slug}.png`,
    url: `${origin}/studies/${slug}`,
  };
}
