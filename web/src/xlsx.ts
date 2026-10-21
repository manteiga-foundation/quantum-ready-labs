// An .xlsx written by hand, without a dependency: Office Open XML is a zip of small XML parts, and
// a reader of the metrics view wants a file Excel, Numbers and Google Sheets all open, not a CSV
// renamed. Entries are stored (not compressed), which keeps the writer ~60 lines and the output
// valid; the tests parse the package back with tests/zip.ts.

/** A cell: text stays text, a number stays a number, nothing stays empty. */
export type CellValue = string | number | null | undefined;

const MAIN_NS = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
const REL_NS = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';

const encoder = new TextEncoder();

/** The characters XML 1.0 cannot carry at all: drop them rather than write a file no reader opens. */
const stripIllegal = (s: string) => s.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, ' ');

function escapeXml(s: string): string {
  return stripIllegal(s).replace(/[&<>"]/g, (c) => (c === '&' ? '&amp;' : c === '<' ? '&lt;' : c === '>' ? '&gt;' : '&quot;'));
}

/** A1, B1, ... Z1, AA1: the column letters, then the row number. */
export function cellRef(column: number, row: number): string {
  let n = column;
  let letters = '';
  while (n >= 0) {
    letters = String.fromCharCode(65 + (n % 26)) + letters;
    n = Math.floor(n / 26) - 1;
  }
  return `${letters}${row}`;
}

/** Excel's rules for a sheet name: at most 31 characters, none of [ ] : / \ ? * " or a leading/trailing apostrophe. */
export function sheetName(raw: string): string {
  const cleaned = stripIllegal(raw).replace(/[[\]:/\\?*"]/g, '').replace(/^'+|'+$/g, '').replace(/\s+/g, ' ').trim().slice(0, 31).trim();
  return cleaned || 'Sheet1';
}

const contentTypes = (withStyles: boolean) =>
  `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n` +
  `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
  `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>` +
  `<Default Extension="xml" ContentType="application/xml"/>` +
  `<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>` +
  `<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>` +
  (withStyles ? `<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>` : '') +
  `</Types>`;

const rootRels =
  `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n` +
  `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
  `<Relationship Id="rId1" Type="${REL_NS}/officeDocument" Target="xl/workbook.xml"/>` +
  `</Relationships>`;

const workbook = (name: string) =>
  `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n` +
  `<workbook xmlns="${MAIN_NS}" xmlns:r="${REL_NS}">` +
  `<sheets><sheet name="${escapeXml(name)}" sheetId="1" r:id="rId1"/></sheets>` +
  `</workbook>`;

const workbookRels =
  `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n` +
  `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
  `<Relationship Id="rId1" Type="${REL_NS}/worksheet" Target="worksheets/sheet1.xml"/>` +
  `<Relationship Id="rId2" Type="${REL_NS}/styles" Target="styles.xml"/>` +
  `</Relationships>`;

/** Two cell formats: 0 the default, 1 bold for the header row. */
const styles =
  `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n` +
  `<styleSheet xmlns="${MAIN_NS}">` +
  `<fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts>` +
  `<fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills>` +
  `<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>` +
  `<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>` +
  `<cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/></cellXfs>` +
  `</styleSheet>`;

/** A column is as wide as its widest value allows, within reason. */
function columnWidths(rows: CellValue[][]): number[] {
  const widths: number[] = [];
  for (const row of rows) {
    row.forEach((value, i) => {
      const len = value === null || value === undefined ? 0 : String(value).length;
      widths[i] = Math.max(widths[i] ?? 0, len);
    });
  }
  return widths.map((w) => Math.min(60, Math.max(8, w + 2)));
}

function cellXml(value: CellValue, column: number, row: number, bold: boolean): string {
  if (value === null || value === undefined || value === '') return '';
  const ref = cellRef(column, row);
  const style = bold ? ' s="1"' : '';
  if (typeof value === 'number' && Number.isFinite(value)) return `<c r="${ref}"${style}><v>${value}</v></c>`;
  const text = escapeXml(String(value));
  const preserve = /^\s|\s$/.test(String(value)) ? ' xml:space="preserve"' : '';
  return `<c r="${ref}"${style} t="inlineStr"><is><t${preserve}>${text}</t></is></c>`;
}

function sheetXml(rows: CellValue[][]): string {
  const cols = columnWidths(rows)
    .map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`)
    .join('');
  const body = rows
    .map((row, r) => {
      const cells = row.map((v, c) => cellXml(v, c, r + 1, r === 0)).join('');
      return cells ? `<row r="${r + 1}">${cells}</row>` : '';
    })
    .join('');
  return (
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n` +
    `<worksheet xmlns="${MAIN_NS}">` +
    `<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>` +
    `<cols>${cols}</cols>` +
    `<sheetData>${body}</sheetData>` +
    `</worksheet>`
  );
}

/** Concatenation covers 137 rows quickly; the zip writer below needs one buffer per entry anyway. */
function concat(parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
}

const crcTable = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[i] = c >>> 0;
  }
  return table;
})();

function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = crcTable[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/** A fixed DOS timestamp (1 January 2026, 00:00) so the same data always makes the same bytes. */
const DOS_TIME = 0;
const DOS_DATE = ((2026 - 1980) << 9) | (1 << 5) | 1;

/** Writes the entries as a zip with stored (uncompressed) local headers and a central directory. */
function zip(entries: { name: string; data: Uint8Array }[]): Uint8Array {
  const locals: Uint8Array[] = [];
  const centrals: Uint8Array[] = [];
  let offset = 0;
  for (const entry of entries) {
    const name = encoder.encode(entry.name);
    const crc = crc32(entry.data);
    const local = new Uint8Array(30 + name.length + entry.data.length);
    const lv = new DataView(local.buffer);
    lv.setUint32(0, 0x04034b50, true);
    lv.setUint16(4, 20, true); // version needed: 2.0
    lv.setUint16(6, 0, true); // flags
    lv.setUint16(8, 0, true); // method: stored
    lv.setUint16(10, DOS_TIME, true);
    lv.setUint16(12, DOS_DATE, true);
    lv.setUint32(14, crc, true);
    lv.setUint32(18, entry.data.length, true);
    lv.setUint32(22, entry.data.length, true);
    lv.setUint16(26, name.length, true);
    lv.setUint16(28, 0, true);
    local.set(name, 30);
    local.set(entry.data, 30 + name.length);

    const central = new Uint8Array(46 + name.length);
    const cv = new DataView(central.buffer);
    cv.setUint32(0, 0x02014b50, true);
    cv.setUint16(4, 20, true); // version made by
    cv.setUint16(6, 20, true); // version needed
    cv.setUint16(8, 0, true);
    cv.setUint16(10, 0, true); // method: stored
    cv.setUint16(12, DOS_TIME, true);
    cv.setUint16(14, DOS_DATE, true);
    cv.setUint32(16, crc, true);
    cv.setUint32(20, entry.data.length, true);
    cv.setUint32(24, entry.data.length, true);
    cv.setUint16(28, name.length, true);
    cv.setUint16(30, 0, true); // extra
    cv.setUint16(32, 0, true); // comment
    cv.setUint16(34, 0, true); // disk
    cv.setUint16(36, 0, true); // internal attributes
    cv.setUint32(38, 0, true); // external attributes
    cv.setUint32(42, offset, true);
    central.set(name, 46);

    locals.push(local);
    centrals.push(central);
    offset += local.length;
  }
  const directory = concat(centrals);
  const end = new Uint8Array(22);
  const ev = new DataView(end.buffer);
  ev.setUint32(0, 0x06054b50, true);
  ev.setUint16(8, entries.length, true);
  ev.setUint16(10, entries.length, true);
  ev.setUint32(12, directory.length, true);
  ev.setUint32(16, offset, true);
  return concat([...locals, directory, end]);
}

/**
 * A one-sheet workbook: the first row is a bold, frozen header, every other row a record. Text is
 * written as an inline string (never a formula), numbers as numbers.
 */
export function buildXlsx(name: string, rows: CellValue[][]): Uint8Array {
  const parts: { name: string; data: Uint8Array }[] = [
    { name: '[Content_Types].xml', data: encoder.encode(contentTypes(true)) },
    { name: '_rels/.rels', data: encoder.encode(rootRels) },
    { name: 'xl/workbook.xml', data: encoder.encode(workbook(sheetName(name))) },
    { name: 'xl/_rels/workbook.xml.rels', data: encoder.encode(workbookRels) },
    { name: 'xl/styles.xml', data: encoder.encode(styles) },
    { name: 'xl/worksheets/sheet1.xml', data: encoder.encode(sheetXml(rows)) },
  ];
  return zip(parts);
}
