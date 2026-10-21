// The hosts table: a reader narrows it (search, stage chips, score and scans), orders it from a
// header, reads it one page of 50 at a time, and takes the whole filtered list away as .xlsx. The
// arithmetic is host-list.ts; this file renders it and holds the query in state.
import { useMemo, useState } from 'react';
import { STAGE_LABEL } from '../../../engine/assess';
import type { HostRow } from '../fixtures';
import { hostExportName, hostExportXlsx } from '../host-export';
import { HOST_PAGE_SIZE, hostList, hostStages, type HostSort, type SortDir } from '../host-list';

const COLUMNS: { key: HostSort; label: string; optional?: boolean; numeric?: boolean }[] = [
  { key: 'host', label: 'Host' },
  { key: 'stage', label: 'Stage' },
  { key: 'score', label: 'Score', numeric: true },
  { key: 'scans', label: 'Scans', optional: true, numeric: true },
  { key: 'lastAt', label: 'Last tested', optional: true },
];

const columns = COLUMNS.length;

/** EXPOSED -> Exposed: the chip reads as a word, as on the study page. */
const sentence = (label: string) => label.charAt(0) + label.slice(1).toLowerCase();

const num = (raw: string): number | null => {
  const trimmed = raw.trim();
  return trimmed === '' || Number.isNaN(Number(trimmed)) ? null : Number(trimmed);
};

export function HostsTable({ hosts, generatedAt }: { hosts: HostRow[]; generatedAt: string }) {
  const [query, setQuery] = useState('');
  const [stages, setStages] = useState<string[]>([]);
  const [minScore, setMinScore] = useState('');
  const [maxScore, setMaxScore] = useState('');
  const [minScans, setMinScans] = useState('');
  const [sort, setSort] = useState<HostSort>('lastAt');
  const [dir, setDir] = useState<SortDir>('desc');
  const [page, setPage] = useState(1);

  const chips = useMemo(() => hostStages(hosts), [hosts]);
  const chipCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const h of hosts) counts.set(h.stage, (counts.get(h.stage) ?? 0) + 1);
    return counts;
  }, [hosts]);
  const shown = useMemo(
    () => hostList(hosts, { query, stages, minScore: num(minScore), maxScore: num(maxScore), minScans: num(minScans), sort, dir, page, pageSize: HOST_PAGE_SIZE }),
    [hosts, query, stages, minScore, maxScore, minScans, sort, dir, page],
  );
  // The export carries every matching row, in the order the headers set, not just this page.
  const allMatching = useMemo(
    () => hostList(hosts, { query, stages, minScore: num(minScore), maxScore: num(maxScore), minScans: num(minScans), sort, dir, page: 1, pageSize: 0 }),
    [hosts, query, stages, minScore, maxScore, minScans, sort, dir],
  );

  // Any change to what is being shown goes back to the first page: page 4 of a new filter is noise.
  const narrow = <T,>(set: (v: T) => void) => (v: T) => {
    set(v);
    setPage(1);
  };

  const order = (key: HostSort) => {
    if (key === sort) setDir(dir === 'asc' ? 'desc' : 'asc');
    else {
      setSort(key);
      // Numbers and dates read best biggest-first; names and stages read best from the top.
      setDir(key === 'host' || key === 'stage' ? 'asc' : 'desc');
    }
    setPage(1);
  };

  const clear = () => {
    setQuery('');
    setStages([]);
    setMinScore('');
    setMaxScore('');
    setMinScans('');
    setPage(1);
  };

  const narrowed = query.trim() !== '' || stages.length > 0 || minScore.trim() !== '' || maxScore.trim() !== '' || minScans.trim() !== '';

  const exportXlsx = () => {
    const blob = new Blob([hostExportXlsx(allMatching.rows) as unknown as BlobPart], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = hostExportName(new Date(generatedAt));
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 0);
  };

  return (
    <>
      <p className="notice">
        Latest fresh result per host, most recent first. The link opens the public result page. {HOST_PAGE_SIZE} to a page.
      </p>

      <div className="host-tools">
        <input
          type="search"
          className="host-search"
          aria-label="Search hosts"
          placeholder="Search host or port"
          value={query}
          onChange={(e) => narrow(setQuery)(e.target.value)}
        />
        <div className="chips" role="group" aria-label="Filter by stage">
          <button type="button" className="chip" aria-pressed={stages.length === 0} onClick={() => narrow(setStages)([])}>
            All {hosts.length}
          </button>
          {chips.map((st) => (
            <button
              key={st}
              type="button"
              className="chip"
              aria-pressed={stages.includes(st)}
              onClick={() => narrow(setStages)(stages.includes(st) ? stages.filter((s) => s !== st) : [...stages, st])}
              style={{ ['--chip' as string]: `var(--stage-${st})` }}
            >
              {sentence(STAGE_LABEL[st as keyof typeof STAGE_LABEL] ?? st)} {chipCounts.get(st) ?? 0}
            </button>
          ))}
        </div>
        <div className="host-ranges">
          <label>
            <span>Score</span>
            <input type="number" min={0} max={100} inputMode="numeric" aria-label="Minimum score" placeholder="min" value={minScore} onChange={(e) => narrow(setMinScore)(e.target.value)} />
            <span aria-hidden="true">to</span>
            <input type="number" min={0} max={100} inputMode="numeric" aria-label="Maximum score" placeholder="max" value={maxScore} onChange={(e) => narrow(setMaxScore)(e.target.value)} />
          </label>
          <label>
            <span>Scans at least</span>
            <input type="number" min={0} inputMode="numeric" aria-label="Minimum scans" placeholder="0" value={minScans} onChange={(e) => narrow(setMinScans)(e.target.value)} />
          </label>
          <button type="button" className="button ghost hosts-export" data-testid="hosts-export" onClick={exportXlsx} disabled={allMatching.total === 0}>
            Export .xlsx
          </button>
        </div>
      </div>

      <p className="notice host-count" data-testid="hosts-count">
        {shown.total ? `${shown.from}\u2013${shown.to} of ${shown.total}` : '0 of 0'}
        {narrowed ? `, narrowed from ${hosts.length}` : ''}
      </p>

      <div className="table-wrap">
        <table className="table hosts-table">
          <thead>
            <tr>
              {COLUMNS.map((c) => (
                <th
                  key={c.key}
                  aria-sort={sort === c.key ? (dir === 'asc' ? 'ascending' : 'descending') : 'none'}
                  className={[c.optional ? 'optional' : '', c.numeric ? 'numeric' : ''].filter(Boolean).join(' ') || undefined}
                  title={`Sort by ${c.label.toLowerCase()}`}
                >
                  <button type="button" className="sort" onClick={() => order(c.key)}>
                    {c.label}
                    <span className="arrow" aria-hidden="true">
                      {sort === c.key ? (dir === 'asc' ? '\u25b2' : '\u25bc') : '\u2195'}
                    </span>
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {shown.rows.map((h) => (
              <tr key={`${h.host}:${h.port}`} data-testid="host-row">
                <td className="mono">
                  <a href={`/r/${h.lastId}`}>
                    {h.host}
                    {h.port !== 443 ? `:${h.port}` : ''}
                  </a>
                </td>
                <td data-testid="host-stage" style={{ color: `var(--stage-${h.stage})`, fontWeight: 600 }}>
                  {STAGE_LABEL[h.stage as keyof typeof STAGE_LABEL] ?? h.stage}
                </td>
                <td className="mono numeric" data-testid="host-score">
                  {h.score}
                </td>
                <td className="mono dim optional numeric">{h.scans}</td>
                <td className="dim optional">{new Date(h.lastAt).toISOString().slice(0, 16).replace('T', ' ')}</td>
              </tr>
            ))}
            {shown.rows.length === 0 && (
              <tr>
                <td colSpan={columns} className="dim" data-testid="hosts-empty">
                  {hosts.length === 0 ? 'No hosts tested in the last 30 days.' : "No host matches these filters. Clear them to see the whole list."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="host-pager">
        <button type="button" className="button ghost" onClick={() => setPage(1)} disabled={shown.page === 1}>
          First page
        </button>
        <button type="button" className="button ghost" onClick={() => setPage(shown.page - 1)} disabled={shown.page === 1}>
          Previous page
        </button>
        <span className="mono" data-testid="hosts-page">
          Page {shown.page} of {shown.pages}
        </span>
        <button type="button" className="button ghost" onClick={() => setPage(shown.page + 1)} disabled={shown.page >= shown.pages}>
          Next page
        </button>
        <button type="button" className="button ghost" onClick={() => setPage(shown.pages)} disabled={shown.page >= shown.pages}>
          Last page
        </button>
        {narrowed && (
          <button type="button" className="button ghost" onClick={clear}>
            Clear filters
          </button>
        )}
      </div>
    </>
  );
}
