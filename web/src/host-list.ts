// The list of hosts in the private metrics view, as data: search, stage, score and scans narrow it;
// a header orders it; the reader gets one page of it. Pure on purpose (no DOM, no React), so the
// numbers behind every row the view shows are pinned by tests/host-list.test.ts.
import type { HostRow } from './fixtures';

/** A page of the hosts table, 50 by default: the maintainer reads this on a phone too. */
export const HOST_PAGE_SIZE = 50;

export type HostSort = 'host' | 'stage' | 'score' | 'scans' | 'lastAt';
export type SortDir = 'asc' | 'desc';

export interface HostListQuery {
  /** Matched against the host name and the port as plain text, anywhere in them. */
  query: string;
  /** The stages to keep; empty means every stage. */
  stages: string[];
  minScore: number | null;
  maxScore: number | null;
  minScans: number | null;
  sort: HostSort;
  dir: SortDir;
  page: number;
  /** Rows to a page; 0 means all of them. */
  pageSize: number;
}

export interface HostListPage {
  rows: HostRow[];
  /** Rows matching the filters, before paging. */
  total: number;
  page: number;
  pages: number;
  /** The 1-based position of the first and last row shown; 0 and 0 when nothing matches. */
  from: number;
  to: number;
}

/** Where each stage sits on the readiness ladder, worst first: sorting by stage sorts by this, not by name. */
const LADDER = ['exposed', 'at-risk', 'protected', 'ready', 'unreachable', 'inconclusive'];
const ladderRank = (stage: string) => {
  const i = LADDER.indexOf(stage);
  return i < 0 ? LADDER.length : i;
};

const target = (r: HostRow) => (r.port === 443 ? r.host : `${r.host}:${r.port}`);

/** The value a column sorts on; strings compare by locale, numbers and dates numerically. */
function sortValue(r: HostRow, by: HostSort): string | number {
  switch (by) {
    case 'host':
      return target(r);
    case 'stage':
      return ladderRank(r.stage);
    case 'score':
      return r.score;
    case 'scans':
      return r.scans;
    case 'lastAt':
      return Date.parse(r.lastAt);
  }
}

/**
 * The rows a reader asked for. Filters first, then order, then the page they are on. A page past
 * the end lands on the last one, so a filter that shrinks the list never shows an empty table.
 */
export function hostList(rows: HostRow[], q: HostListQuery): HostListPage {
  const needle = q.query.trim().toLowerCase();
  const kept = rows.filter((r) => {
    if (needle && !target(r).toLowerCase().includes(needle)) return false;
    if (q.stages.length && !q.stages.includes(r.stage)) return false;
    if (q.minScore !== null && r.score < q.minScore) return false;
    if (q.maxScore !== null && r.score > q.maxScore) return false;
    if (q.minScans !== null && r.scans < q.minScans) return false;
    return true;
  });

  const sign = q.dir === 'asc' ? 1 : -1;
  const sorted = [...kept].sort((a, b) => {
    const va = sortValue(a, q.sort);
    const vb = sortValue(b, q.sort);
    const byValue = typeof va === 'number' && typeof vb === 'number' ? va - vb : String(va).localeCompare(String(vb), 'en');
    if (byValue) return byValue * sign;
    // A stable order whatever order the rows arrived in, so the pages never shuffle between renders.
    const byHost = target(a).localeCompare(target(b), 'en');
    return byHost || a.port - b.port;
  });

  const total = sorted.length;
  const size = q.pageSize > 0 ? q.pageSize : Math.max(1, total);
  const pages = Math.max(1, Math.ceil(total / size));
  const page = Math.min(Math.max(1, Math.trunc(q.page) || 1), pages);
  const start = (page - 1) * size;
  const shown = sorted.slice(start, start + size);

  return {
    rows: shown,
    total,
    page,
    pages,
    from: total ? start + 1 : 0,
    to: total ? start + shown.length : 0,
  };
}

/** The stage chips to offer: those the rows actually carry, in ladder order, unknown ones last. */
export function hostStages(rows: HostRow[]): string[] {
  const present = [...new Set(rows.map((r) => r.stage))];
  return present.sort((a, b) => ladderRank(a) - ladderRank(b) || a.localeCompare(b, 'en'));
}
