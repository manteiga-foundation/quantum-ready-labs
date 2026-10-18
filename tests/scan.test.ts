import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { scan, type ScanEvent } from '../engine/scan';
import { startFixture, type Fixture } from './fixture-server';
import { TargetError } from '../engine/target';

describe('scan against the fixture', () => {
  let fixture: Fixture;
  beforeAll(async () => {
    fixture = await startFixture();
  });
  afterAll(() => fixture.stop());

  test('streams one event per probe and ends with the findings and the assessment', async () => {
    const events: ScanEvent[] = [];
    const result = await scan({ host: 'localhost', port: fixture.port }, { allowPrivate: true, onEvent: (e) => events.push(e) });

    expect(events[0]).toMatchObject({ type: 'start', target: { host: 'localhost', port: fixture.port }, address: '127.0.0.1' });
    const probes = events.filter((e) => e.type === 'probe');
    expect(probes.length).toBeGreaterThanOrEqual(12);
    expect(probes.find((p) => p.type === 'probe' && p.id === 'modern')).toMatchObject({ group: 'X25519MLKEM768', version: '1.3' });
    expect(events.filter((e) => e.type === 'connection')).toHaveLength(1);
    expect(events.at(-1)).toMatchObject({ type: 'done' });

    expect(result.findings.groups.X25519MLKEM768).toBe('yes');
    expect(result.findings.groups.ffdhe2048).toBe('no');
    expect(result.findings.tls13).toBe(true);
    expect(result.findings.tls12).toBe(true);
    expect(result.findings.rsaKeyTransport).toBe(false);
    expect(result.findings.connection).toMatchObject({ protocol: 'TLSv1.3' });
    expect(result.findings.chain).toHaveLength(1);
    expect(result.findings.chain[0]).toMatchObject({
      subject: 'localhost',
      keyAlgorithm: 'EC',
      keyDetail: 'P-256',
      signatureAlgorithm: 'ecdsa-with-SHA256',
      selfSigned: true,
    });
    expect(result.findings.trusted).toBe(false);
    expect(result.assessment.stage).toBe('protected');
    expect(result.ms).toBeLessThan(10000);
  });

  test('a private address is refused unless the caller allows it', async () => {
    await expect(scan({ host: 'localhost', port: fixture.port })).rejects.toBeInstanceOf(TargetError);
  });

  test('a closed port is reported as unreachable, not thrown', async () => {
    const result = await scan({ host: '127.0.0.1', port: 1 }, { allowPrivate: true });
    expect(result.assessment.stage).toBe('unreachable');
  });
});
