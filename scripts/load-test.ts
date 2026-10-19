// Load test of the live edge and engine before a launch. Fires N scans at once through the
// study path (rows tagged study:loadtest-<date>, so organic metrics never see them; no rate
// limit, no cache read) and reports latency and failures. Token: ~/.config/quantum-ready-labs/study-token.
//   bun run scripts/load-test.ts [--concurrency 24] [--rounds 1] [--origin https://quantumreadylabs.com]
import { homedir } from 'node:os';
import { join } from 'node:path';

const args = process.argv.slice(2);
const flag = (name: string, fallback: string) => (args.includes(name) ? args[args.indexOf(name) + 1] : fallback);
const concurrency = Number(flag('--concurrency', '24'));
const rounds = Number(flag('--rounds', '1'));
const origin = flag('--origin', 'https://quantumreadylabs.com');
const slug = `loadtest-${new Date().toISOString().slice(0, 10)}`;
const token = (await Bun.file(join(homedir(), '.config/quantum-ready-labs/study-token')).text()).trim();

// Public hosts of every stage, enough for the concurrency asked; cycled if more are needed.
const HOSTS = [
  'cloudflare.com', 'google.com', 'example.com', 'manteiga.org', 'github.com', 'wikipedia.org', 'mozilla.org',
  'apple.com', 'microsoft.com', 'amazon.com', 'netflix.com', 'stripe.com', 'shopify.com', 'fastly.com',
  'akamai.com', 'digitalocean.com', 'vercel.com', 'netlify.com', 'heroku.com', 'gitlab.com', 'bitbucket.org',
  'docker.com', 'npmjs.com', 'pypi.org', 'rust-lang.org', 'python.org', 'nodejs.org', 'bun.sh', 'deno.com',
  'nist.gov', 'ietf.org', 'letsencrypt.org', 'eff.org', 'archive.org', 'w3.org', 'debian.org', 'ubuntu.com',
  'fedoraproject.org', 'kernel.org', 'openssl.org', 'curl.se', 'nginx.org', 'apache.org', 'caddyserver.com',
  'tls-v1-2.badssl.com:1012', 'badssl.com', 'quantumreadylabs.com', 'n30.ai',
];

interface Outcome { host: string; status: number; ms: number; stage?: string; error?: string }

async function one(host: string): Promise<Outcome> {
  const t0 = performance.now();
  try {
    const res = await fetch(`${origin}/api/study/scan`, {
      method: 'POST',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify({ host, study: slug, name: host }),
      signal: AbortSignal.timeout(60000),
    });
    const body = (await res.json().catch(() => ({}))) as { stage?: string; error?: string };
    return { host, status: res.status, ms: Math.round(performance.now() - t0), stage: body.stage, error: body.error };
  } catch (e) {
    return { host, status: 0, ms: Math.round(performance.now() - t0), error: (e as Error).message };
  }
}

const pct = (xs: number[], p: number) => xs.slice().sort((a, b) => a - b)[Math.min(xs.length - 1, Math.floor((p / 100) * xs.length))];

console.log(`${origin}  study=${slug}  concurrency=${concurrency}  rounds=${rounds}`);
for (let r = 1; r <= rounds; r++) {
  const hosts = Array.from({ length: concurrency }, (_, i) => HOSTS[(i + (r - 1) * concurrency) % HOSTS.length]);
  const t0 = performance.now();
  const out = await Promise.all(hosts.map(one));
  const wall = Math.round(performance.now() - t0);
  const ok = out.filter((o) => o.status === 200);
  const byStatus = out.reduce<Record<string, number>>((m, o) => ((m[o.status] = (m[o.status] ?? 0) + 1), m), {});
  const ms = ok.map((o) => o.ms);
  console.log(`round ${r}: ${ok.length}/${out.length} ok in ${wall} ms wall; status ${JSON.stringify(byStatus)}; p50 ${pct(ms, 50)} ms, p95 ${pct(ms, 95)} ms, max ${Math.max(...ms)} ms`);
  for (const o of out.filter((o) => o.status !== 200)) console.log(`  ${o.status}  ${o.host}  ${o.error ?? ''}`);
}
