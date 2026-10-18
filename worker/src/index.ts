// The edge: validation, refusal list, rate limits, the result cache, link previews, metrics.
// Everything that is not a handshake. The engine behind it is never reachable from here without
// the shared token, and never receives a host this file has not resolved and judged.

import type { ScanResult } from '../../engine/events';
import { isCanonicalIpv4, isPublicAddress, parseTarget, TargetError } from '../../engine/target';
import { addressesFromDoh, decideRateLimit, escapeAttr, isFresh, newShareId, previewFor, type RateKind } from './policy';

export interface Env {
  DB: D1Database;
  ASSETS: Fetcher;
  ENGINE_URL: string;
  ENGINE_TOKEN: string;
  PUBLIC_ORIGIN: string;
  ALLOWED_PORTS: string;
}

const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store', ...headers } });

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    const { pathname } = url;

    if (pathname === '/api/scan' && request.method === 'POST') return scanRoute(request, env, ctx);
    if (pathname.startsWith('/api/result/') && request.method === 'GET') return resultRoute(pathname.slice('/api/result/'.length), env, ctx);
    if (pathname === '/api/metrics' && request.method === 'GET') return metricsRoute(request, env);
    if (pathname === '/api/subscribe' && request.method === 'POST') return subscribeRoute(request, env);
    if (pathname === '/api/health') return json({ ok: true });
    if (pathname.startsWith('/api/')) return json({ error: 'not found' }, 404);

    const shared = pathname.match(/^\/r\/([A-Za-z0-9_-]{12})$/);
    if (shared && request.method === 'GET') return sharedPage(shared[1], request, env);

    if (pathname === '/metrics') {
      // Cloudflare Access fronts this path; this is the belt to its braces.
      if (!request.headers.get('cf-access-jwt-assertion') && !isLocal(request)) return new Response('Forbidden', { status: 403 });
    }
    return env.ASSETS.fetch(request);
  },
};

function isLocal(request: Request): boolean {
  const host = new URL(request.url).hostname;
  return host === 'localhost' || host === '127.0.0.1';
}

function clientIp(request: Request): string {
  return request.headers.get('cf-connecting-ip') ?? '0.0.0.0';
}

async function rateCheck(env: Env, kind: RateKind, key: string): Promise<{ allowed: true } | { allowed: false; retryAfterS: number }> {
  const now = Date.now();
  const row = await env.DB.prepare('SELECT window_start, count FROM rate WHERE key = ?').bind(`${kind}:${key}`).first<{ window_start: number; count: number }>();
  const decision = decideRateLimit({ kind, count: row?.count ?? 0, windowStart: row?.window_start ?? now, now });
  if (!decision.allowed) return decision;
  if (!row || decision.reset) {
    await env.DB.prepare('INSERT OR REPLACE INTO rate (key, window_start, count) VALUES (?, ?, 1)').bind(`${kind}:${key}`, now).run();
  } else {
    await env.DB.prepare('UPDATE rate SET count = count + 1 WHERE key = ?').bind(`${kind}:${key}`).run();
  }
  return { allowed: true };
}

async function resolvePublic(host: string): Promise<string[]> {
  if (isCanonicalIpv4(host) || host.includes(':')) return [host];
  const lookup = async (type: 'A' | 'AAAA') => {
    const res = await fetch(`https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(host)}&type=${type}`, { headers: { accept: 'application/dns-json' } });
    if (!res.ok) return [];
    return addressesFromDoh((await res.json()) as { Status: number; Answer?: { type: number; data: string }[] });
  };
  const [a, aaaa] = await Promise.all([lookup('A'), lookup('AAAA')]);
  return [...a, ...aaaa];
}

async function recordFailure(env: Env, reason: string, detail: string | null, port: number | null): Promise<void> {
  await env.DB.prepare('INSERT INTO failures (created_at, reason, detail, port) VALUES (?, ?, ?, ?)').bind(Date.now(), reason, detail, port).run();
}

async function scanRoute(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
  let body: { host?: unknown };
  try {
    body = (await request.json()) as { host?: unknown };
  } catch {
    return json({ error: 'The request body must be JSON.' }, 400);
  }
  if (typeof body.host !== 'string') return json({ error: 'host is required' }, 400);

  let target;
  try {
    target = parseTarget(body.host);
  } catch (e) {
    if (e instanceof TargetError) {
      ctx.waitUntil(recordFailure(env, 'Invalid target', e.message, null));
      return json({ error: e.message }, 400);
    }
    throw e;
  }
  const allowedPorts = (env.ALLOWED_PORTS ?? '443').split(',').map((p) => Number(p.trim()));
  if (!allowedPorts.includes(target.port)) {
    ctx.waitUntil(recordFailure(env, 'Port not allowed', String(target.port), target.port));
    return json({ error: `The public scanner tests port${allowedPorts.length > 1 ? 's' : ''} ${allowedPorts.join(', ')} only. Port ${target.port} was asked for and noted.` }, 400);
  }

  const ip = clientIp(request);
  const callerLimit = await rateCheck(env, 'caller', ip);
  if (!callerLimit.allowed) return json({ error: 'Too many scans from your address. Please wait a few minutes.' }, 429, { 'retry-after': String(callerLimit.retryAfterS) });

  const hostKey = `${target.host}:${target.port}`;
  const encoder = new TextEncoder();
  const country = request.headers.get('cf-ipcountry');
  const referrer = refererHost(request.headers.get('referer'));

  // The cache: a fresh result for this host is answered at once, as a two-line stream.
  const cached = await env.DB.prepare('SELECT id, created_at, result FROM scans WHERE host = ? AND port = ? AND cache_hit = 0 ORDER BY created_at DESC LIMIT 1')
    .bind(target.host, target.port)
    .first<{ id: string; created_at: number; result: string }>();
  if (cached && isFresh(cached.created_at, Date.now())) {
    ctx.waitUntil(
      env.DB.prepare('INSERT INTO scans (id, host, port, address, stage, score, ms, created_at, result, country, referrer, client, cache_hit) SELECT ?, host, port, address, stage, score, ms, ?, result, ?, ?, ?, 1 FROM scans WHERE id = ?')
        .bind(newShareId(), Date.now(), country, referrer, 'web', cached.id)
        .run(),
    );
    const lines = [JSON.stringify({ type: 'result', result: JSON.parse(cached.result) }), JSON.stringify({ type: 'saved', id: cached.id, cached: true })];
    return new Response(encoder.encode(lines.join('\n') + '\n'), { headers: { 'content-type': 'application/x-ndjson', 'cache-control': 'no-store' } });
  }

  const hostLimit = await rateCheck(env, 'host', hostKey);
  if (!hostLimit.allowed) return json({ error: 'This host was tested several times in the last minutes. The last result is shown when it is fresh; please try again shortly.' }, 429, { 'retry-after': String(hostLimit.retryAfterS) });

  // Resolve here and judge every address; the engine judges again. Belt and braces.
  const addresses = await resolvePublic(target.host);
  if (addresses.length === 0) {
    ctx.waitUntil(recordFailure(env, 'Host does not resolve', target.host, target.port));
    return json({ error: `${target.host} does not resolve to any address.` }, 400);
  }
  const refused = addresses.find((a) => !isPublicAddress(a));
  if (refused) {
    ctx.waitUntil(recordFailure(env, 'Refused: not a public address', null, target.port));
    return json({ error: `${target.host} resolves to ${refused}, which is not a public Internet address. The public scanner tests only public hosts.` }, 400);
  }

  const upstream = await fetch(`${env.ENGINE_URL}/scan`, {
    method: 'POST',
    headers: { authorization: `Bearer ${env.ENGINE_TOKEN}`, 'content-type': 'application/json' },
    body: JSON.stringify({ host: target.host, port: target.port }),
  });
  if (!upstream.ok || !upstream.body) {
    const detail = (await upstream.json().catch(() => ({}))) as { error?: string };
    ctx.waitUntil(recordFailure(env, upstream.status === 429 ? 'Engine busy' : 'Engine refused', detail.error ?? String(upstream.status), target.port));
    return json({ error: detail.error ?? 'The scanner is busy. Please try again in a moment.' }, upstream.status === 429 ? 429 : 502);
  }

  // Pass the stream through, keep the result, append the share id when it arrives.
  const id = newShareId();
  let buffer = '';
  let result: ScanResult | null = null;
  const decoder = new TextDecoder();
  const transform = new TransformStream<Uint8Array, Uint8Array>({
    transform(chunk, controller) {
      controller.enqueue(chunk);
      buffer += decoder.decode(chunk, { stream: true });
      let nl: number;
      while ((nl = buffer.indexOf('\n')) !== -1) {
        const line = buffer.slice(0, nl).trim();
        buffer = buffer.slice(nl + 1);
        if (!line) continue;
        try {
          const event = JSON.parse(line) as { type: string; result?: ScanResult; error?: string };
          if (event.type === 'result' && event.result) {
            result = event.result;
            controller.enqueue(encoder.encode(JSON.stringify({ type: 'saved', id }) + '\n'));
          } else if (event.type === 'error') {
            ctx.waitUntil(recordFailure(env, 'Engine error', event.error ?? null, target.port));
          }
        } catch {
          // a partial line; the next chunk completes it
        }
      }
    },
    flush() {
      if (result) {
        ctx.waitUntil(
          env.DB.prepare('INSERT INTO scans (id, host, port, address, stage, score, ms, created_at, result, country, referrer, client, cache_hit) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)')
            .bind(id, target.host, target.port, result.address, result.assessment.stage, result.assessment.score, result.ms, Date.now(), JSON.stringify(result), country, referrer, 'web')
            .run(),
        );
        if (result.assessment.stage === 'unreachable') ctx.waitUntil(recordFailure(env, 'Port closed or no TLS', target.host, target.port));
      }
    },
  });
  return new Response(upstream.body.pipeThrough(transform), { headers: { 'content-type': 'application/x-ndjson', 'cache-control': 'no-store' } });
}

function refererHost(referer: string | null): string | null {
  if (!referer) return null;
  try {
    return new URL(referer).hostname;
  } catch {
    return null;
  }
}

async function resultRoute(id: string, env: Env, ctx: ExecutionContext): Promise<Response> {
  if (!/^[A-Za-z0-9_-]{12}$/.test(id)) return json({ error: 'not found' }, 404);
  const row = await env.DB.prepare('SELECT result FROM scans WHERE id = ?').bind(id).first<{ result: string }>();
  if (!row) return json({ error: 'not found' }, 404);
  ctx.waitUntil(env.DB.prepare('INSERT INTO opens (scan_id, created_at) VALUES (?, ?)').bind(id, Date.now()).run());
  return new Response(row.result, { headers: { 'content-type': 'application/json', 'cache-control': 'public, max-age=300' } });
}

async function sharedPage(id: string, request: Request, env: Env): Promise<Response> {
  const row = await env.DB.prepare('SELECT result FROM scans WHERE id = ?').bind(id).first<{ result: string }>();
  const index = await env.ASSETS.fetch(new Request(new URL('/', request.url), { headers: request.headers }));
  if (!row) return index;
  const origin = env.PUBLIC_ORIGIN || new URL(request.url).origin;
  const preview = previewFor(JSON.parse(row.result) as ScanResult, id, origin);
  const set = (attr: string, value: string) => ({
    element(el: Element) {
      el.setAttribute(attr, value);
    },
  });
  return new HTMLRewriter()
    .on('title', { element: (el) => { el.setInnerContent(preview.title); } })
    .on('meta[name="description"]', set('content', preview.description))
    .on('meta[property="og:title"]', set('content', preview.title))
    .on('meta[property="og:description"]', set('content', preview.description))
    .on('meta[property="og:url"]', set('content', preview.url))
    .on('meta[property="og:image"]', set('content', preview.image))
    .on('meta[property="og:type"]', set('content', 'article'))
    .on('meta[name="twitter:title"]', set('content', preview.title))
    .on('meta[name="twitter:description"]', set('content', preview.description))
    .on('meta[name="twitter:image"]', set('content', preview.image))
    .on('link[rel="canonical"]', set('href', preview.url))
    .on('head', { element: (el) => { el.append(`<meta name="robots" content="noindex" data-shared="${escapeAttr(id)}">`, { html: true }); } })
    .transform(index);
}

async function metricsRoute(request: Request, env: Env): Promise<Response> {
  if (!request.headers.get('cf-access-jwt-assertion') && !isLocal(request)) return json({ error: 'forbidden' }, 403);
  const now = Date.now();
  const since = now - 30 * 86400_000;
  const days = await env.DB.prepare(
    `SELECT date(created_at / 1000, 'unixepoch') AS day,
            COUNT(*) AS scans,
            COUNT(DISTINCT host || ':' || port) AS hosts,
            SUM(cache_hit) AS cache_hits,
            SUM(stage = 'exposed') AS exposed, SUM(stage = 'at-risk') AS at_risk, SUM(stage = 'protected') AS protected, SUM(stage = 'ready') AS ready,
            SUM(stage = 'unreachable' OR stage = 'inconclusive') AS odd
     FROM scans WHERE created_at >= ? GROUP BY day ORDER BY day`,
  )
    .bind(since)
    .all<{ day: string; scans: number; hosts: number; cache_hits: number; exposed: number; at_risk: number; protected: number; ready: number; odd: number }>();
  const failuresByDay = await env.DB.prepare(`SELECT date(created_at / 1000, 'unixepoch') AS day, COUNT(*) AS n FROM failures WHERE created_at >= ? GROUP BY day`).bind(since).all<{ day: string; n: number }>();
  const failures = await env.DB.prepare('SELECT reason, COUNT(*) AS count FROM failures WHERE created_at >= ? GROUP BY reason ORDER BY count DESC').bind(since).all<{ reason: string; count: number }>();
  const referrers = await env.DB.prepare("SELECT COALESCE(referrer, 'Direct') AS source, COUNT(*) AS count FROM scans WHERE created_at >= ? GROUP BY source ORDER BY count DESC LIMIT 8").bind(since).all<{ source: string; count: number }>();
  const countries = await env.DB.prepare("SELECT COALESCE(country, 'Unknown') AS country, COUNT(*) AS count FROM scans WHERE created_at >= ? GROUP BY country ORDER BY count DESC LIMIT 8").bind(since).all<{ country: string; count: number }>();
  const timings = await env.DB.prepare('SELECT ms FROM scans WHERE created_at >= ? AND cache_hit = 0 AND ms IS NOT NULL ORDER BY ms').bind(now - 86400_000).all<{ ms: number }>();
  const opens = await env.DB.prepare('SELECT COUNT(*) AS n FROM opens WHERE created_at >= ?').bind(since).first<{ n: number }>();
  const ports = await env.DB.prepare("SELECT detail, COUNT(*) AS n FROM failures WHERE reason = 'Port not allowed' AND created_at >= ? GROUP BY detail ORDER BY n DESC LIMIT 5").bind(since).all<{ detail: string; n: number }>();

  const failMap = new Map(failuresByDay.results.map((r) => [r.day, r.n]));
  const sorted = timings.results.map((t) => t.ms);
  const pct = (p: number) => (sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))] : 0);
  const totals = days.results.reduce((t, d) => ({ scans: t.scans + d.scans, hosts: t.hosts + d.hosts, cacheHits: t.cacheHits + (d.cache_hits ?? 0), failures: t.failures + (failMap.get(d.day) ?? 0) }), { scans: 0, hosts: 0, cacheHits: 0, failures: 0 });
  for (const [day, n] of failMap) if (!days.results.some((d) => d.day === day)) totals.failures += n;

  return json({
    generatedAt: new Date(now).toISOString(),
    totals: { ...totals, sharedOpens: opens?.n ?? 0 },
    days: days.results.map((d) => ({
      date: d.day,
      scans: d.scans,
      hosts: d.hosts,
      stages: { exposed: d.exposed, 'at-risk': d.at_risk, protected: d.protected, ready: d.ready },
      failures: failMap.get(d.day) ?? 0,
      p50: 0,
      p95: 0,
    })),
    failures: failures.results,
    referrers: referrers.results,
    countries: countries.results,
    signals: [
      { label: 'Ports requested', detail: ports.results.length ? ports.results.map((p) => `${p.detail}: ${p.n}`).join(', ') : 'No port outside the allowlist was asked for.' },
      { label: 'Probe time, last 24 h', detail: sorted.length ? `p50 ${pct(50)} ms, p95 ${pct(95)} ms over ${sorted.length} fresh scans.` : 'No fresh scans in the last 24 hours.' },
    ],
    p50: pct(50),
    p95: pct(95),
  });
}

async function subscribeRoute(request: Request, env: Env): Promise<Response> {
  let body: { email?: unknown; host?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return json({ error: 'The request body must be JSON.' }, 400);
  }
  if (typeof body.email !== 'string' || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(body.email) || body.email.length > 254) return json({ error: 'A valid email is required.' }, 400);
  if (typeof body.host !== 'string' || body.host.length > 260) return json({ error: 'host is required' }, 400);
  await env.DB.prepare('INSERT INTO subscriptions (email, host, created_at) VALUES (?, ?, ?)').bind(body.email.toLowerCase(), body.host, Date.now()).run();
  return json({ ok: true });
}
