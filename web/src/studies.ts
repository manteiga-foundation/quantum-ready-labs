// The studies the site publishes: the pure registry (web/src/study-model.ts) joined with each
// study's results.csv, bound at build time so the page and the repository share one file.
import floridaCsv from '../../studies/florida-financial-2026q4/results.csv?raw';
import { parseStudyCsv, STUDY_META, type StudyMeta, type StudyRow } from './study-model';

const CSV: Record<string, string> = {
  'florida-financial-2026q4': floridaCsv,
};

export interface Study {
  meta: StudyMeta;
  rows: StudyRow[];
}

export function studyFor(slug: string): Study | null {
  const meta = STUDY_META[slug];
  const csv = CSV[slug];
  if (!meta || csv === undefined) return null;
  return { meta, rows: parseStudyCsv(csv) };
}

export function allStudies(): StudyMeta[] {
  return Object.keys(CSV).map((slug) => STUDY_META[slug]);
}
