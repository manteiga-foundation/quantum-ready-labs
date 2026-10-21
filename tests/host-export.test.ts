import { describe, expect, test } from 'bun:test';
import { hostExportName, hostExportRows, hostExportXlsx } from '../web/src/host-export';
import type { HostRow } from '../web/src/fixtures';
import { parseStoredZip, text } from './zip';

// The .xlsx the hosts table hands the maintainer: the same columns as the table, the stage as the
// reader's word, every matching row rather than the page on screen.

const ROWS: HostRow[] = [
  { host: 'ready.example', port: 443, stage: 'ready', score: 95, scans: 3, lastId: 'abc123', lastAt: '2026-10-18T11:40:00.000Z' },
  { host: 'exposed.example', port: 1012, stage: 'exposed', score: 27, scans: 2, lastId: 'def456', lastAt: '2026-10-17T09:30:00.000Z' },
];

describe('hostExportRows', () => {
  test('the header is the table columns, then one row per host in the order given', () => {
    const rows = hostExportRows(ROWS);
    expect(rows[0]).toEqual(['Host', 'Port', 'Stage', 'Score', 'Scans', 'Last tested', 'Report']);
    expect(rows).toHaveLength(3);
    expect(rows[1]).toEqual(['ready.example', 443, 'READY', 95, 3, '2026-10-18 11:40', '/r/abc123']);
    // The port is its own column, so a non-443 host is not hidden inside the name.
    expect(rows[2][1]).toBe(1012);
  });

  test('numbers stay numbers and the stage is the reader\'s word, not the id', () => {
    const [, first] = hostExportRows(ROWS);
    expect(typeof first[1]).toBe('number');
    expect(typeof first[3]).toBe('number');
    expect(typeof first[4]).toBe('number');
    // The label the page shows, so a reader matches the file to the table row for row.
    expect(first[2]).toBe('READY');
    expect(first[2]).not.toBe('ready');
  });

  test('an unknown stage is written as it came, not dropped', () => {
    const rows = hostExportRows([{ ...ROWS[0], stage: 'inconclusive' }]);
    expect(rows[1][2]).toBe('INCONCLUSIVE');
  });

  test('an empty list exports the header only, not a blank file', () => {
    expect(hostExportRows([])).toHaveLength(1);
  });
});

describe('hostExportName', () => {
  test('the filename carries the day, so two exports do not overwrite each other', () => {
    expect(hostExportName(new Date('2026-10-18T12:00:00Z'))).toBe('quantum-ready-labs-hosts-2026-10-18.xlsx');
  });
});

describe('hostExportXlsx', () => {
  test('is a real workbook with a Hosts sheet holding the rows', () => {
    const entries = parseStoredZip(hostExportXlsx(ROWS));
    expect(text(entries, 'xl/workbook.xml')).toContain('<sheet name="Hosts"');
    const sheet = text(entries, 'xl/worksheets/sheet1.xml');
    expect(sheet).toContain('<is><t>ready.example</t></is>');
    expect(sheet).toContain('<is><t>READY</t></is>');
    expect(sheet).toContain('<v>95</v>');
    expect(sheet).toContain('<is><t>/r/abc123</t></is>');
  });

  test('does not grow a formula out of a host name that starts with =', () => {
    const sheet = text(parseStoredZip(hostExportXlsx([{ ...ROWS[0], host: '=cmd|calc' }])), 'xl/worksheets/sheet1.xml');
    expect(sheet).toContain('<is><t>=cmd|calc</t></is>');
    expect(sheet).not.toContain('<f>');
  });
});
