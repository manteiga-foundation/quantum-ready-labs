import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { createEngineServer, type EngineServer } from '../engine/server';
import { startFixture, type Fixture } from './fixture-server';

async function readNdjson(res: Response): Promise<Record<string, unknown>[]> {
  const text = await res.text();
  return text
    .split('\n')
    .filter((l) => l.trim())
    .map((l) => JSON.parse(l));
}

describe('engine HTTP server', () => {
  let fixture: Fixture;
  let engine: EngineServer;
  let open: EngineServer;
  beforeAll(async () => {
    fixture = await startFixture();
    engine = createEngineServer({ port: 0, token: 'test-token', allowPrivate: true, maxConcurrent: 2 });
    open = createEngineServer({ port: 0, token: 'test-token' });
  });
  afterAll(() => {
    fixture.stop();
    engine.stop();
    open.stop();
  });

  test('health answers without a token', async () => {
    const res = await fetch(`${engine.url}/health`);
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true });
  });

  test('a scan without the token is refused', async () => {
    const res = await fetch(`${engine.url}/scan`, { method: 'POST', body: JSON.stringify({ host: 'localhost', port: fixture.port }) });
    expect(res.status).toBe(401);
  });

  test('a scan streams NDJSON events and ends with the result', async () => {
    const res = await fetch(`${engine.url}/scan`, {
      method: 'POST',
      headers: { authorization: 'Bearer test-token', 'content-type': 'application/json' },
      body: JSON.stringify({ host: '127.0.0.1', port: fixture.port }),
    });
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('application/x-ndjson');
    const lines = await readNdjson(res);
    expect(lines[0]).toMatchObject({ type: 'start' });
    expect(lines.filter((l) => l.type === 'probe').length).toBeGreaterThanOrEqual(12);
    const last = lines.at(-1)!;
    expect(last.type).toBe('result');
    expect((last.result as { assessment: { stage: string } }).assessment.stage).toBe('hybrid');
  });

  test('an invalid target is a 400 with the reason, not a stream', async () => {
    const res = await fetch(`${engine.url}/scan`, {
      method: 'POST',
      headers: { authorization: 'Bearer test-token', 'content-type': 'application/json' },
      body: JSON.stringify({ host: 'exa mple.com' }),
    });
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ error: expect.stringContaining('host name') });
  });

  test('the public engine never scans a private address, whatever the caller says', async () => {
    const res = await fetch(`${open.url}/scan`, {
      method: 'POST',
      headers: { authorization: 'Bearer test-token', 'content-type': 'application/json' },
      body: JSON.stringify({ host: '127.0.0.1', port: fixture.port, allowPrivate: true }),
    });
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ error: expect.stringContaining('not a public Internet address') });
  });

  test('more scans than the concurrency cap are answered 429', async () => {
    const silent = Bun.listen({ hostname: '127.0.0.1', port: 0, socket: { data() {}, open() {} } });
    try {
      const slow = () =>
        fetch(`${engine.url}/scan`, {
          method: 'POST',
          headers: { authorization: 'Bearer test-token', 'content-type': 'application/json' },
          body: JSON.stringify({ host: '127.0.0.1', port: silent.port, timeoutMs: 1500 }),
        });
      const a = slow();
      const b = slow();
      await Bun.sleep(100);
      const c = await slow();
      expect(c.status).toBe(429);
      const [ra, rb] = await Promise.all([a, b]);
      expect(ra.status).toBe(200);
      expect(rb.status).toBe(200);
      await Promise.all([ra.text(), rb.text()]);
    } finally {
      silent.stop(true);
    }
  });
});
