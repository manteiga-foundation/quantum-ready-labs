// The engine's HTTP face: what the edge (and nothing else) calls. One route streams a scan as
// NDJSON so the report can build live. Never public: a shared token, a concurrency cap, and
// private addresses refused regardless of what the request says.

import { resolveTarget } from './resolve';
import { scan, type ScanEvent } from './scan';
import { parseTarget, TargetError } from './target';

export interface EngineServerOptions {
  port?: number;
  hostname?: string;
  /** Bearer token the edge must send. Required; an empty token refuses every scan. */
  token: string;
  /** Development and the CLI only. The entry point never sets it. */
  allowPrivate?: boolean;
  maxConcurrent?: number;
  /** Per-probe budget cap; requests may ask for less, never more. */
  maxTimeoutMs?: number;
}

export interface EngineServer {
  url: string;
  port: number;
  stop(): void;
}

export const ENGINE_VERSION = '0.1.0';

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

export function createEngineServer(options: EngineServerOptions): EngineServer {
  const { port = 8787, hostname = '0.0.0.0', token, allowPrivate = false, maxConcurrent = 8, maxTimeoutMs = 5000 } = options;
  let running = 0;

  const server = Bun.serve({
    hostname,
    port,
    idleTimeout: 30,
    async fetch(req) {
      const url = new URL(req.url);
      if (req.method === 'GET' && url.pathname === '/health') {
        return json({ ok: true, version: ENGINE_VERSION, running });
      }
      if (req.method === 'POST' && url.pathname === '/scan') {
        const auth = req.headers.get('authorization') ?? '';
        if (!token || auth !== `Bearer ${token}`) return json({ error: 'unauthorized' }, 401);
        if (running >= maxConcurrent) return json({ error: 'busy' }, 429);
        let body: { host?: unknown; port?: unknown; timeoutMs?: unknown };
        try {
          body = (await req.json()) as typeof body;
        } catch {
          return json({ error: 'The request body must be JSON.' }, 400);
        }
        if (typeof body.host !== 'string') return json({ error: 'host is required' }, 400);
        let target;
        try {
          target = parseTarget(typeof body.port === 'number' ? `${wrap(body.host)}:${body.port}` : body.host);
        } catch (e) {
          if (e instanceof TargetError) return json({ error: e.message }, 400);
          throw e;
        }
        const timeoutMs = Math.min(maxTimeoutMs, typeof body.timeoutMs === 'number' && body.timeoutMs > 0 ? body.timeoutMs : maxTimeoutMs);

        running++;
        const encoder = new TextEncoder();
        let release = () => {
          running--;
          release = () => {};
        };
        try {
          const stream = new ReadableStream<Uint8Array>({
            async start(controller) {
              const emit = (e: ScanEvent | { type: 'result'; result: unknown } | { type: 'error'; error: string }) =>
                controller.enqueue(encoder.encode(JSON.stringify(e) + '\n'));
              try {
                const result = await scan(target, { allowPrivate, timeoutMs, onEvent: emit });
                emit({ type: 'result', result });
              } catch (e) {
                if (e instanceof TargetError) {
                  // Resolution refused the host after the stream opened: say so in-band.
                  emit({ type: 'error', error: e.message });
                } else {
                  emit({ type: 'error', error: 'The scan failed inside the engine.' });
                  console.error(e);
                }
              } finally {
                release();
                controller.close();
              }
            },
            cancel() {
              release();
            },
          });
          // Resolve before streaming so a refused host is a plain 400 and never a 200 stream.
          try {
            await resolveTarget(target, { allowPrivate });
          } catch (e) {
            release();
            if (e instanceof TargetError) return json({ error: e.message }, 400);
            throw e;
          }
          return new Response(stream, { headers: { 'content-type': 'application/x-ndjson', 'cache-control': 'no-store' } });
        } catch (e) {
          release();
          throw e;
        }
      }
      return json({ error: 'not found' }, 404);
    },
  });

  return {
    url: `http://127.0.0.1:${server.port}`,
    port: server.port!,
    stop: () => server.stop(true),
  };
}

function wrap(host: string): string {
  return host.includes(':') && !host.startsWith('[') ? `[${host}]` : host;
}

if (import.meta.main) {
  const token = process.env.ENGINE_TOKEN ?? '';
  if (!token) {
    console.error('ENGINE_TOKEN is not set: every scan will be refused.');
  }
  const server = createEngineServer({
    port: Number(process.env.PORT ?? 8787),
    token,
    maxConcurrent: Number(process.env.ENGINE_MAX_CONCURRENT ?? 8),
  });
  console.log(`quantum-ready-labs engine ${ENGINE_VERSION} on ${server.url}`);
}
