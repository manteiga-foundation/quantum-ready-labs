import { describe, expect, test } from 'bun:test';
import { buildXlsx } from '../web/src/xlsx';
import { parseStoredZip, text } from './zip';

// The export is a real Office Open XML workbook, written without a dependency: a stored-entry zip
// holding the five parts Excel, Numbers and Google Sheets all read. Every part is parsed back here,
// so a broken package fails in CI rather than in the maintainer's spreadsheet application.

const sheet = () => buildXlsx('Hosts', [['Host', 'Score'], ['a.example', 85]]);

describe('buildXlsx', () => {
  test('writes a zip holding the parts an .xlsx needs', () => {
    const entries = parseStoredZip(sheet());
    expect([...entries.keys()].sort()).toEqual([
      '[Content_Types].xml',
      '_rels/.rels',
      'xl/_rels/workbook.xml.rels',
      'xl/styles.xml',
      'xl/workbook.xml',
      'xl/worksheets/sheet1.xml',
    ]);
    expect(text(entries, '[Content_Types].xml')).toContain('spreadsheetml.sheet.main+xml');
    expect(text(entries, 'xl/workbook.xml')).toContain('<sheet name="Hosts"');
    expect(text(entries, '_rels/.rels')).toContain('xl/workbook.xml');
    expect(text(entries, 'xl/_rels/workbook.xml.rels')).toContain('worksheets/sheet1.xml');
  });

  test('the cells carry the values: strings as inline strings, numbers as numbers', () => {
    const xml = text(parseStoredZip(sheet()), 'xl/worksheets/sheet1.xml');
    expect(xml).toContain('<is><t>a.example</t></is>');
    expect(xml).toContain('<c r="B2"><v>85</v></c>');
    expect(xml).toContain('t="inlineStr"');
    // A number stays a number: no quote and no string type around it.
    expect(xml).not.toContain('<is><t>85</t></is>');
  });

  test('escapes what XML cannot carry, and never turns a value into a formula', () => {
    const xml = text(parseStoredZip(buildXlsx('Hosts', [['A & B <c> "d" \'e\'']])), 'xl/worksheets/sheet1.xml');
    expect(xml).toContain('A &amp; B &lt;c&gt; &quot;d&quot; \'e\'');
    expect(xml).not.toContain('<c>');
    const hostile = text(parseStoredZip(buildXlsx('Hosts', [['=1+1']])), 'xl/worksheets/sheet1.xml');
    expect(hostile).toContain('<is><t>=1+1</t></is>');
    expect(hostile).not.toContain('<f>');
  });

  test('a null or undefined cell is left empty rather than written as the word', () => {
    const xml = text(parseStoredZip(buildXlsx('Hosts', [['a', null, undefined, 'd']])), 'xl/worksheets/sheet1.xml');
    expect(xml).toContain('<c r="A1"');
    expect(xml).toContain('<c r="D1"');
    expect(xml).not.toContain('<c r="B1"');
    expect(xml).not.toContain('<c r="C1"');
    expect(xml).not.toContain('null');
    expect(xml).not.toContain('undefined');
  });

  test('a sheet name is cut to 31 characters and stripped of the characters the format forbids', () => {
    const long = text(parseStoredZip(buildXlsx('Hosts [test]: a/b\\c?d*e "f" 2026-10-18 extra words', [['x']])), 'xl/workbook.xml');
    const name = /<sheet name="([^"]*)"/.exec(long)![1];
    expect(name.length).toBeLessThanOrEqual(31);
    expect(name).not.toMatch(/[[\]:/?*"\\]/);
    expect(name.startsWith('Hosts test abcde f 2026')).toBe(true);
  });

  test('the header row is bold, frozen, and the columns are wide enough for their content', () => {
    const xml = text(parseStoredZip(sheet()), 'xl/worksheets/sheet1.xml');
    expect(xml).toContain('<pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/>');
    expect(xml).toContain('<c r="A1" s="1" t="inlineStr">');
    expect(xml).toMatch(/<col min="1" max="1" width="[\d.]+" customWidth="1"\/>/);
    const widths = [...xml.matchAll(/<col min="(\d+)" max="\d+" width="([\d.]+)"/g)].map((m) => Number(m[2]));
    expect(widths.length).toBe(2);
    expect(widths[0]).toBeGreaterThan(widths[1] ?? 0); // 'a.example' is longer than 'Score'/85
  });

  test('the same input makes the same bytes, so a re-export is reproducible', () => {
    expect(Array.from(buildXlsx('Hosts', [['a.example', 1]]))).toEqual(Array.from(buildXlsx('Hosts', [['a.example', 1]])));
  });

  test('column references go past Z', () => {
    const xml = text(parseStoredZip(buildXlsx('Hosts', [Array.from({ length: 28 }, (_, i) => i)])), 'xl/worksheets/sheet1.xml');
    expect(xml).toContain('<c r="Z1"');
    expect(xml).toContain('<c r="AA1"');
    expect(xml).toContain('<c r="AB1"');
  });
});
