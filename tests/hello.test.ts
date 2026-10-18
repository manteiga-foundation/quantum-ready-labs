import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { buildClientHello13, buildClientHello12, parseServerMessage, GROUP, CIPHER } from '../engine/hello';
import { exchange } from '../engine/socket';
import { startFixture, type Fixture } from './fixture-server';

const hex = (s: string) => Uint8Array.from(s.replace(/\s+/g, '').match(/../g)!.map((b) => parseInt(b, 16)));

describe('parseServerMessage', () => {
  test('a HelloRetryRequest names the selected group', () => {
    // record(handshake) > ServerHello with the HRR random, key_share(selected_group) and supported_versions
    const hrr = hex(
      '16 0303 0054' +
        '02 000050 0303' +
        'cf21ad74e59a6111be1d8c021e65b891c2a211167abb8c5e079e09e2c8a8339c' +
        '00' + // session id
        '1301 00' +
        '0028' + // extensions length 40
        '002b 0002 0304' + // supported_versions
        '0033 0002 11ec' + // key_share: selected_group X25519MLKEM768
        '002c 0018 ' + '00'.repeat(24), // cookie
    );
    expect(parseServerMessage(hrr)).toEqual({ kind: 'hrr', group: 0x11ec, version: 0x0304 });
  });

  test('an alert is reported with level and description', () => {
    expect(parseServerMessage(hex('15 0303 0002 02 28'))).toEqual({ kind: 'alert', level: 2, description: 40 });
  });

  test('a TLS 1.2 ServerHello is reported with its cipher and version', () => {
    const sh = hex(
      '16 0303 002a' +
        '02 000026 0303' +
        'ab'.repeat(32) +
        '00' +
        '009c 00',
    );
    expect(parseServerMessage(sh)).toEqual({ kind: 'serverhello', version: 0x0303, cipher: 0x9c, group: undefined });
  });

  test('an incomplete record returns null (keep reading)', () => {
    expect(parseServerMessage(hex('16 0303 0058 02 00'))).toBeNull();
  });

  test('a record that is not a handshake or an alert is an error', () => {
    expect(parseServerMessage(hex('17 0303 0001 00'))!.kind).toBe('error');
  });
});

describe('buildClientHello', () => {
  test('the hello is a TLS record carrying a ClientHello with the SNI host', () => {
    const hello = buildClientHello13({ host: 'example.com', groups: [GROUP.X25519MLKEM768] });
    expect(hello[0]).toBe(0x16);
    expect(hello[5]).toBe(0x01);
    expect(Buffer.from(hello).includes(Buffer.from('example.com'))).toBe(true);
    const length = (hello[3] << 8) | hello[4];
    expect(hello.length).toBe(5 + length);
  });

  test('an IP literal target sends no SNI (RFC 6066 forbids it)', () => {
    const hello = buildClientHello13({ host: '93.184.216.34', groups: [GROUP.x25519] });
    expect(Buffer.from(hello).includes(Buffer.from('93.184.216.34'))).toBe(false);
  });
});

describe('probes against the fixture TLS server (Bun.serve, BoringSSL)', () => {
  let fixture: Fixture;
  beforeAll(async () => {
    fixture = await startFixture();
  });
  afterAll(() => fixture.stop());

  test('a supported group answers HelloRetryRequest naming it', async () => {
    const out = await exchange({ address: '127.0.0.1', port: fixture.port }, buildClientHello13({ host: 'localhost', groups: [GROUP.x25519] }));
    expect(out).toMatchObject({ kind: 'hrr', group: GROUP.x25519 });
    expect(out.ms).toBeLessThan(2000);
  });

  test('the fixture supports hybrid key exchange (BoringSSL ships X25519MLKEM768)', async () => {
    const out = await exchange({ address: '127.0.0.1', port: fixture.port }, buildClientHello13({ host: 'localhost', groups: [GROUP.X25519MLKEM768] }));
    expect(out).toMatchObject({ kind: 'hrr', group: GROUP.X25519MLKEM768 });
  });

  test('an unsupported group answers an alert', async () => {
    const out = await exchange({ address: '127.0.0.1', port: fixture.port }, buildClientHello13({ host: 'localhost', groups: [GROUP.ffdhe2048] }));
    expect(out.kind).toBe('alert');
  });

  test('RSA key transport is refused by an ECDSA server', async () => {
    const out = await exchange({ address: '127.0.0.1', port: fixture.port }, buildClientHello12({ host: 'localhost', ciphers: CIPHER.RSA_TRANSPORT }));
    expect(out.kind).toBe('alert');
  });

  test('TLS 1.2 with ECDHE is still negotiated by the fixture', async () => {
    const out = await exchange({ address: '127.0.0.1', port: fixture.port }, buildClientHello12({ host: 'localhost', ciphers: CIPHER.ECDHE }));
    expect(out).toMatchObject({ kind: 'serverhello', version: 0x0303 });
  });

  test('a port nobody listens on is an error, not a hang', async () => {
    const out = await exchange({ address: '127.0.0.1', port: 1 }, buildClientHello13({ host: 'localhost', groups: [GROUP.x25519] }));
    expect(out.kind).toBe('error');
  });

  test('a server that never answers times out within the budget', async () => {
    const silent = Bun.listen({ hostname: '127.0.0.1', port: 0, socket: { data() {}, open() {} } });
    try {
      const out = await exchange({ address: '127.0.0.1', port: silent.port, timeoutMs: 300 }, buildClientHello13({ host: 'localhost', groups: [GROUP.x25519] }));
      expect(out).toMatchObject({ kind: 'error', message: 'timeout' });
      expect(out.ms).toBeGreaterThanOrEqual(290);
      expect(out.ms).toBeLessThan(1500);
    } finally {
      silent.stop(true);
    }
  });
});
