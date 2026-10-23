import { describe, expect, test } from 'bun:test';
import { parseTarget, isPublicAddress, TARGET_ERRORS, TargetError } from '../engine/target';

describe('parseTarget', () => {
  test('every refusal carries a code, so each language can say it in its own words', () => {
    const codeOf = (input: string) => {
      try {
        parseTarget(input);
        return null;
      } catch (e) {
        return e instanceof TargetError ? [e.code, e.message === TARGET_ERRORS[e.code as keyof typeof TARGET_ERRORS]] : 'other';
      }
    };
    expect(codeOf('')).toEqual(['empty', true]);
    expect(codeOf('http://example.com')).toEqual(['https-only', true]);
    expect(codeOf('0x7f.1')).toEqual(['ipv4-format', true]);
    expect(codeOf('[zz::1]')).toEqual(['ipv6-invalid', true]);
    expect(codeOf('example.com:0')).toEqual(['port', true]);
    expect(codeOf(`${'a'.repeat(60)}.`.repeat(5) + 'com')).toEqual(['too-long', true]);
    expect(codeOf('not a host')).toEqual(['invalid-host', true]);
  });

  test('a bare host defaults to port 443', () => {
    expect(parseTarget('example.com')).toEqual({ host: 'example.com', port: 443 });
  });

  test('host:port keeps the port', () => {
    expect(parseTarget('example.com:8443')).toEqual({ host: 'example.com', port: 8443 });
  });

  test('a pasted https URL is reduced to its host and port', () => {
    expect(parseTarget('https://Example.com/path?q=1')).toEqual({ host: 'example.com', port: 443 });
    expect(parseTarget('https://example.com:8443/')).toEqual({ host: 'example.com', port: 8443 });
  });

  test('a canonical IPv4 literal is accepted', () => {
    expect(parseTarget('93.184.216.34')).toEqual({ host: '93.184.216.34', port: 443 });
  });

  test('a bracketed IPv6 literal is accepted', () => {
    expect(parseTarget('[2606:2800:21f:cb07:6820:80da:af6b:8b2c]:443')).toEqual({
      host: '2606:2800:21f:cb07:6820:80da:af6b:8b2c',
      port: 443,
    });
  });

  test('non-canonical IPv4 notations are refused (octal, decimal, short forms)', () => {
    for (const odd of ['0177.0.0.1', '2130706433', '127.1', '0x7f.0.0.1', '127.0.0.01']) {
      expect(() => parseTarget(odd)).toThrow(TargetError);
    }
  });

  test('anything that is not a host name, an IP or a URL is refused', () => {
    for (const bad of ['', ' ', 'exa mple.com', 'example.com;ls', 'http://example.com', 'ftp://x.y', '-bad.com', 'a..b', 'x'.repeat(254)]) {
      expect(() => parseTarget(bad)).toThrow(TargetError);
    }
  });

  test('ports outside 1-65535 are refused', () => {
    expect(() => parseTarget('example.com:0')).toThrow(TargetError);
    expect(() => parseTarget('example.com:70000')).toThrow(TargetError);
    expect(() => parseTarget('example.com:abc')).toThrow(TargetError);
  });

  test('surrounding whitespace and a trailing dot are tolerated', () => {
    expect(parseTarget('  example.com.  ')).toEqual({ host: 'example.com', port: 443 });
  });
});

describe('isPublicAddress', () => {
  test('public IPv4 and IPv6 addresses pass', () => {
    expect(isPublicAddress('93.184.216.34')).toBe(true);
    expect(isPublicAddress('1.1.1.1')).toBe(true);
    expect(isPublicAddress('2606:4700::6810:84e5')).toBe(true);
  });

  test('loopback, private, link-local, CGNAT, multicast, unspecified and broadcast are refused', () => {
    for (const a of [
      '127.0.0.1', '127.255.255.254', '10.0.0.1', '172.16.0.1', '172.31.255.255', '192.168.1.1',
      '169.254.169.254', '100.64.0.1', '224.0.0.1', '0.0.0.0', '255.255.255.255', '192.0.0.1',
      '198.18.0.1', '192.0.2.1', '198.51.100.1', '203.0.113.1', '240.0.0.1',
    ]) {
      expect(isPublicAddress(a)).toBe(false);
    }
  });

  test('IPv6 loopback, unspecified, ULA, link-local, documentation and multicast are refused', () => {
    for (const a of ['::1', '::', 'fc00::1', 'fd12:3456::1', 'fe80::1', '2001:db8::1', 'ff02::1']) {
      expect(isPublicAddress(a)).toBe(false);
    }
  });

  test('IPv4-mapped and IPv4-compatible IPv6 are judged by the embedded IPv4', () => {
    expect(isPublicAddress('::ffff:10.0.0.1')).toBe(false);
    expect(isPublicAddress('::ffff:127.0.0.1')).toBe(false);
    expect(isPublicAddress('::ffff:93.184.216.34')).toBe(true);
    expect(isPublicAddress('::ffff:5db8:d822')).toBe(true); // 93.184.216.34 in hex form
    expect(isPublicAddress('::ffff:7f00:1')).toBe(false); // 127.0.0.1 in hex form
    expect(isPublicAddress('64:ff9b::7f00:1')).toBe(false); // NAT64 of 127.0.0.1
    expect(isPublicAddress('2002:7f00:1::')).toBe(false); // 6to4 of 127.0.0.1
  });

  test('garbage is not public', () => {
    expect(isPublicAddress('not an ip')).toBe(false);
    expect(isPublicAddress('')).toBe(false);
  });
});
