import { describe, expect, test } from 'bun:test';
import { addressesFromDoh, decideRateLimit, isFresh, newShareId, previewFor, RATE_LIMITS, scanError, studyClient } from '../worker/src/policy';
import protectedFixture from '../web/src/fixtures/protected.json';

describe('edge policy', () => {
  test('DNS-over-HTTPS answers are reduced to addresses, CNAMEs skipped', () => {
    const doh = { Status: 0, Answer: [{ name: 'www.example.', type: 5, data: 'example.' }, { name: 'example.', type: 1, data: '93.184.216.34' }, { name: 'example.', type: 28, data: '2606:2800:21f:cb07:6820:80da:af6b:8b2c' }] };
    expect(addressesFromDoh(doh)).toEqual(['93.184.216.34', '2606:2800:21f:cb07:6820:80da:af6b:8b2c']);
    expect(addressesFromDoh({ Status: 3 })).toEqual([]);
  });

  test('rate limits: a caller gets a burst, then waits; a host is not hammered either', () => {
    const now = 1_000_000;
    expect(decideRateLimit({ kind: 'caller', count: 0, windowStart: now, now })).toEqual({ allowed: true });
    expect(decideRateLimit({ kind: 'caller', count: RATE_LIMITS.caller.max, windowStart: now, now })).toMatchObject({ allowed: false });
    const retry = decideRateLimit({ kind: 'caller', count: RATE_LIMITS.caller.max, windowStart: now, now }) as { allowed: false; retryAfterS: number };
    expect(retry.retryAfterS).toBeGreaterThan(0);
    // The window expired: counting starts again.
    expect(decideRateLimit({ kind: 'caller', count: 999, windowStart: now - RATE_LIMITS.caller.windowS * 1000 - 1, now })).toEqual({ allowed: true, reset: true });
    expect(decideRateLimit({ kind: 'host', count: RATE_LIMITS.host.max, windowStart: now, now })).toMatchObject({ allowed: false });
  });

  test('a cached result is fresh for 24 hours', () => {
    const created = Date.parse('2026-10-18T10:00:00Z');
    expect(isFresh(created, Date.parse('2026-10-18T22:00:00Z'))).toBe(true);
    expect(isFresh(created, Date.parse('2026-10-19T10:00:01Z'))).toBe(false);
  });

  test('share ids are short, URL-safe and unpredictable', () => {
    const ids = new Set(Array.from({ length: 200 }, () => newShareId()));
    expect(ids.size).toBe(200);
    for (const id of ids) expect(id).toMatch(/^[A-Za-z0-9_-]{12}$/);
  });

  test('the link preview carries the host, the stage word and the verdict', () => {
    const p = previewFor(protectedFixture.result as never, 'abc123XYZ_-1', 'https://quantumreadylabs.com');
    expect(p.title).toBe('protected.example is PROTECTED · Quantum Ready Labs');
    expect(p.description).toContain('protected against future quantum decryption');
    expect(p.image).toBe('https://quantumreadylabs.com/og/protected.png');
    expect(p.url).toBe('https://quantumreadylabs.com/r/abc123XYZ_-1');
  });

  test('a shared link opened in another language previews in that language, at its own address', () => {
    const p = previewFor(protectedFixture.result as never, 'abc123XYZ_-1', 'https://quantumreadylabs.com', 'es');
    expect(p.title).toBe('protected.example está PROTEGIDO · Quantum Ready Labs');
    expect(p.description).toContain('protegidas frente al descifrado cuántico futuro');
    expect(p.description).toContain('Siguiente paso: Retire los conjuntos de cifrado');
    expect(p.url).toBe('https://quantumreadylabs.com/es/r/abc123XYZ_-1');
  });

  test('a refusal carries English words for scripts and a code with params for the page', () => {
    expect(scanError('port-not-allowed', { port: 8443, allowed: [443] })).toEqual({
      error: 'The public scanner tests port 443 only. Port 8443 was asked for and noted.',
      code: 'port-not-allowed',
      params: { port: 8443, allowed: [443] },
    });
    expect(scanError('rate-caller')).toEqual({ error: 'Too many scans from your address. Please wait a few minutes.', code: 'rate-caller', params: {} });
    expect(scanError('not-public', { host: 'a.example', address: '10.0.0.1' }).error).toBe(
      'a.example resolves to 10.0.0.1, which is not a public Internet address. The public scanner tests only public hosts.',
    );
  });

  test('study rows are tagged by a strict slug so they never mix with organic scans', () => {
    expect(studyClient('florida-financial-2026q4')).toBe('study:florida-financial-2026q4');
    expect(studyClient('Web')).toBeNull();
    expect(studyClient('web')).toBe('study:web'); // still distinct from the organic client 'web'
    expect(studyClient('a')).toBeNull();
    expect(studyClient('drop table; --')).toBeNull();
    expect(studyClient(42)).toBeNull();
  });
});
