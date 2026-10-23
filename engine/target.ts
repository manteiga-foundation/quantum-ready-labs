// What the user typed -> a host and a port, or a TargetError. Nothing typed ever reaches
// anything but a socket: this module is the only parser of operator input in the engine.

/** Every refusal, by code. The web says each in the reader's language; these are the English words. */
export const TARGET_ERRORS = {
  empty: 'Enter a host name or an IP address.',
  'https-only': 'Only https:// addresses can be tested.',
  unreadable: 'That address could not be read.',
  'ipv4-format': 'Write IPv4 addresses as four decimal numbers.',
  'ipv6-invalid': 'That is not a valid IPv6 address.',
  port: 'The port must be a number between 1 and 65535.',
  'too-long': 'That host name is too long.',
  'invalid-host': 'That is not a valid host name.',
} as const;

export type TargetErrorCode = keyof typeof TARGET_ERRORS;
/** The engine's own resolver refuses with these; their words carry the host, so the message is passed in. */
export type ResolveErrorCode = 'no-address' | 'unresolvable' | 'not-public';

export class TargetError extends Error {
  readonly code: TargetErrorCode | ResolveErrorCode;
  constructor(code: TargetErrorCode);
  constructor(code: ResolveErrorCode, message: string);
  constructor(code: TargetErrorCode | ResolveErrorCode, message?: string) {
    super(message ?? TARGET_ERRORS[code as TargetErrorCode]);
    this.name = 'TargetError';
    this.code = code;
  }
}

export interface Target {
  host: string;
  port: number;
}

const LABEL = /^(?!-)[a-z0-9-]{1,63}(?<!-)$/;
const IPV4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;


export function parseTarget(input: string): Target {
  let s = input.trim();
  if (!s) throw new TargetError('empty');

  let port = 443;
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(s)) {
    if (!/^https:\/\//i.test(s)) throw new TargetError('https-only');
    let url: URL;
    try {
      url = new URL(s);
    } catch {
      throw new TargetError('unreadable');
    }
    s = url.hostname.startsWith('[') ? url.hostname.slice(1, -1) : url.hostname;
    if (url.port) port = parsePort(url.port);
    if (!isIpv6Literal(s) && looksLikeIpv4Attempt(s) && !isCanonicalIpv4(s)) {
      throw new TargetError('ipv4-format');
    }
    return { host: finishHost(s), port };
  }

  const bracket = s.match(/^\[([^\]]+)\](?::(.+))?$/);
  if (bracket) {
    const host = bracket[1];
    if (!isIpv6Literal(host)) throw new TargetError('ipv6-invalid');
    if (bracket[2] !== undefined) port = parsePort(bracket[2]);
    return { host: host.toLowerCase(), port };
  }

  if (isIpv6Literal(s)) return { host: s.toLowerCase(), port };

  const colon = s.lastIndexOf(':');
  if (colon !== -1) {
    port = parsePort(s.slice(colon + 1));
    s = s.slice(0, colon);
  }
  return { host: finishHost(s), port };
}

function parsePort(text: string): number {
  if (!/^\d{1,5}$/.test(text)) throw new TargetError('port');
  const port = Number(text);
  if (port < 1 || port > 65535) throw new TargetError('port');
  return port;
}

function finishHost(raw: string): string {
  let host = raw.toLowerCase();
  if (host.endsWith('.')) host = host.slice(0, -1);
  if (looksLikeIpv4Attempt(host)) {
    // An IPv4 literal in some notation: only the canonical dotted-decimal form passes, because
    // resolvers read octal, hex and short forms differently from what the reader sees.
    if (!isCanonicalIpv4(host)) throw new TargetError('ipv4-format');
    return host;
  }
  if (host.length > 253) throw new TargetError('too-long');
  const labels = host.split('.');
  if (labels.length < 2 || !labels.every((l) => LABEL.test(l))) {
    throw new TargetError('invalid-host');
  }
  return host;
}

export function isCanonicalIpv4(s: string): boolean {
  const m = s.match(IPV4);
  if (!m) return false;
  return m.slice(1).every((part) => String(Number(part)) === part && Number(part) <= 255);
}

/** Every label is a number in some notation (decimal, octal, 0x hex): the user meant an IP. */
function looksLikeIpv4Attempt(host: string): boolean {
  return host.split('.').every((label) => /^(\d+|0x[0-9a-f]*)$/i.test(label));
}

function isIpv6Literal(s: string): boolean {
  return s.includes(':') && parseIpv6(s) !== null;
}

/** 16 bytes, or null. Accepts :: compression and a trailing dotted IPv4. */
function parseIpv6(s: string): Uint8Array | null {
  if (!/^[0-9a-f:.]+$/i.test(s)) return null;
  let text = s;
  let tail: number[] = [];
  const lastColon = text.lastIndexOf(':');
  const last = text.slice(lastColon + 1);
  if (last.includes('.')) {
    if (!isCanonicalIpv4(last)) return null;
    tail = last.split('.').map(Number);
    text = text.slice(0, lastColon + 1) + '0:0';
  }
  const halves = text.split('::');
  if (halves.length > 2) return null;
  const toWords = (part: string) =>
    part === '' ? [] : part.split(':').map((w) => (/^[0-9a-f]{1,4}$/i.test(w) ? parseInt(w, 16) : NaN));
  const head = toWords(halves[0]);
  const rest = halves.length === 2 ? toWords(halves[1]) : [];
  if ([...head, ...rest].some(Number.isNaN)) return null;
  let words: number[];
  if (halves.length === 2) {
    const missing = 8 - head.length - rest.length;
    if (missing < 1) return null;
    words = [...head, ...new Array(missing).fill(0), ...rest];
  } else {
    if (head.length !== 8) return null;
    words = head;
  }
  const bytes = new Uint8Array(16);
  words.forEach((w, i) => {
    bytes[i * 2] = w >> 8;
    bytes[i * 2 + 1] = w & 0xff;
  });
  if (tail.length) bytes.set(tail, 12);
  return bytes;
}

function ipv4Bytes(s: string): Uint8Array | null {
  if (!isCanonicalIpv4(s)) return null;
  return Uint8Array.from(s.split('.').map(Number));
}

/** Ranges the public scanner never connects to (IANA special-purpose registries). */
function isPublicIpv4(b: Uint8Array): boolean {
  const [a, b1, c] = b;
  if (a === 0) return false; // this network
  if (a === 10) return false; // private
  if (a === 100 && b1 >= 64 && b1 <= 127) return false; // CGNAT
  if (a === 127) return false; // loopback
  if (a === 169 && b1 === 254) return false; // link-local
  if (a === 172 && b1 >= 16 && b1 <= 31) return false; // private
  if (a === 192 && b1 === 0 && c === 0) return false; // IETF protocol assignments
  if (a === 192 && b1 === 0 && c === 2) return false; // TEST-NET-1
  if (a === 192 && b1 === 88 && c === 99) return false; // 6to4 relay anycast (deprecated)
  if (a === 192 && b1 === 168) return false; // private
  if (a === 198 && (b1 === 18 || b1 === 19)) return false; // benchmarking
  if (a === 198 && b1 === 51 && c === 100) return false; // TEST-NET-2
  if (a === 203 && b1 === 0 && c === 113) return false; // TEST-NET-3
  if (a >= 224) return false; // multicast, reserved, broadcast
  return true;
}

export function isPublicAddress(address: string): boolean {
  const v4 = ipv4Bytes(address);
  if (v4) return isPublicIpv4(v4);
  const v6 = parseIpv6(address);
  if (!v6) return false;
  const words = Array.from({ length: 8 }, (_, i) => (v6[i * 2] << 8) | v6[i * 2 + 1]);
  const allZeroTo = (n: number) => words.slice(0, n).every((w) => w === 0);
  if (allZeroTo(7) && (words[7] === 0 || words[7] === 1)) return false; // :: and ::1
  if (allZeroTo(5) && words[5] === 0xffff) return isPublicIpv4(v6.subarray(12)); // IPv4-mapped
  if (allZeroTo(6)) return isPublicIpv4(v6.subarray(12)); // IPv4-compatible (deprecated)
  if (words[0] === 0x64 && words[1] === 0xff9b && allZeroTo(6) === false && words.slice(2, 6).every((w) => w === 0)) {
    return isPublicIpv4(v6.subarray(12)); // NAT64 well-known prefix 64:ff9b::/96
  }
  if (words[0] === 0x2002) return isPublicIpv4(v6.subarray(2, 6)); // 6to4
  if ((words[0] & 0xfe00) === 0xfc00) return false; // ULA fc00::/7
  if ((words[0] & 0xffc0) === 0xfe80) return false; // link-local
  if ((words[0] & 0xff00) === 0xff00) return false; // multicast
  if (words[0] === 0x2001 && words[1] === 0x0db8) return false; // documentation
  if (words[0] === 0x2001 && words[1] === 0x0000) return false; // Teredo (embeds addresses)
  if (words[0] === 0x0100 && words[1] === 0 && words[2] === 0 && words[3] === 0) return false; // discard-only
  return true;
}
