import { describe, expect, test } from 'bun:test';
import { assess, emptyFindings, type Findings } from '../engine/assess';

const days = (n: number) => new Date(Date.now() + n * 86400_000).toISOString();

function leaf(over: Partial<Findings['chain'][number]> = {}): Findings['chain'][number] {
  return {
    subject: 'example.com',
    issuer: 'Some CA',
    keyAlgorithm: 'EC',
    keyDetail: 'P-256',
    signatureAlgorithm: 'ecdsa-with-SHA256',
    notBefore: days(-30),
    notAfter: days(60),
    isCA: false,
    selfSigned: false,
    ...over,
  };
}

function hybridHost(): Findings {
  const f = emptyFindings();
  f.groups.X25519MLKEM768 = 'yes';
  f.groups.x25519 = 'yes';
  f.groups.secp256r1 = 'yes';
  f.tls13 = true;
  f.tls12 = true;
  f.rsaKeyTransport = false;
  f.preferredModernGroup = 0x11ec;
  f.chain = [leaf()];
  f.trusted = true;
  f.connection = { protocol: 'TLSv1.3', cipher: 'TLS_AES_128_GCM_SHA256', alpn: 'h2' };
  return f;
}

describe('assess: the readiness ladder', () => {
  test('nothing answered: unreachable, score 0', () => {
    const a = assess(emptyFindings());
    expect(a.stage).toBe('unreachable');
    expect(a.score).toBe(0);
  });

  test('TLS 1.3 absent: exposed, and the next step is TLS 1.3', () => {
    const f = emptyFindings();
    f.tls13 = false;
    f.tls12 = true;
    f.rsaKeyTransport = true;
    const a = assess(f);
    expect(a.stage).toBe('exposed');
    expect(a.nextStep.id).toBe('enable-tls13');
    expect(a.score).toBeLessThan(20);
  });

  test('TLS 1.3 without any hybrid group: at risk, next step is hybrid key exchange', () => {
    const f = hybridHost();
    f.groups.X25519MLKEM768 = 'no';
    f.preferredModernGroup = 0x001d;
    const a = assess(f);
    expect(a.stage).toBe('at-risk');
    expect(a.nextStep.id).toBe('enable-hybrid');
    expect(a.score).toBeGreaterThanOrEqual(30);
    expect(a.score).toBeLessThan(60);
  });

  test('only the pre-standard Kyber draft: still at risk, with the draft noted', () => {
    const f = hybridHost();
    f.groups.X25519MLKEM768 = 'no';
    f.groups.X25519Kyber768Draft00 = 'yes';
    const a = assess(f);
    expect(a.stage).toBe('at-risk');
    expect(a.notes.some((n) => n.id === 'kyber-draft-only')).toBe(true);
  });

  test('hybrid accepted but RSA key transport still reachable: protected, next step retires it', () => {
    const f = hybridHost();
    f.rsaKeyTransport = true;
    const a = assess(f);
    expect(a.stage).toBe('protected');
    expect(a.nextStep.id).toBe('retire-rsa-transport');
    expect(a.score).toBeGreaterThanOrEqual(60);
  });

  test('hybrid, no legacy transport, short-lived trusted certificate: ready, nothing to do today', () => {
    const a = assess(hybridHost());
    expect(a.stage).toBe('ready');
    expect(a.nextStep.id).toBe('watch-pq-certificates');
    expect(a.score).toBeGreaterThanOrEqual(90);
  });

  test('hybrid with a long-lived certificate: protected, next step is automation', () => {
    const f = hybridHost();
    f.chain = [leaf({ notBefore: days(-100), notAfter: days(265) })];
    const a = assess(f);
    expect(a.stage).toBe('protected');
    expect(a.nextStep.id).toBe('shorten-certificates');
  });

  test('the certificate card never alarms: authentication is marked not-actionable, not failing', () => {
    const a = assess(hybridHost());
    expect(a.certificate.status).toBe('not-actionable');
    expect(a.certificate.quantumSafe).toBe(false);
  });

  test('an ML-DSA signed chain is recognised as quantum-safe authentication', () => {
    const f = hybridHost();
    f.chain = [leaf({ keyAlgorithm: 'ML-DSA', keyDetail: 'ML-DSA-65', signatureAlgorithm: 'ML-DSA-65' })];
    const a = assess(f);
    expect(a.certificate.quantumSafe).toBe(true);
    expect(a.score).toBe(100);
  });

  test('every group probe failed but TLS 1.3 negotiated: inconclusive, never exposed', () => {
    const f = emptyFindings();
    f.tls13 = true;
    for (const g of Object.keys(f.groups) as (keyof typeof f.groups)[]) f.groups[g] = 'no';
    const a = assess(f);
    expect(a.stage).toBe('inconclusive');
  });
});
