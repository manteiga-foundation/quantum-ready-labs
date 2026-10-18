// A scan: resolve, run the probes concurrently, open one real connection for the negotiated
// parameters and the chain, assess. Findings stream out as events so a report can build live.

import tls from 'node:tls';
import { assess, emptyFindings, type Findings } from './assess';
import { chainOf } from './certificate';
import { buildClientHello12, buildClientHello13, CIPHER, GROUP, GROUP_NAMES, groupName, type GroupName } from './hello';
import { resolveTarget } from './resolve';
import { exchange, type Exchange } from './socket';
import type { Target } from './target';

export type { ScanEvent, ScanResult } from './events';
import type { ScanEvent, ScanResult } from './events';

export interface ScanOptions {
  allowPrivate?: boolean;
  timeoutMs?: number;
  onEvent?: (event: ScanEvent) => void;
}

/** The groups current browsers offer, in Chrome's order. The server's pick among them is what a reader's own browser gets. */
const MODERN_OFFER = [GROUP.X25519MLKEM768, GROUP.x25519, GROUP.secp256r1, GROUP.secp384r1];

function answerOf(x: Exchange, expectHrrGroup?: number): { answer: 'yes' | 'no' | 'error'; detail: string } {
  if (x.kind === 'hrr') {
    if (expectHrrGroup !== undefined && x.group !== expectHrrGroup) return { answer: 'no', detail: `server retried with ${groupName(x.group)}` };
    return { answer: 'yes', detail: `HelloRetryRequest for ${groupName(x.group)}` };
  }
  if (x.kind === 'serverhello') return { answer: 'yes', detail: `ServerHello TLS ${versionName(x.version)}, cipher 0x${x.cipher.toString(16)}` };
  if (x.kind === 'alert') return { answer: 'no', detail: `alert ${x.description}` };
  return { answer: 'error', detail: x.message };
}

function versionName(v: number): string {
  return { 0x0304: '1.3', 0x0303: '1.2', 0x0302: '1.1', 0x0301: '1.0' }[v] ?? `0x${v.toString(16)}`;
}

export async function scan(target: Target, options: ScanOptions = {}): Promise<ScanResult> {
  const { allowPrivate = false, timeoutMs = 5000, onEvent = () => {} } = options;
  const started = performance.now();
  const startedAt = new Date().toISOString();
  const resolved = await resolveTarget(target, { allowPrivate });
  const endpoint = { address: resolved.address, port: target.port, timeoutMs };
  onEvent({ type: 'start', target, address: resolved.address, startedAt });

  const findings = emptyFindings();
  const host = target.host;

  const probe = async (id: string, label: string, hello: Uint8Array, expectHrrGroup?: number): Promise<Exchange> => {
    const x = await exchange(endpoint, hello);
    const { answer, detail } = answerOf(x, expectHrrGroup);
    const group = x.kind === 'hrr' ? groupName(x.group) : x.kind === 'serverhello' && x.group !== undefined ? groupName(x.group) : undefined;
    const version = x.kind === 'hrr' || x.kind === 'serverhello' ? versionName(x.version) : undefined;
    onEvent({ type: 'probe', id, label, answer, detail, ms: x.ms, group, version });
    if (answer === 'error') findings.errors.push(`${id}: ${detail}`);
    return x;
  };

  const groupProbes = GROUP_NAMES.map(async (g: GroupName) => {
    const x = await probe(`group:${g}`, g, buildClientHello13({ host, groups: [GROUP[g]] }), GROUP[g]);
    findings.groups[g] = answerOf(x, GROUP[g]).answer;
  });

  const tls13Probe = probe('tls13', 'TLS 1.3', buildClientHello13({ host, groups: GROUP_NAMES.map((g) => GROUP[g]) })).then((x) => {
    findings.tls13 = x.kind === 'hrr' || x.kind === 'serverhello' ? true : x.kind === 'alert' ? false : null;
  });

  const modernProbe = probe('modern', 'What current browsers get', buildClientHello13({ host, groups: MODERN_OFFER })).then((x) => {
    findings.preferredModernGroup = x.kind === 'hrr' ? x.group : null;
  });

  const tls12Probe = probe('tls12', 'TLS 1.2 with ephemeral keys', buildClientHello12({ host, ciphers: CIPHER.ECDHE })).then((x) => {
    findings.tls12 = x.kind === 'serverhello' ? true : x.kind === 'alert' ? false : null;
  });

  const rsaProbe = probe('rsa-transport', 'TLS 1.2 RSA key transport', buildClientHello12({ host, ciphers: CIPHER.RSA_TRANSPORT })).then((x) => {
    findings.rsaKeyTransport = x.kind === 'serverhello' ? true : x.kind === 'alert' ? false : null;
  });

  const connectionProbe = realConnection(host, endpoint.address, target.port, timeoutMs).then((c) => {
    if (!c) return;
    findings.connection = { protocol: c.protocol, cipher: c.cipher, alpn: c.alpn };
    findings.chain = c.chain;
    findings.trusted = c.trusted;
    findings.trustError = c.trustError;
    onEvent({ type: 'connection', protocol: c.protocol, cipher: c.cipher, alpn: c.alpn, chainLength: c.chain.length, trusted: c.trusted, ms: c.ms });
  });

  await Promise.all([...groupProbes, tls13Probe, modernProbe, tls12Probe, rsaProbe, connectionProbe]);

  const assessment = assess(findings);
  onEvent({ type: 'assessment', assessment });
  const ms = Math.round(performance.now() - started);
  onEvent({ type: 'done', ms });
  return { target, address: resolved.address, startedAt, ms, findings, assessment };
}

interface RealConnection {
  protocol: string;
  cipher: string;
  alpn: string | null;
  chain: Findings['chain'];
  trusted: boolean | null;
  trustError: string | null;
  ms: number;
}

/** One ordinary TLS connection (the runtime's own client) for the negotiated parameters and the chain. */
function realConnection(host: string, address: string, port: number, timeoutMs: number): Promise<RealConnection | null> {
  const started = performance.now();
  const isIp = /^\d{1,3}(\.\d{1,3}){3}$/.test(host) || host.includes(':');
  return new Promise((resolve) => {
    let settled = false;
    const finish = (v: RealConnection | null) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try {
        socket.destroy();
      } catch {
        // gone
      }
      resolve(v);
    };
    const timer = setTimeout(() => finish(null), timeoutMs);
    const socket = tls.connect(
      {
        host: address,
        port,
        servername: isIp ? undefined : host,
        rejectUnauthorized: false,
        ALPNProtocols: ['h2', 'http/1.1'],
      },
      () => {
        const leaf = socket.getPeerCertificate(true);
        const cipher = socket.getCipher();
        finish({
          protocol: socket.getProtocol() ?? 'unknown',
          cipher: cipher?.standardName ?? cipher?.name ?? 'unknown',
          alpn: typeof socket.alpnProtocol === 'string' ? socket.alpnProtocol : null,
          chain: leaf && Object.keys(leaf).length ? chainOf(leaf) : [],
          trusted: socket.authorized,
          trustError: socket.authorized ? null : socket.authorizationError ? String(socket.authorizationError) : null,
          ms: Math.round(performance.now() - started),
        });
      },
    );
    socket.on('error', () => finish(null));
  });
}
