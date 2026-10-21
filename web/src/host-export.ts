// What the .xlsx export of the hosts table carries: the same columns the table shows, the stage as
// the reader's word rather than its id, and the report link so a row stays useful outside the page.
import { STAGE_LABEL } from '../../engine/assess';
import type { HostRow } from './fixtures';
import { buildXlsx, type CellValue } from './xlsx';

export const HOST_EXPORT_HEADER = ['Host', 'Port', 'Stage', 'Score', 'Scans', 'Last tested', 'Report'] as const;

const iso = (d: string) => {
  const at = new Date(d);
  return Number.isNaN(at.getTime()) ? d : at.toISOString().slice(0, 16).replace('T', ' ');
};

/** Every matching row, in the order the reader sorted the table: the export is not one page of it. */
export function hostExportRows(rows: HostRow[]): CellValue[][] {
  return [
    [...HOST_EXPORT_HEADER],
    ...rows.map((r) => [
      r.host,
      r.port,
      STAGE_LABEL[r.stage as keyof typeof STAGE_LABEL] ?? r.stage,
      r.score,
      r.scans,
      iso(r.lastAt),
      `/r/${r.lastId}`,
    ]),
  ];
}

/** quantum-ready-labs-hosts-2026-10-18.xlsx */
export function hostExportName(now = new Date()): string {
  return `quantum-ready-labs-hosts-${now.toISOString().slice(0, 10)}.xlsx`;
}

export function hostExportXlsx(rows: HostRow[]): Uint8Array {
  return buildXlsx('Hosts', hostExportRows(rows));
}
