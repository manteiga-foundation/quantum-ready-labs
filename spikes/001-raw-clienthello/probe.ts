// Raw TLS key-exchange probe (Bun, no dependencies). Validated spike for Quantum Ready Labs.
// Usage: bun run probe.ts [host[:port] ...]
// Method: supported_groups = [one group], key_share = empty -> HelloRetryRequest names the group
// if supported, alert otherwise. Legacy probe: TLS 1.2 hello offering only RSA key transport.

const GROUPS: Record<string, number> = {
  X25519MLKEM768: 0x11ec,
  SecP256r1MLKEM768: 0x11eb,
  SecP384r1MLKEM1024: 0x11ed,
  X25519Kyber768Draft00: 0x6399,
  x25519: 0x001d,
  secp256r1: 0x0017,
  secp384r1: 0x0018,
  ffdhe2048: 0x0100,
};

const HRR_RANDOM = 'cf21ad74e59a6111be1d8c021e65b891c2a211167abb8c5e079e09e2c8a8339c';

function u16(n: number) { return [(n >> 8) & 0xff, n & 0xff]; }
function u24(n: number) { return [(n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff]; }
function vec16(body: number[]) { return [...u16(body.length), ...body]; }
function vec8(body: number[]) { return [body.length, ...body]; }
function ext(type: number, body: number[]) { return [...u16(type), ...vec16(body)]; }
function rand(n: number) { return [...crypto.getRandomValues(new Uint8Array(n))]; }

function sni(host: string) {
  const name = [...new TextEncoder().encode(host)];
  return ext(0, vec16([0, ...vec16(name)]));
}

const SIG_ALGS = [0x0403, 0x0804, 0x0401, 0x0503, 0x0805, 0x0501, 0x0806, 0x0601, 0x0201, 0x0203];

function clientHello13(host: string, group: number): Uint8Array {
  const exts = [
    ...sni(host),
    ...ext(10, vec16(u16(group))),            // supported_groups: the one under test
    ...ext(13, vec16(SIG_ALGS.flatMap(u16))), // signature_algorithms
    ...ext(43, vec8(u16(0x0304))),            // supported_versions: 1.3 only
    ...ext(45, vec8([1])),                    // psk_key_exchange_modes
    ...ext(51, vec16([])),                    // key_share: empty -> HRR
  ];
  const body = [
    ...u16(0x0303), ...rand(32), ...vec8(rand(32)),
    ...vec16([...u16(0x1301), ...u16(0x1302), ...u16(0x1303)]),
    ...vec8([0]),
    ...vec16(exts),
  ];
  const hs = [1, ...u24(body.length), ...body];
  return new Uint8Array([0x16, 0x03, 0x01, ...u16(hs.length), ...hs]);
}

function clientHello12Rsa(host: string): Uint8Array {
  const exts = [...sni(host), ...ext(13, vec16(SIG_ALGS.flatMap(u16)))];
  const body = [
    ...u16(0x0303), ...rand(32), ...vec8([]),
    ...vec16([...u16(0x009c), ...u16(0x009d), ...u16(0x002f), ...u16(0x0035)]),
    ...vec8([0]),
    ...vec16(exts),
  ];
  const hs = [1, ...u24(body.length), ...body];
  return new Uint8Array([0x16, 0x03, 0x01, ...u16(hs.length), ...hs]);
}

type Outcome =
  | { kind: 'hrr'; group: number }
  | { kind: 'serverhello'; version: number; cipher: number; group?: number }
  | { kind: 'alert'; level: number; desc: number }
  | { kind: 'error'; message: string };

function parse(buf: Uint8Array): Outcome | null {
  if (buf.length < 5) return null;
  const type = buf[0];
  const len = (buf[3] << 8) | buf[4];
  if (buf.length < 5 + len) return null;
  const rec = buf.subarray(5, 5 + len);
  if (type === 0x15) return { kind: 'alert', level: rec[0], desc: rec[1] };
  if (type !== 0x16 || rec[0] !== 2) return { kind: 'error', message: `unexpected record ${type}/${rec[0]}` };
  let p = 4;
  const legacyVersion = (rec[p] << 8) | rec[p + 1]; p += 2;
  const random = Buffer.from(rec.subarray(p, p + 32)).toString('hex'); p += 32;
  const sidLen = rec[p]; p += 1 + sidLen;
  const cipher = (rec[p] << 8) | rec[p + 1]; p += 2;
  p += 1;
  let version = legacyVersion;
  let group: number | undefined;
  if (p + 2 <= rec.length) {
    const extLen = (rec[p] << 8) | rec[p + 1]; p += 2;
    const end = p + extLen;
    while (p + 4 <= end) {
      const t = (rec[p] << 8) | rec[p + 1];
      const l = (rec[p + 2] << 8) | rec[p + 3];
      const d = rec.subarray(p + 4, p + 4 + l);
      if (t === 43) version = (d[0] << 8) | d[1];
      if (t === 51) group = (d[0] << 8) | d[1];
      p += 4 + l;
    }
  }
  if (random === HRR_RANDOM) return { kind: 'hrr', group: group! };
  return { kind: 'serverhello', version, cipher, group };
}

async function send(host: string, port: number, hello: Uint8Array, timeoutMs = 5000): Promise<Outcome & { ms: number }> {
  const t0 = performance.now();
  return new Promise((resolve) => {
    const chunks: Uint8Array[] = [];
    let done = false;
    let sock: any;
    const finish = (o: Outcome) => {
      if (done) return; done = true;
      clearTimeout(timer);
      resolve({ ...o, ms: Math.round(performance.now() - t0) });
      try { sock?.end(); } catch {}
    };
    const timer = setTimeout(() => finish({ kind: 'error', message: 'timeout' }), timeoutMs);
    Bun.connect({
      hostname: host, port,
      socket: {
        open(s) { sock = s; s.write(hello); },
        data(_s, data) {
          chunks.push(new Uint8Array(data));
          const o = parse(Buffer.concat(chunks));
          if (o) finish(o);
        },
        error(_s, e) { finish({ kind: 'error', message: String(e) }); },
        close() { finish({ kind: 'error', message: 'closed without reply' }); },
        connectError(_s, e) { finish({ kind: 'error', message: `connect: ${e}` }); },
      },
    }).catch((e) => finish({ kind: 'error', message: `connect: ${e}` }));
  });
}

const ALERTS: Record<number, string> = { 40: 'handshake_failure', 47: 'illegal_parameter', 70: 'protocol_version', 109: 'missing_extension', 112: 'unrecognized_name', 80: 'internal_error' };

function describe(o: Outcome): string {
  switch (o.kind) {
    case 'hrr': return `HRR selected_group=0x${o.group.toString(16)}`;
    case 'serverhello': return `ServerHello version=0x${o.version.toString(16)} cipher=0x${o.cipher.toString(16)}${o.group !== undefined ? ` group=0x${o.group.toString(16)}` : ''}`;
    case 'alert': return `alert ${ALERTS[o.desc] ?? o.desc}`;
    case 'error': return `error ${o.message}`;
  }
}

async function probeHost(host: string, port = 443) {
  console.log(`\n== ${host}:${port}`);
  const t0 = performance.now();
  const results = await Promise.all(
    Object.entries(GROUPS).map(async ([name, code]) => {
      const o = await send(host, port, clientHello13(host, code));
      return { name, supported: o.kind === 'hrr' && o.group === code, o };
    }),
  );
  for (const r of results) console.log(`  ${r.name.padEnd(22)} ${r.supported ? 'YES' : 'no '}  ${describe(r.o)} (${r.o.ms} ms)`);
  const rsa = await send(host, port, clientHello12Rsa(host));
  console.log(`  ${'TLS1.2 RSA transport'.padEnd(22)} ${rsa.kind === 'serverhello' ? 'YES' : 'no '}  ${describe(rsa)} (${rsa.ms} ms)`);
  console.log(`  total ${Math.round(performance.now() - t0)} ms`);
}

const targets = process.argv.slice(2);
for (const t of targets.length ? targets : ['cloudflare.com', 'google.com', 'github.com', 'example.com', 'tls-v1-2.badssl.com:1012']) {
  const [h, p] = t.split(':');
  await probeHost(h, p ? Number(p) : 443);
}

export {};
