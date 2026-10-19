// Scans a named population through the edge's study endpoint and writes the results beside the
// list. Rows land tagged `study:<slug>`, apart from organic use.
//
//   bun run scripts/study.ts <slug> <list.csv> [--verify-only] [--origin https://quantumreadylabs.com]
//
// list.csv: name,domain[,note] with a header row. Output: studies/<slug>/results.csv with
// name, domain, stage, score, next step, share link, PDF link; refused rows carry the reason.
// Token: ~/.config/quantum-ready-labs/study-token (the Worker secret STUDY_TOKEN).

import { lookup } from 'node:dns/promises';
import { mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { parseTarget, TargetError } from '../engine/target';

const args = process.argv.slice(2);
const slug = args[0];
const listPath = args[1];
const verifyOnly = args.includes('--verify-only');
const origin = args.includes('--origin') ? args[args.indexOf('--origin') + 1] : 'https://quantumreadylabs.com';
if (!slug || !listPath || !/^[a-z0-9][a-z0-9-]{2,39}$/.test(slug)) {
  console.error('usage: bun run scripts/study.ts <slug> <list.csv> [--verify-only] [--origin URL]');
  process.exit(2);
}

interface Row {
  name: string;
  domain: string;
  note: string;
}

function parseCsv(text: string): Row[] {
  const lines = text.split('\n').map((l) => l.trim()).filter((l) => l && !l.startsWith('#'));
  const [, ...rows] = lines;
  return rows.map((l) => {
    const [name, domain, ...note] = l.split(',').map((c) => c.trim());
    return { name, domain, note: note.join(',') };
  });
}

function csvCell(v: unknown): string {
  const s = String(v ?? '');
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

const rows = parseCsv(await Bun.file(listPath).text());
const outDir = join('studies', slug);
mkdirSync(outDir, { recursive: true });

// Verification: every domain parses, resolves, and answers on 443 with a title we can read.
console.log(`${rows.length} rows in ${listPath}`);
const verified: (Row & { ok: boolean; reason: string; title: string })[] = [];
for (const row of rows) {
  let reason = '';
  let title = '';
  try {
    const target = parseTarget(row.domain);
    await lookup(target.host);
    const res = await fetch(`https://${target.host}/`, { redirect: 'follow', signal: AbortSignal.timeout(8000), headers: { 'user-agent': 'Mozilla/5.0 QuantumReadyLabs-study-verify' } });
    const html = await res.text();
    title = (html.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1] ?? '').replace(/\s+/g, ' ').trim().slice(0, 80);
    if (!res.ok && res.status !== 403) reason = `HTTP ${res.status}`;
  } catch (e) {
    const code = e && typeof e === 'object' && 'code' in e ? String((e as { code: unknown }).code) : '';
    const name = e && typeof e === 'object' && 'name' in e ? String((e as { name: unknown }).name) : '';
    reason = e instanceof TargetError ? e.message : name === 'TimeoutError' || code === '23' ? 'timeout' : code || String(e).slice(0, 60);
  }
  // A slow or bot-walled home page is not a reason to leave a host out; a bad name or no DNS is.
  const ok = !reason || reason === 'timeout' || reason === 'CERT_HAS_EXPIRED' || /^HTTP 4/.test(reason);
  verified.push({ ...row, ok, reason, title });
  console.log(`  ${ok ? 'ok' : 'x '}  ${row.domain.padEnd(32)} ${row.name.padEnd(40)} ${reason ? `(${reason}) ` : ''}${title}`);
}
await Bun.write(join(outDir, 'verified.csv'), ['name,domain,ok,reason,title', ...verified.map((v) => [v.name, v.domain, v.ok, v.reason, v.title].map(csvCell).join(','))].join('\n') + '\n');
console.log(`${verified.filter((v) => v.ok).length} of ${verified.length} verified -> ${outDir}/verified.csv`);
if (verifyOnly) process.exit(0);

const token = (await Bun.file(join(homedir(), '.config/quantum-ready-labs/study-token')).text()).trim();
const results: string[] = ['name,domain,stage,score,next_step,share,pdf,ms,error'];
let n = 0;
for (const row of verified.filter((v) => v.ok)) {
  const res = await fetch(`${origin}/api/study/scan`, {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify({ host: row.domain, study: slug, name: row.name }),
  });
  const body = (await res.json().catch(() => ({}))) as { id?: string; stage?: string; score?: number; nextStep?: string; ms?: number; error?: string };
  if (res.ok && body.id) {
    results.push([row.name, row.domain, body.stage, body.score, body.nextStep, `${origin}/r/${body.id}`, `${origin}/api/report/${body.id}.pdf`, body.ms, ''].map(csvCell).join(','));
    console.log(`  ${String(++n).padStart(3)}  ${row.domain.padEnd(32)} ${(body.stage ?? '').padEnd(10)} ${String(body.score).padStart(3)}  ${body.nextStep}`);
  } else {
    results.push([row.name, row.domain, '', '', '', '', '', '', body.error ?? `HTTP ${res.status}`].map(csvCell).join(','));
    console.log(`  err  ${row.domain.padEnd(32)} ${body.error ?? res.status}`);
  }
  await Bun.sleep(400);
}
await Bun.write(join(outDir, 'results.csv'), results.join('\n') + '\n');
console.log(`${n} scanned -> ${outDir}/results.csv`);
