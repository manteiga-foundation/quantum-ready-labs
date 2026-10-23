// A study is a named population the maintainer scanned (scripts/study.ts). This module reads its
// results.csv and computes the figures the state-of-readiness note states, so the page and the
// press text never carry a number typed by hand. Pure: the worker (link previews) and the browser
// (the page) both import it; the CSV itself is bound in web/src/studies.ts.

import type { Stage } from '../../engine/assess';
import { DEFAULT_LOCALE, localePath, type Locale } from './i18n/locales';

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
  /** The study's own words in the other languages; a missing one falls back to English. */
  translations?: Partial<Record<Exclude<Locale, 'en'>, StudyText>>;
}

/** The words of a study that are its own (the page's frame lives in the message catalogues). */
export interface StudyText {
  title: string;
  subtitle: string;
  population: string;
  /** Carries the same figures as the English lead; a test checks them against the CSV. */
  lead: string;
}

export function studyText(meta: StudyMeta, locale: Locale): StudyText {
  const english = { title: meta.title, subtitle: meta.subtitle, population: meta.population, lead: meta.lead };
  return locale === 'en' ? english : (meta.translations?.[locale] ?? english);
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
    translations: {
      es: {
        title: 'Bancos y cooperativas de crédito de Florida: estado de preparación cuántica',
        subtitle: '81 instituciones financieras con sede en Florida, cuarto trimestre de 2026',
        population:
          'Bancos y cooperativas de crédito con sede en Florida, junto con dos grandes empresas financieras de Florida, seleccionados de listas públicas de los reguladores y recopilados a mano. Cada institución está representada por su dominio público principal, el que escriben sus clientes; no se probaron los portales de banca en línea alojados en servidores de proveedores. Cada dominio se verificó (DNS y título de la página de inicio) antes del análisis; las instituciones que se habían fusionado, cambiado de nombre o respondían con otro nombre se descartaron y figuran en el archivo de origen del estudio.',
        lead: 'De 81 bancos y cooperativas de crédito de Florida, 54 ya protegen las conexiones de sus clientes frente al descifrado cuántico futuro; 27 todavía no.',
      },
      pt: {
        title: 'Bancos e cooperativas de crédito da Flórida: estado de preparação quântica',
        subtitle: '81 instituições financeiras com sede na Flórida, quarto trimestre de 2026',
        population:
          'Bancos e cooperativas de crédito com sede na Flórida, além de duas grandes empresas financeiras da Flórida, escolhidos a partir de listas públicas dos reguladores e compilados manualmente. Cada instituição é representada pelo seu domínio público principal, aquele que os clientes digitam; portais de internet banking hospedados em servidores de fornecedores não foram testados. Cada domínio foi verificado (DNS e título da página inicial) antes da análise; instituições que haviam se fundido, mudado de nome ou respondiam por outro nome foram excluídas e constam no arquivo de origem do estudo.',
        lead: 'De 81 bancos e cooperativas de crédito da Flórida, 54 já protegem as conexões de seus clientes contra a decifração quântica futura; 27 ainda não.',
      },
      fr: {
        title: 'Banques et coopératives de crédit de Floride\u00a0: état de préparation quantique',
        subtitle: '81 institutions financières dont le siège est en Floride, quatrième trimestre 2026',
        population:
          'Banques et coopératives de crédit dont le siège est en Floride, ainsi que deux grandes sociétés financières de Floride, choisies à partir des listes publiques des régulateurs et compilées à la main. Chaque institution est représentée par son domaine public principal, celui que saisissent ses clients\u00a0; les portails de banque en ligne hébergés chez un prestataire n’ont pas été testés. Chaque domaine a été vérifié (DNS et titre de la page d’accueil) avant l’analyse\u00a0; les institutions qui avaient fusionné, changé de nom ou répondaient sous un autre nom ont été écartées et figurent dans le fichier source de l’étude.',
        lead: 'Sur 81 banques et coopératives de crédit de Floride, 54 protègent déjà les connexions de leurs clients contre un futur déchiffrement quantique\u00a0; 27 pas encore.',
      },
      de: {
        title: 'Banken und Kreditgenossenschaften in Florida: Stand der Quantenbereitschaft',
        subtitle: '81 Finanzinstitute mit Sitz in Florida, viertes Quartal 2026',
        population:
          'Banken und Kreditgenossenschaften mit Sitz in Florida sowie zwei große Finanzunternehmen aus Florida, ausgewählt aus öffentlichen Listen der Aufsichtsbehörden und von Hand zusammengestellt. Jedes Institut ist durch seine öffentliche Hauptdomain vertreten, die Kunden eintippen; Online-Banking-Portale auf Servern von Dienstleistern wurden nicht getestet. Jede Domain wurde vor dem Scan geprüft (DNS und Titel der Startseite); Institute, die fusioniert, umbenannt oder unter einem anderen Namen geantwortet hatten, wurden entfernt und sind in der Quelldatei der Studie aufgeführt.',
        lead: 'Von 81 Banken und Kreditgenossenschaften in Florida schützen 54 die Verbindungen ihrer Kunden bereits gegen künftige Quanten-Entschlüsselung; 27 noch nicht.',
      },
      ja: {
        title: 'フロリダ州の銀行と信用組合：量子時代への対応状況',
        subtitle: 'フロリダ州に本拠を置く 81 の金融機関、2026 年第4四半期',
        population:
          'フロリダ州に本拠を置く銀行と信用組合、およびフロリダ州の大手金融会社2社を、規制当局の公開リストから選び、手作業でまとめました。各機関は、顧客が入力する公開の主要ドメインで代表させています。ベンダーのホスト上にあるオンラインバンキングのポータルは診断していません。診断の前にすべてのドメインを検証し（DNS とトップページのタイトル）、合併、名称変更、または別の名前で応答した機関は除外し、調査のソースファイルに記載しています。',
        lead: 'フロリダ州の銀行と信用組合 81 機関のうち、54 機関はすでに顧客の接続を将来の量子コンピューターによる解読から保護しており、27 機関はまだです。',
      },
    },
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

/** The link preview of a study page, in the page's language; null for a slug that is not a study. */
export function studyPreview(slug: string, origin: string, locale: Locale = DEFAULT_LOCALE): StudyPreview | null {
  const meta = STUDY_META[slug];
  if (!meta) return null;
  const text = studyText(meta, locale);
  return {
    title: `${text.title} \u00b7 Quantum Ready Labs`,
    description: text.lead,
    image: `${origin}/og/study-${slug}.png`,
    url: `${origin}${localePath(locale, `/studies/${slug}`)}`,
  };
}
