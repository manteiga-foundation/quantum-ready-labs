// Certificate details from what node:tls hands back, plus the one thing it does not: the
// signature algorithm of each link, read from the DER (the outer SEQUENCE's second element).

import type { PeerCertificate, DetailedPeerCertificate } from 'node:tls';
import type { ChainLink } from './assess';

const SIGNATURE_OIDS: Record<string, string> = {
  '1.2.840.113549.1.1.5': 'sha1WithRSAEncryption',
  '1.2.840.113549.1.1.11': 'sha256WithRSAEncryption',
  '1.2.840.113549.1.1.12': 'sha384WithRSAEncryption',
  '1.2.840.113549.1.1.13': 'sha512WithRSAEncryption',
  '1.2.840.113549.1.1.10': 'RSASSA-PSS',
  '1.2.840.10045.4.3.2': 'ecdsa-with-SHA256',
  '1.2.840.10045.4.3.3': 'ecdsa-with-SHA384',
  '1.2.840.10045.4.3.4': 'ecdsa-with-SHA512',
  '1.3.101.112': 'Ed25519',
  '1.3.101.113': 'Ed448',
  '2.16.840.1.101.3.4.3.17': 'ML-DSA-44',
  '2.16.840.1.101.3.4.3.18': 'ML-DSA-65',
  '2.16.840.1.101.3.4.3.19': 'ML-DSA-87',
  '2.16.840.1.101.3.4.3.20': 'SLH-DSA-SHA2-128s',
  '2.16.840.1.101.3.4.3.21': 'SLH-DSA-SHA2-128f',
  '2.16.840.1.101.3.4.3.22': 'SLH-DSA-SHA2-192s',
  '2.16.840.1.101.3.4.3.23': 'SLH-DSA-SHA2-192f',
  '2.16.840.1.101.3.4.3.24': 'SLH-DSA-SHA2-256s',
  '2.16.840.1.101.3.4.3.25': 'SLH-DSA-SHA2-256f',
};

/** Reads one DER TLV at offset; returns the tag, the content start and the content length. */
function tlv(der: Uint8Array, offset: number): { tag: number; start: number; length: number } {
  const tag = der[offset];
  let p = offset + 1;
  let length = der[p++];
  if (length & 0x80) {
    const n = length & 0x7f;
    length = 0;
    for (let i = 0; i < n; i++) length = (length << 8) | der[p++];
  }
  return { tag, start: p, length };
}

function decodeOid(bytes: Uint8Array): string {
  const parts: number[] = [];
  let value = 0;
  for (let i = 0; i < bytes.length; i++) {
    value = value * 128 + (bytes[i] & 0x7f);
    if ((bytes[i] & 0x80) === 0) {
      if (parts.length === 0) {
        parts.push(Math.floor(value / 40), value % 40);
      } else parts.push(value);
      value = 0;
    }
  }
  return parts.join('.');
}

/** The signatureAlgorithm OID of an X.509 certificate, as a name when known. */
export function signatureAlgorithmOf(der: Uint8Array): string {
  try {
    const outer = tlv(der, 0);
    if (outer.tag !== 0x30) return 'unknown';
    const tbs = tlv(der, outer.start);
    const sigAlg = tlv(der, tbs.start + tbs.length);
    if (sigAlg.tag !== 0x30) return 'unknown';
    const oid = tlv(der, sigAlg.start);
    if (oid.tag !== 0x06) return 'unknown';
    const text = decodeOid(der.subarray(oid.start, oid.start + oid.length));
    return SIGNATURE_OIDS[text] ?? text;
  } catch {
    return 'unknown';
  }
}

function name(parts: PeerCertificate['subject'] | undefined): string {
  if (!parts) return '';
  const cn = (parts as Record<string, string | string[]>).CN;
  if (cn) return Array.isArray(cn) ? cn[0] : cn;
  const o = (parts as Record<string, string | string[]>).O;
  if (o) return Array.isArray(o) ? o[0] : o;
  return Object.values(parts).flat().join(', ');
}

function keyOf(cert: PeerCertificate): Pick<ChainLink, 'keyAlgorithm' | 'keyDetail'> {
  const c = cert as PeerCertificate & { asn1Curve?: string; nistCurve?: string; pubkey?: Buffer; modulus?: string };
  if (c.modulus || (c.bits && !c.asn1Curve && c.bits >= 1024)) return { keyAlgorithm: 'RSA', keyDetail: `RSA-${c.bits}` };
  if (c.asn1Curve || c.nistCurve) return { keyAlgorithm: 'EC', keyDetail: c.nistCurve ?? c.asn1Curve ?? 'EC' };
  const sig = signatureAlgorithmOf(new Uint8Array(cert.raw));
  if (cert.pubkey && cert.pubkey.length === 32 && !c.bits) return { keyAlgorithm: 'Ed25519', keyDetail: 'Ed25519' };
  if (sig.startsWith('ML-DSA')) return { keyAlgorithm: 'ML-DSA', keyDetail: sig };
  if (sig.startsWith('SLH-DSA')) return { keyAlgorithm: 'SLH-DSA', keyDetail: sig };
  return { keyAlgorithm: 'unknown', keyDetail: c.bits ? `${c.bits} bits` : 'unknown' };
}

/** Walks the issuerCertificate links; the chain stops at a self-signed link or a missing issuer. */
export function chainOf(leaf: DetailedPeerCertificate): ChainLink[] {
  const links: ChainLink[] = [];
  let cert: DetailedPeerCertificate | undefined = leaf;
  const seen = new Set<string>();
  while (cert && Object.keys(cert).length && !seen.has(cert.fingerprint256)) {
    seen.add(cert.fingerprint256);
    const selfSigned = cert.issuerCertificate === cert || (!cert.issuerCertificate && JSON.stringify(cert.subject) === JSON.stringify(cert.issuer));
    links.push({
      subject: name(cert.subject),
      issuer: name(cert.issuer),
      ...keyOf(cert),
      signatureAlgorithm: signatureAlgorithmOf(new Uint8Array(cert.raw)),
      notBefore: new Date(cert.valid_from).toISOString(),
      notAfter: new Date(cert.valid_to).toISOString(),
      isCA: Boolean(cert.ca),
      selfSigned,
    });
    if (selfSigned) break;
    cert = cert.issuerCertificate;
  }
  return links;
}
