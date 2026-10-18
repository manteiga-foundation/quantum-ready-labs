// TLS ClientHello construction and server-reply parsing. Pure bytes, no sockets, no crypto.
// The engine never finishes a handshake: it reads the server's first message (ServerHello,
// HelloRetryRequest or alert) in clear and stops. That is all a readiness probe needs.

export const GROUP = {
  // Hybrid post-quantum (IETF draft-ietf-tls-ecdhe-mlkem; the codes browsers and OpenSSL 3.5 ship)
  X25519MLKEM768: 0x11ec,
  SecP256r1MLKEM768: 0x11eb,
  SecP384r1MLKEM1024: 0x11ed,
  // The pre-standard draft Chrome shipped in 2023-2024; still accepted by some CDNs
  X25519Kyber768Draft00: 0x6399,
  // Classical elliptic curves
  x25519: 0x001d,
  secp256r1: 0x0017,
  secp384r1: 0x0018,
  secp521r1: 0x0019,
  // Finite-field groups (RFC 7919)
  ffdhe2048: 0x0100,
  ffdhe3072: 0x0101,
} as const;

export type GroupName = keyof typeof GROUP;

export const GROUP_NAMES: GroupName[] = Object.keys(GROUP) as GroupName[];

export function groupName(code: number): string {
  const found = GROUP_NAMES.find((n) => GROUP[n] === code);
  return found ?? `0x${code.toString(16).padStart(4, '0')}`;
}

export const CIPHER = {
  /** TLS 1.3 suites (the key exchange is in the groups, not here). */
  TLS13: [0x1301, 0x1302, 0x1303],
  /** TLS 1.2 RSA key transport: no forward secrecy; the premaster secret is encrypted to the RSA key. */
  RSA_TRANSPORT: [0x009c, 0x009d, 0x002f, 0x0035, 0x003c, 0x003d],
  /** TLS 1.2 ephemeral key exchange with ECDSA or RSA authentication. */
  ECDHE: [0xc02b, 0xc02c, 0xc02f, 0xc030, 0xcca9, 0xcca8, 0xc023, 0xc024, 0xc027, 0xc028, 0xc009, 0xc00a, 0xc013, 0xc014],
} as const;

export const ALERT: Record<number, string> = {
  0: 'close_notify',
  10: 'unexpected_message',
  40: 'handshake_failure',
  42: 'bad_certificate',
  47: 'illegal_parameter',
  70: 'protocol_version',
  71: 'insufficient_security',
  80: 'internal_error',
  109: 'missing_extension',
  112: 'unrecognized_name',
  120: 'no_application_protocol',
};

const HRR_RANDOM = 'cf21ad74e59a6111be1d8c021e65b891c2a211167abb8c5e079e09e2c8a8339c';

const SIGNATURE_ALGORITHMS = [
  0x0403, 0x0804, 0x0401, 0x0503, 0x0805, 0x0501, 0x0806, 0x0601, 0x0201, 0x0203, 0x0807, 0x0808,
];

function u16(n: number): number[] {
  return [(n >> 8) & 0xff, n & 0xff];
}
function u24(n: number): number[] {
  return [(n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff];
}
function vec8(body: number[]): number[] {
  return [body.length, ...body];
}
function vec16(body: number[]): number[] {
  return [...u16(body.length), ...body];
}
function extension(type: number, body: number[]): number[] {
  return [...u16(type), ...vec16(body)];
}
function random(n: number): number[] {
  return [...crypto.getRandomValues(new Uint8Array(n))];
}

/** RFC 6066: the host_name in SNI must not be an IP literal. */
function isIpLiteral(host: string): boolean {
  return /^\d{1,3}(\.\d{1,3}){3}$/.test(host) || host.includes(':');
}

function serverName(host: string): number[] {
  if (isIpLiteral(host)) return [];
  const name = [...new TextEncoder().encode(host)];
  return extension(0, vec16([0, ...vec16(name)]));
}

function record(handshakeBody: number[]): Uint8Array {
  const handshake = [1, ...u24(handshakeBody.length), ...handshakeBody];
  return new Uint8Array([0x16, 0x03, 0x01, ...u16(handshake.length), ...handshake]);
}

export interface Hello13Options {
  host: string;
  /** Groups to offer. With no key share the server must answer HelloRetryRequest for one of them. */
  groups: readonly number[];
}

/** A TLS 1.3-only ClientHello with an empty key_share: the server names its chosen group in HRR. */
export function buildClientHello13({ host, groups }: Hello13Options): Uint8Array {
  const extensions = [
    ...serverName(host),
    ...extension(10, vec16(groups.flatMap(u16))),
    ...extension(13, vec16(SIGNATURE_ALGORITHMS.flatMap(u16))),
    ...extension(43, vec8(u16(0x0304))),
    ...extension(45, vec8([1])),
    ...extension(51, vec16([])),
  ];
  return record([
    ...u16(0x0303),
    ...random(32),
    ...vec8(random(32)),
    ...vec16(CIPHER.TLS13.flatMap(u16)),
    ...vec8([0]),
    ...vec16(extensions),
  ]);
}

export interface Hello12Options {
  host: string;
  ciphers: readonly number[];
  groups?: readonly number[];
}

/** A TLS 1.2 ClientHello (no supported_versions) offering the given cipher suites. */
export function buildClientHello12({ host, ciphers, groups = [GROUP.x25519, GROUP.secp256r1, GROUP.secp384r1] }: Hello12Options): Uint8Array {
  const extensions = [
    ...serverName(host),
    ...extension(10, vec16(groups.flatMap(u16))),
    ...extension(11, vec8([0])), // ec_point_formats: uncompressed
    ...extension(13, vec16(SIGNATURE_ALGORITHMS.flatMap(u16))),
  ];
  return record([
    ...u16(0x0303),
    ...random(32),
    ...vec8([]),
    ...vec16(ciphers.flatMap(u16)),
    ...vec8([0]),
    ...vec16(extensions),
  ]);
}

export type ServerMessage =
  | { kind: 'hrr'; group: number; version: number }
  | { kind: 'serverhello'; version: number; cipher: number; group: number | undefined }
  | { kind: 'alert'; level: number; description: number }
  | { kind: 'error'; message: string };

/** The server's first record. Null while the record is still incomplete. */
export function parseServerMessage(bytes: Uint8Array): ServerMessage | null {
  if (bytes.length < 5) return null;
  const type = bytes[0];
  const length = (bytes[3] << 8) | bytes[4];
  if (bytes.length < 5 + length) return null;
  const body = bytes.subarray(5, 5 + length);
  if (type === 0x15) {
    if (body.length < 2) return { kind: 'error', message: 'short alert' };
    return { kind: 'alert', level: body[0], description: body[1] };
  }
  if (type !== 0x16) return { kind: 'error', message: `unexpected record type ${type}` };
  if (body[0] !== 2) return { kind: 'error', message: `unexpected handshake type ${body[0]}` };
  let p = 4;
  const legacyVersion = (body[p] << 8) | body[p + 1];
  p += 2;
  const rnd = Buffer.from(body.subarray(p, p + 32)).toString('hex');
  p += 32;
  const sessionIdLength = body[p];
  p += 1 + sessionIdLength;
  const cipher = (body[p] << 8) | body[p + 1];
  p += 2;
  p += 1; // compression method
  let version = legacyVersion;
  let group: number | undefined;
  if (p + 2 <= body.length) {
    const extensionsLength = (body[p] << 8) | body[p + 1];
    p += 2;
    const end = Math.min(p + extensionsLength, body.length);
    while (p + 4 <= end) {
      const t = (body[p] << 8) | body[p + 1];
      const l = (body[p + 2] << 8) | body[p + 3];
      const d = body.subarray(p + 4, p + 4 + l);
      if (t === 43 && d.length >= 2) version = (d[0] << 8) | d[1];
      if (t === 51 && d.length >= 2) group = (d[0] << 8) | d[1];
      p += 4 + l;
    }
  }
  if (rnd === HRR_RANDOM) {
    if (group === undefined) return { kind: 'error', message: 'HelloRetryRequest without a selected group' };
    return { kind: 'hrr', group, version };
  }
  return { kind: 'serverhello', version, cipher, group };
}
