import { describe, expect, test } from 'bun:test';
import { HOST_PAGE_SIZE, hostList, hostStages, type HostListQuery } from '../web/src/host-list';
import type { HostRow } from '../web/src/fixtures';

// The list of hosts in the private metrics view: what a reader can narrow it to (search, stage,
// score, scans), how they order it, and the page they are on. Pure: the view only renders this.

const row = (over: Partial<HostRow>): HostRow => ({
  host: 'a.example',
  port: 443,
  stage: 'protected',
  score: 80,
  scans: 1,
  lastId: 'demo-protected',
  lastAt: '2026-10-18T10:00:00.000Z',
  ...over,
});

const ROWS: HostRow[] = [
  row({ host: 'ready.example', port: 443, stage: 'ready', score: 95, scans: 3, lastAt: '2026-10-18T11:40:00.000Z' }),
  row({ host: 'protected.example', port: 443, stage: 'protected', score: 85, scans: 12, lastAt: '2026-10-18T10:12:00.000Z' }),
  row({ host: 'at-risk.example', port: 443, stage: 'at-risk', score: 49, scans: 7, lastAt: '2026-10-17T22:05:00.000Z' }),
  row({ host: 'exposed.example', port: 1012, stage: 'exposed', score: 27, scans: 2, lastAt: '2026-10-17T09:30:00.000Z' }),
  row({ host: 'shop.example', port: 443, stage: 'protected', score: 79, scans: 4, lastAt: '2026-10-16T15:02:00.000Z' }),
  row({ host: 'intranet-portal.example', port: 9000, stage: 'at-risk', score: 43, scans: 1, lastAt: '2026-10-15T08:44:00.000Z' }),
];

const q = (over: Partial<HostListQuery> = {}): HostListQuery => ({ query: '', stages: [], minScore: null, maxScore: null, minScans: null, sort: 'lastAt', dir: 'desc', page: 1, pageSize: HOST_PAGE_SIZE, ...over });
const hosts = (query: Partial<HostListQuery> = {}) => hostList(ROWS, q(query)).rows.map((r) => r.host);

describe('hostList: what the reader narrows to', () => {
  test('with nothing set it shows every host, most recent first, 50 to a page', () => {
    const out = hostList(ROWS, q());
    expect(out.rows.map((r) => r.host)).toEqual(['ready.example', 'protected.example', 'at-risk.example', 'exposed.example', 'shop.example', 'intranet-portal.example']);
    expect(out.total).toBe(6);
    expect(out.page).toBe(1);
    expect(out.pages).toBe(1);
    expect(HOST_PAGE_SIZE).toBe(50);
  });

  test('a search matches the host as typed, anywhere in the name, and the port', () => {
    expect(hosts({ query: 'shop' })).toEqual(['shop.example']);
    expect(hosts({ query: 'EXAMPLE' })).toHaveLength(6);
    expect(hosts({ query: '  .example  ' })).toHaveLength(6);
    expect(hosts({ query: '1012' })).toEqual(['exposed.example']);
    expect(hosts({ query: '9000' })).toEqual(['intranet-portal.example']);
    expect(hosts({ query: 'nothing.here' })).toEqual([]);
  });

  test('a search with a regular-expression character matches it as text, not as a pattern', () => {
    expect(hosts({ query: '.*' })).toEqual([]);
    expect(hosts({ query: '(' })).toEqual([]);
    expect(hosts({ query: 'a.b' })).toEqual([]);
  });

  test('stage narrows to the stages chosen, several at once', () => {
    expect(hosts({ stages: ['exposed'] })).toEqual(['exposed.example']);
    expect(hosts({ stages: ['exposed', 'at-risk'] })).toEqual(['at-risk.example', 'exposed.example', 'intranet-portal.example']);
    expect(hosts({ stages: [] })).toHaveLength(6);
    // A stage the ladder does not name is still shown if a row carries it, never silently dropped.
    expect(hostList([row({ host: 'odd.example', stage: 'unreachable' })], q({ stages: ['unreachable'] })).rows).toHaveLength(1);
  });

  test('score range and minimum scans narrow by number, both ends inclusive', () => {
    expect(hosts({ minScore: 80 })).toEqual(['ready.example', 'protected.example']);
    expect(hosts({ maxScore: 49 })).toEqual(['at-risk.example', 'exposed.example', 'intranet-portal.example']);
    expect(hosts({ minScore: 43, maxScore: 79 })).toEqual(['at-risk.example', 'shop.example', 'intranet-portal.example']);
    expect(hosts({ minScans: 7 })).toEqual(['protected.example', 'at-risk.example']);
    expect(hosts({ minScore: 90, maxScore: 30 })).toEqual([]);
  });

  test('the filters combine: each one narrows what the others left', () => {
    expect(hosts({ query: '.example', stages: ['protected'], minScore: 80 })).toEqual(['protected.example']);
    expect(hosts({ stages: ['protected'], minScans: 5 })).toEqual(['protected.example']);
  });

  test('zero is a number, not an empty field', () => {
    expect(hosts({ minScore: 0 })).toHaveLength(6);
    expect(hosts({ minScans: 0 })).toHaveLength(6);
    expect(hosts({ maxScore: 0 })).toEqual([]);
  });
});

describe('hostList: how the reader orders it', () => {
  test('each column sorts both ways from its header', () => {
    expect(hosts({ sort: 'host', dir: 'asc' })).toEqual(['at-risk.example', 'exposed.example', 'intranet-portal.example', 'protected.example', 'ready.example', 'shop.example']);
    expect(hosts({ sort: 'host', dir: 'desc' })).toEqual(['shop.example', 'ready.example', 'protected.example', 'intranet-portal.example', 'exposed.example', 'at-risk.example']);
    expect(hosts({ sort: 'score', dir: 'asc' }).slice(0, 2)).toEqual(['exposed.example', 'intranet-portal.example']);
    expect(hosts({ sort: 'score', dir: 'desc' }).slice(0, 2)).toEqual(['ready.example', 'protected.example']);
    expect(hosts({ sort: 'scans', dir: 'desc' })).toEqual(['protected.example', 'at-risk.example', 'shop.example', 'ready.example', 'exposed.example', 'intranet-portal.example']);
    expect(hosts({ sort: 'lastAt', dir: 'asc' })).toEqual(['intranet-portal.example', 'shop.example', 'exposed.example', 'at-risk.example', 'protected.example', 'ready.example']);
  });

  test('stage sorts worst first, by where the stage sits on the ladder, not by its name', () => {
    // Alphabetically 'at-risk' < 'exposed' < 'protected' < 'ready'; on the ladder Exposed is worse.
    expect(hosts({ sort: 'stage', dir: 'asc' }).slice(0, 3)).toEqual(['exposed.example', 'at-risk.example', 'intranet-portal.example']);
    expect(hosts({ sort: 'stage', dir: 'desc' })[0]).toBe('ready.example');
  });

  test('hosts at the same value keep a stable order, so pages do not shuffle', () => {
    const tied = hostList(ROWS, q({ sort: 'stage', dir: 'asc' }));
    const again = hostList([...ROWS].reverse(), q({ sort: 'stage', dir: 'asc' }));
    expect(again.rows.map((r) => r.host)).toEqual(tied.rows.map((r) => r.host));
  });

  test('sorting never mutates the rows it was given', () => {
    const input = [...ROWS];
    hostList(input, q({ sort: 'score', dir: 'asc' }));
    expect(input.map((r) => r.host)).toEqual(ROWS.map((r) => r.host));
  });
});

describe('hostList: the page', () => {
  const many = Array.from({ length: 137 }, (_, i) => row({ host: `h${String(i + 1).padStart(3, '0')}.example`, score: i, scans: i, lastAt: new Date(Date.UTC(2026, 9, 18, 0, 0, 0) - i * 60000).toISOString() }));

  test('50 to a page by default: three pages for 137 hosts, the last one short', () => {
    expect(hostList(many, q()).total).toBe(137);
    expect(hostList(many, q()).pages).toBe(3);
    expect(hostList(many, q()).rows).toHaveLength(50);
    expect(hostList(many, q({ page: 3 })).rows).toHaveLength(37);
    expect(hostList(many, q({ page: 1 })).from).toBe(1);
    expect(hostList(many, q({ page: 1 })).to).toBe(50);
    expect(hostList(many, q({ page: 3 })).from).toBe(101);
    expect(hostList(many, q({ page: 3 })).to).toBe(137);
  });

  test('the pages hold every row once, in order, with no overlap and no gap', () => {
    const seen = [1, 2, 3].flatMap((page) => hostList(many, q({ page })).rows.map((r) => r.host));
    expect(seen).toEqual(many.map((r) => r.host));
    expect(new Set(seen).size).toBe(137);
  });

  test('filtering resets to the first page and re-counts the pages', () => {
    const out = hostList(many, q({ page: 3, query: 'h00' }));
    expect(out.total).toBe(9);
    expect(out.page).toBe(1);
    expect(out.pages).toBe(1);
  });

  test('a page past the end lands on the last page instead of an empty table', () => {
    expect(hostList(many, q({ page: 99 })).page).toBe(3);
    expect(hostList(many, q({ page: 99 })).rows).toHaveLength(37);
    expect(hostList(many, q({ page: 0 })).page).toBe(1);
    expect(hostList(many, q({ page: -4 })).page).toBe(1);
  });

  test('a larger page size, or all of them, still describes the same set', () => {
    expect(hostList(many, q({ pageSize: 100 })).rows).toHaveLength(100);
    expect(hostList(many, q({ pageSize: 100 })).pages).toBe(2);
    const all = hostList(many, q({ pageSize: 0 }));
    expect(all.rows).toHaveLength(137);
    expect(all.pages).toBe(1);
    expect(all.from).toBe(1);
    expect(all.to).toBe(137);
  });

  test('nothing matching is an honest empty state, not a first page of nothing', () => {
    const out = hostList(many, q({ query: 'nothing' }));
    expect(out.total).toBe(0);
    expect(out.rows).toEqual([]);
    expect(out.from).toBe(0);
    expect(out.to).toBe(0);
    expect(out.pages).toBe(1);
  });
});

describe('hostStages', () => {
  test('the stage chips are the stages the rows carry, ladder order first', () => {
    expect(hostStages(ROWS)).toEqual(['exposed', 'at-risk', 'protected', 'ready']);
    expect(hostStages([row({ stage: 'unreachable' }), row({ stage: 'exposed' })])).toEqual(['exposed', 'unreachable']);
    expect(hostStages([])).toEqual([]);
  });
});
