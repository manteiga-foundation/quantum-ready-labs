// The edge: validation, refusal list, rate limits, the result cache, link previews, metrics.
// Everything that is not a handshake. The engine behind it is never reachable from here without
// the shared token, and never receives a host this file has not resolved and judged.

import type { ScanResult } from '../../engine/events';
import { isCanonicalIpv4, isPublicAddress, parseTarget, TargetError } from '../../engine/target';
import { SCAN_FIXTURES } from '../../web/src/fixtures';
import { splitPath } from '../../web/src/i18n/locales';
import { STUDY_META, studyPreview } from '../../web/src/study-model';
import { localizePage, sitemapXml } from './locale-page';
import { addressesFromDoh, decideRateLimit, escapeAttr, isFresh, newShareId, previewFor, scanError, studyClient, type RateKind } from './policy';

export interface Env {
  DB: D1Database;
  ASSETS: Fetcher;
  ENGINE_URL: string;
  ENGINE_TOKEN: string;
  RENDER_URL: string;
  RENDER_TOKEN: string;
  /** Lets the maintainer's batch script scan a named population; rows are tagged study:<slug>. */
  STUDY_TOKEN: string;
  PUBLIC_ORIGIN: string;
  ALLOWED_PORTS: string;
}

const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store', ...headers } });

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    const { pathname } = url;
    if (url.hostname.startsWith('www.')) {
      url.hostname = url.hostname.slice(4);
      return Response.redirect(url.toString(), 301);
    }

    // The API is open to other services and agents: CORS without conditions, a preflight that says so.
    if (pathname.startsWith('/api/') && request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
    if (pathname.startsWith('/api/')) {
      const res = await api(pathname, request, env, ctx);
      const out = new Response(res.body, res); // cached responses carry immutable headers
      for (const [k, v] of Object.entries(CORS)) out.headers.set(k, v);
      return out;
    }


    if (pathname === '/sitemap.xml') {
      const origin = env.PUBLIC_ORIGIN || url.origin;
      return new Response(sitemapXml(origin, Object.keys(STUDY_META)), { headers: { 'content-type': 'application/xml; charset=utf-8', 'cache-control': 'public, max-age=3600' } });
    }

    // Pages: the same views under every language prefix (/es/, /pt/ ...); English has none.
    const { rest } = splitPath(pathname);
    const shared = rest.match(/^\/r\/([A-Za-z0-9_-]{12})$/);
    if (shared && request.method === 'GET') {
      warmRenderer(env, ctx);
      return sharedPage(shared[1], request, env);
    }

    const study = rest.match(/^\/studies\/([a-z0-9-]+)$/);
    if (study && request.method === 'GET') return studyPage(study[1], request, env);

    if (rest === '/metrics') {
      // Cloudflare Access fronts this path; this is the belt to its braces.
      if (!request.headers.get('cf-access-jwt-assertion') && !isLocal(request)) return new Response('Forbidden', { status: 403 });
    }
    const asset = await env.ASSETS.fetch(request);
    // Every HTML page is the one index; give it the words of the path's language.
    if (asset.headers.get('content-type')?.includes('text/html')) return localizePage(asset, pathname, env.PUBLIC_ORIGIN || url.origin);
    return asset;
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
      return json({ error: e.message, code: e.code }, 400);
    }
    throw e;
  }
  const allowedPorts = (env.ALLOWED_PORTS ?? '443').split(',').map((p) => Number(p.trim()));
  if (!allowedPorts.includes(target.port)) {
    ctx.waitUntil(recordFailure(env, 'Port not allowed', String(target.port), target.port));
    return json(scanError('port-not-allowed', { port: target.port, allowed: allowedPorts }), 400);
  }

  const ip = clientIp(request);
  const callerLimit = await rateCheck(env, 'caller', ip);
  if (!callerLimit.allowed) return json(scanError('rate-caller'), 429, { 'retry-after': String(callerLimit.retryAfterS) });

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
  if (!hostLimit.allowed) return json(scanError('rate-host'), 429, { 'retry-after': String(hostLimit.retryAfterS) });

  // Resolve here and judge every address; the engine judges again. Belt and braces.
  const addresses = await resolvePublic(target.host);
  if (addresses.length === 0) {
    ctx.waitUntil(recordFailure(env, 'Host does not resolve', target.host, target.port));
    return json(scanError('no-address', { host: target.host }), 400);
  }
  const refused = addresses.find((a) => !isPublicAddress(a));
  if (refused) {
    ctx.waitUntil(recordFailure(env, 'Refused: not a public address', null, target.port));
    return json(scanError('not-public', { host: target.host, address: refused }), 400);
  }

  const upstream = await fetch(`${env.ENGINE_URL}/scan`, {
    method: 'POST',
    headers: { authorization: `Bearer ${env.ENGINE_TOKEN}`, 'content-type': 'application/json' },
    body: JSON.stringify({ host: target.host, port: target.port }),
  });
  if (!upstream.ok || !upstream.body) {
    const detail = (await upstream.json().catch(() => ({}))) as { error?: string };
    const busy = upstream.status === 429;
    ctx.waitUntil(recordFailure(env, busy ? 'Engine busy' : 'Engine refused', detail.error ?? String(upstream.status), target.port));
    // The engine says "busy" in one word; the reader gets the sentence and a 429 with Retry-After.
    return json(busy ? scanError('engine-busy') : detail.error ? { error: detail.error } : scanError('engine-failed'), busy ? 429 : 502, busy ? { 'retry-after': '3' } : {});
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

/**
 * A study scan: the maintainer's batch tool scanning a named population. No rate limit, no cache
 * read, and the row is tagged `study:<slug>` so it never counts as organic use. Answers when the
 * scan is complete.
 */
async function studyScanRoute(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
  if (!env.STUDY_TOKEN || request.headers.get('authorization') !== `Bearer ${env.STUDY_TOKEN}`) return json({ error: 'unauthorized' }, 401);
  let body: { host?: unknown; study?: unknown; name?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return json({ error: 'The request body must be JSON.' }, 400);
  }
  const client = studyClient(body.study);
  if (!client) return json({ error: 'study must be a slug: lower-case letters, digits and dashes' }, 400);
  if (typeof body.host !== 'string') return json({ error: 'host is required' }, 400);
  let target;
  try {
    target = parseTarget(body.host);
  } catch (e) {
    if (e instanceof TargetError) return json({ error: e.message, refused: true }, 400);
    throw e;
  }
  const addresses = await resolvePublic(target.host);
  if (addresses.length === 0) return json({ error: `${target.host} does not resolve to any address.`, refused: true }, 400);
  const refused = addresses.find((a) => !isPublicAddress(a));
  if (refused) return json({ error: `${target.host} resolves to ${refused}, which is not a public Internet address.`, refused: true }, 400);

  const upstream = await fetch(`${env.ENGINE_URL}/scan`, {
    method: 'POST',
    headers: { authorization: `Bearer ${env.ENGINE_TOKEN}`, 'content-type': 'application/json' },
    body: JSON.stringify({ host: target.host, port: target.port }),
  });
  if (!upstream.ok) return json({ error: upstream.status === 429 ? 'The scanner is busy. Please try again in a moment.' : `engine answered ${upstream.status}` }, upstream.status === 429 ? 429 : 502, upstream.status === 429 ? { 'retry-after': '3' } : {});
  const lines = (await upstream.text()).split('\n').filter((l) => l.trim());
  const last = lines.length ? (JSON.parse(lines.at(-1)!) as { type: string; result?: ScanResult; error?: string }) : null;
  if (!last || last.type !== 'result' || !last.result) return json({ error: last?.error ?? 'the engine did not finish the scan' }, 502);
  const result = last.result;
  const id = newShareId();
  await env.DB.prepare('INSERT INTO scans (id, host, port, address, stage, score, ms, created_at, result, country, referrer, client, cache_hit) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)')
    .bind(id, target.host, target.port, result.address, result.assessment.stage, result.assessment.score, result.ms, Date.now(), JSON.stringify(result), null, typeof body.name === 'string' ? body.name.slice(0, 120) : null, client)
    .run();
  ctx.waitUntil(Promise.resolve());
  return json({ id, host: target.host, port: target.port, stage: result.assessment.stage, score: result.assessment.score, nextStep: result.assessment.nextStep.title, ms: result.ms });
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

const CORS: Record<string, string> = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET, POST, OPTIONS',
  'access-control-allow-headers': 'content-type, accept, authorization',
  'access-control-expose-headers': 'content-disposition, retry-after',
  'access-control-max-age': '86400',
};

async function api(pathname: string, request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
  const url = new URL(request.url);
  if (pathname === '/api/scan' && request.method === 'POST') {
    warmRenderer(env, ctx);
    const res = await scanRoute(request, env, ctx);
    return wantsOneAnswer(request) ? oneAnswer(res, url.origin, env) : res;
  }
  if (pathname === '/api/scan' && request.method === 'GET') {
    // The shell form: curl 'https://quantumreadylabs.com/api/scan?host=example.com'
    const host = url.searchParams.get('host');
    if (!host) return json({ error: 'host is required: /api/scan?host=example.com' }, 400);
    warmRenderer(env, ctx);
    const asPost = new Request(request.url, { method: 'POST', headers: request.headers, body: JSON.stringify({ host }) });
    return oneAnswer(await scanRoute(asPost, env, ctx), url.origin, env);
  }
  if (pathname === '/api/study/scan' && request.method === 'POST') return studyScanRoute(request, env, ctx);
  if (pathname.startsWith('/api/result/') && request.method === 'GET') return resultRoute(pathname.slice('/api/result/'.length), env, ctx);
  const pdf = pathname.match(/^\/api\/report\/([A-Za-z0-9_-]+)\.pdf$/);
  if (pdf && request.method === 'GET') return reportPdfRoute(pdf[1], request, env, ctx);
  if (pathname === '/api/metrics' && request.method === 'GET') return metricsRoute(request, env);
  if (pathname === '/api/subscribe' && request.method === 'POST') return subscribeRoute(request, env);
  if (pathname === '/api/health') return json({ ok: true });
  return json({ error: 'not found', documentation: `${url.origin}/api`, openapi: `${url.origin}/openapi.json` }, 404);
}

/** `Accept: application/json` on POST /api/scan asks for the finished scan as one object instead of the event stream. */
function wantsOneAnswer(request: Request): boolean {
  const accept = request.headers.get('accept') ?? '';
  return accept.includes('application/json') && !accept.includes('x-ndjson');
}

/** Drains the scan's event stream and answers once: {id, url, pdf, cached, result}. Errors pass through untouched. */
async function oneAnswer(stream: Response, origin: string, env: Env): Promise<Response> {
  if (!stream.ok || !stream.body) return stream;
  const text = await stream.text();
  let result: ScanResult | null = null;
  let id: string | null = null;
  let cached = false;
  let error: string | null = null;
  for (const line of text.split('\n')) {
    if (!line.trim()) continue;
    try {
      const e = JSON.parse(line) as { type: string; result?: ScanResult; id?: string; cached?: boolean; error?: string };
      if (e.type === 'result' && e.result) result = e.result;
      else if (e.type === 'saved' && e.id) (id = e.id), (cached = !!e.cached);
      else if (e.type === 'error') error = e.error ?? 'scan failed';
    } catch {
      // not an event line
    }
  }
  if (!result || !id) return json({ error: error ?? 'The scan did not complete.' }, 502);
  const publicOrigin = env.PUBLIC_ORIGIN || origin;
  return json({ id, url: `${publicOrigin}/r/${id}`, pdf: `${publicOrigin}/api/report/${id}.pdf`, cached, result });
}

/** Wakes the render machine (it stops when idle) so the first PDF after a quiet spell is not a cold start. */
function warmRenderer(env: Env, ctx: ExecutionContext): void {
  if (!env.RENDER_URL) return;
  ctx.waitUntil(fetch(`${env.RENDER_URL}/health`, { signal: AbortSignal.timeout(20000) }).catch(() => undefined));
}

/** The PDF: the stored result rendered by the render service, cached per id (results never change). */
async function reportPdfRoute(id: string, request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
  // Every report served counts as a download, cached or rendered; the demo reports do not.
  if (!id.startsWith('demo-')) ctx.waitUntil(env.DB.prepare('INSERT INTO downloads (scan_id, created_at) VALUES (?, ?)').bind(id, Date.now()).run());
  const cache = caches.default;
  const cacheKey = new Request(new URL(request.url).toString(), { method: 'GET' });
  const hit = await cache.match(cacheKey);
  if (hit) return hit;

  let result: ScanResult | null = null;
  if (id.startsWith('demo-')) {
    result = SCAN_FIXTURES[id.slice(5)]?.result ?? null;
  } else if (/^[A-Za-z0-9_-]{12}$/.test(id)) {
    const row = await env.DB.prepare('SELECT result FROM scans WHERE id = ?').bind(id).first<{ result: string }>();
    result = row ? (JSON.parse(row.result) as ScanResult) : null;
  }
  if (!result) return json({ error: 'not found' }, 404);
  if (!env.RENDER_URL || !env.RENDER_TOKEN) return json({ error: 'The PDF renderer is not configured.' }, 503);

  const origin = env.PUBLIC_ORIGIN || new URL(request.url).origin;
  const upstream = await fetch(`${env.RENDER_URL}/pdf`, {
    method: 'POST',
    headers: { authorization: `Bearer ${env.RENDER_TOKEN}`, 'content-type': 'application/json' },
    body: JSON.stringify({ result, shareUrl: id.startsWith('demo-') ? null : `${origin}/r/${id}`, generatedAt: result.startedAt }),
  });
  if (!upstream.ok) {
    ctx.waitUntil(recordFailure(env, 'Render failed', String(upstream.status), null));
    return json({ error: 'The report could not be rendered right now. Please try again in a moment.' }, 502);
  }
  const response = new Response(upstream.body, {
    headers: {
      'content-type': 'application/pdf',
      'content-disposition': upstream.headers.get('content-disposition') ?? `attachment; filename="quantum-readiness-${id}.pdf"`,
      'cache-control': 'public, max-age=604800',
    },
  });
  ctx.waitUntil(cache.put(cacheKey, response.clone()));
  return response;
}

async function sharedPage(id: string, request: Request, env: Env): Promise<Response> {
  const row = await env.DB.prepare('SELECT result FROM scans WHERE id = ?').bind(id).first<{ result: string }>();
  const url = new URL(request.url);
  const origin = env.PUBLIC_ORIGIN || url.origin;
  const index = localizePage(await env.ASSETS.fetch(new Request(new URL('/', request.url), { headers: request.headers })), url.pathname, origin);
  if (!row) return index;
  const preview = previewFor(JSON.parse(row.result) as ScanResult, id, origin, splitPath(url.pathname).locale);
  return withPreview(index, preview, `<meta name="robots" content="noindex" data-shared="${escapeAttr(id)}">`);
}

/** A study's page: the index with the note's title, description and image, indexable. */
async function studyPage(slug: string, request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const origin = env.PUBLIC_ORIGIN || url.origin;
  const index = localizePage(await env.ASSETS.fetch(new Request(new URL('/', request.url), { headers: request.headers })), url.pathname, origin);
  const preview = studyPreview(slug, origin, splitPath(url.pathname).locale);
  if (!preview) return index;
  return withPreview(index, preview);
}

function withPreview(index: Response, preview: { title: string; description: string; image: string; url: string }, headExtra?: string): Response {
  const set = (attr: string, value: string) => ({
    element(el: Element) {
      el.setAttribute(attr, value);
    },
  });
  const rewriter = new HTMLRewriter()
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
    .on('link[rel="canonical"]', set('href', preview.url));
  if (headExtra) rewriter.on('head', { element: (el) => { el.append(headExtra, { html: true }); } });
  return rewriter.transform(index);
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
     FROM scans WHERE created_at >= ? AND client = 'web' GROUP BY day ORDER BY day`,
  )
    .bind(since)
    .all<{ day: string; scans: number; hosts: number; cache_hits: number; exposed: number; at_risk: number; protected: number; ready: number; odd: number }>();
  const failuresByDay = await env.DB.prepare(`SELECT date(created_at / 1000, 'unixepoch') AS day, COUNT(*) AS n FROM failures WHERE created_at >= ? GROUP BY day`).bind(since).all<{ day: string; n: number }>();
  const failures = await env.DB.prepare('SELECT reason, COUNT(*) AS count FROM failures WHERE created_at >= ? GROUP BY reason ORDER BY count DESC').bind(since).all<{ reason: string; count: number }>();
  const referrers = await env.DB.prepare("SELECT COALESCE(referrer, 'Direct') AS source, COUNT(*) AS count FROM scans WHERE created_at >= ? AND client = 'web' GROUP BY source ORDER BY count DESC LIMIT 8").bind(since).all<{ source: string; count: number }>();
  const countries = await env.DB.prepare("SELECT COALESCE(country, 'Unknown') AS country, COUNT(*) AS count FROM scans WHERE created_at >= ? AND client = 'web' GROUP BY country ORDER BY count DESC LIMIT 8").bind(since).all<{ country: string; count: number }>();
  const timings = await env.DB.prepare("SELECT ms FROM scans WHERE created_at >= ? AND cache_hit = 0 AND ms IS NOT NULL AND client = 'web' ORDER BY ms").bind(now - 86400_000).all<{ ms: number }>();
  const studies = await env.DB.prepare(
    `SELECT substr(client, 7) AS study, COUNT(*) AS scans, COUNT(DISTINCT host) AS hosts, MIN(created_at) AS firstAt, MAX(created_at) AS lastAt,
            SUM(stage = 'exposed') AS exposed, SUM(stage = 'at-risk') AS at_risk, SUM(stage = 'protected') AS protected, SUM(stage = 'ready') AS ready, SUM(stage = 'unreachable' OR stage = 'inconclusive') AS odd
     FROM scans WHERE client LIKE 'study:%' GROUP BY client ORDER BY lastAt DESC`,
  ).all<{ study: string; scans: number; hosts: number; firstAt: number; lastAt: number; exposed: number; at_risk: number; protected: number; ready: number; odd: number }>();
  const opens = await env.DB.prepare('SELECT COUNT(*) AS n FROM opens WHERE created_at >= ?').bind(since).first<{ n: number }>();
  const downloads = await env.DB.prepare('SELECT COUNT(*) AS n FROM downloads WHERE created_at >= ?').bind(since).first<{ n: number }>();
  const scores = await env.DB.prepare("SELECT score FROM scans WHERE created_at >= ? AND cache_hit = 0 AND client = 'web' AND stage IN ('exposed','at-risk','protected','ready') ORDER BY score").bind(since).all<{ score: number }>();
  const medianScore = scores.results.length ? scores.results[Math.floor(scores.results.length / 2)].score : 0;
  const countryCount = await env.DB.prepare("SELECT COUNT(DISTINCT country) AS n FROM scans WHERE created_at >= ? AND client = 'web' AND country IS NOT NULL").bind(since).first<{ n: number }>();
  const subscriptions = await env.DB.prepare('SELECT email, host, created_at AS createdAt FROM subscriptions ORDER BY created_at DESC LIMIT 200').all<{ email: string; host: string; createdAt: number }>();
  const ports = await env.DB.prepare("SELECT detail, COUNT(*) AS n FROM failures WHERE reason = 'Port not allowed' AND created_at >= ? GROUP BY detail ORDER BY n DESC LIMIT 5").bind(since).all<{ detail: string; n: number }>();

  const hosts = await env.DB.prepare(
    `SELECT s.host, s.port, s.stage, s.score, s.id AS lastId, s.created_at AS lastAt,
            (SELECT COUNT(*) FROM scans c WHERE c.host = s.host AND c.port = s.port AND c.created_at >= ? AND c.client = 'web') AS scans
     FROM scans s
     WHERE s.cache_hit = 0 AND s.created_at >= ? AND s.client = 'web'
       AND s.created_at = (SELECT MAX(created_at) FROM scans m WHERE m.host = s.host AND m.port = s.port AND m.cache_hit = 0 AND m.client = 'web')
     ORDER BY s.created_at DESC LIMIT 300`,
  )
    .bind(since, since)
    .all<{ host: string; port: number; stage: string; score: number; lastId: string; lastAt: number; scans: number }>();

  const failMap = new Map(failuresByDay.results.map((r) => [r.day, r.n]));
  const sorted = timings.results.map((t) => t.ms);
  const pct = (p: number) => (sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))] : 0);
  const totals = days.results.reduce((t, d) => ({ scans: t.scans + d.scans, hosts: t.hosts + d.hosts, cacheHits: t.cacheHits + (d.cache_hits ?? 0), failures: t.failures + (failMap.get(d.day) ?? 0) }), { scans: 0, hosts: 0, cacheHits: 0, failures: 0 });
  for (const [day, n] of failMap) if (!days.results.some((d) => d.day === day)) totals.failures += n;

  return json({
    generatedAt: new Date(now).toISOString(),
    totals: { ...totals, sharedOpens: opens?.n ?? 0, pdfDownloads: downloads?.n ?? 0, medianScore, countries: countryCount?.n ?? 0, subscriptions: subscriptions.results.length },
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
    hosts: hosts.results.map((h) => ({ ...h, lastAt: new Date(h.lastAt).toISOString() })),
    subscriptions: subscriptions.results.map((r) => ({ email: r.email, host: r.host, createdAt: new Date(r.createdAt).toISOString() })),
    studies: studies.results.map((st) => ({
      study: st.study,
      scans: st.scans,
      hosts: st.hosts,
      firstAt: new Date(st.firstAt).toISOString(),
      lastAt: new Date(st.lastAt).toISOString(),
      stages: { exposed: st.exposed, 'at-risk': st.at_risk, protected: st.protected, ready: st.ready, other: st.odd },
    })),
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
