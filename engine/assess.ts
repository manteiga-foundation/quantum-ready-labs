// The readiness ladder. Pure: findings in, assessment out. The rubric lives here and in
// docs/scoring.md; change both together.
//
// The one idea the whole tool rests on: confidentiality is urgent (a recording made today falls
// when the machine exists: harvest now, decrypt later), authentication is not yet (a signature
// cannot be forged retroactively, and the Web PKI has no post-quantum roots to move to). So the
// key exchange decides the stage; the certificate is reported, explained, and never alarmed.

import { GROUP, type GroupName } from './hello';

export type ProbeAnswer = 'yes' | 'no' | 'error' | 'untested';

export interface ChainLink {
  subject: string;
  issuer: string;
  keyAlgorithm: 'RSA' | 'EC' | 'Ed25519' | 'Ed448' | 'ML-DSA' | 'SLH-DSA' | 'unknown';
  /** 'P-256', 'RSA-2048', 'ML-DSA-65' ... */
  keyDetail: string;
  signatureAlgorithm: string;
  notBefore: string;
  notAfter: string;
  isCA: boolean;
  selfSigned: boolean;
}

export interface Connection {
  protocol: string;
  cipher: string;
  alpn: string | null;
}

export interface Findings {
  groups: Record<GroupName, ProbeAnswer>;
  /** TLS 1.3 negotiable at all (every group offered). */
  tls13: boolean | null;
  /** TLS 1.2 with ephemeral key exchange negotiable. */
  tls12: boolean | null;
  /** TLS 1.2 RSA key transport (no forward secrecy) negotiable. */
  rsaKeyTransport: boolean | null;
  /** The group the server picks when offered what current browsers offer. */
  preferredModernGroup: number | null;
  connection: Connection | null;
  chain: ChainLink[];
  trusted: boolean | null;
  trustError: string | null;
  errors: string[];
}

export function emptyFindings(): Findings {
  const groups = Object.fromEntries((Object.keys(GROUP) as GroupName[]).map((g) => [g, 'untested'])) as Record<GroupName, ProbeAnswer>;
  return {
    groups,
    tls13: null,
    tls12: null,
    rsaKeyTransport: null,
    preferredModernGroup: null,
    connection: null,
    chain: [],
    trusted: null,
    trustError: null,
    errors: [],
  };
}

export type Stage = 'unreachable' | 'inconclusive' | 'exposed' | 'at-risk' | 'protected' | 'ready';

/** The word the reader sees. Direct, for an executive audience; the technical names live in the details. */
export const STAGE_LABEL: Record<Stage, string> = {
  unreachable: 'UNREACHABLE',
  inconclusive: 'INCONCLUSIVE',
  exposed: 'EXPOSED',
  'at-risk': 'AT RISK',
  protected: 'PROTECTED',
  ready: 'READY',
};

/** What each stage means in one line, for legends and the rubric. */
export const STAGE_MEANING: Record<Stage, string> = {
  unreachable: 'No TLS server answered.',
  inconclusive: 'The server answered in a way the probes could not read with confidence.',
  exposed: 'TLS 1.3 is not available: sessions can be recorded today and decrypted later.',
  'at-risk': 'TLS 1.3 with forward secrecy, no post-quantum key exchange: safe today, harvestable.',
  protected: 'Hybrid post-quantum key exchange is accepted: confidentiality protected.',
  ready: 'Protected, with no legacy key transport and short-lived automated certificates.',
};

export interface Note {
  id: string;
  text: string;
}

export interface NextStep {
  id: string;
  title: string;
  detail: string;
}

export interface Assessment {
  stage: Stage;
  /** 0-100; the stage is what the reader acts on, the number is for those who want one. */
  score: number;
  verdict: string;
  nextStep: NextStep;
  keyExchange: {
    status: 'hybrid' | 'classical' | 'legacy' | 'none';
    hybridGroups: GroupName[];
    classicalGroups: GroupName[];
    preferred: string | null;
    rsaKeyTransport: boolean | null;
    tls13: boolean | null;
    tls12: boolean | null;
  };
  certificate: {
    status: 'quantum-safe' | 'not-actionable' | 'unknown';
    quantumSafe: boolean;
    leafKey: string | null;
    leafSignature: string | null;
    leafDaysValid: number | null;
    leafDaysRemaining: number | null;
    chainLength: number;
    trusted: boolean | null;
  };
  foundations: {
    tls13: boolean | null;
    noRsaKeyTransport: boolean | null;
    shortLivedCertificate: boolean | null;
    prefersHybrid: boolean | null;
    trustedChain: boolean | null;
  };
  notes: Note[];
  points: Record<string, number>;
}

const HYBRID: GroupName[] = ['X25519MLKEM768', 'SecP256r1MLKEM768', 'SecP384r1MLKEM1024'];
const CLASSICAL: GroupName[] = ['x25519', 'secp256r1', 'secp384r1', 'secp521r1', 'ffdhe2048', 'ffdhe3072'];

/** Certificates issued for this long or less are being renewed by automation, in practice. */
const SHORT_LIVED_DAYS = 100;

const PQ_SIGNATURES = /^(ML-DSA|SLH-DSA)/;

export type NextStepId = 'unreachable' | 'inconclusive' | 'enable-tls13' | 'enable-hybrid' | 'retire-rsa-transport' | 'shorten-certificates' | 'watch-pq-certificates';

/** The next steps in English. The web says them in the reader's language by id; the API and the terminal use these words. */
export const STEPS: Record<NextStepId, NextStep> = {
  unreachable: {
    id: 'unreachable',
    title: 'Check the address',
    detail: 'No TLS server answered at this host and port. Check the name, and that the port is open to the Internet.',
  },
  inconclusive: {
    id: 'inconclusive',
    title: 'Run the scan again',
    detail: 'The server negotiated TLS 1.3 but answered none of the single-group probes. This is unusual (a middlebox or a server that mishandles HelloRetryRequest); the result is not trusted.',
  },
  'enable-tls13': {
    id: 'enable-tls13',
    title: 'Enable TLS 1.3',
    detail: 'Hybrid post-quantum key exchange is a TLS 1.3 feature. Every current server stack has TLS 1.3; enabling it is the first step and costs nothing else.',
  },
  'enable-hybrid': {
    id: 'enable-hybrid',
    title: 'Enable hybrid post-quantum key exchange (X25519MLKEM768)',
    detail: 'OpenSSL 3.5 or later, nginx 1.27 or later and Caddy 2.9 or later offer it by default; most CDNs have a post-quantum setting. Current Chrome, Firefox, Safari and curl already ask for it on every connection.',
  },
  'retire-rsa-transport': {
    id: 'retire-rsa-transport',
    title: 'Retire RSA key transport cipher suites',
    detail: 'TLS 1.2 sessions that use RSA key transport have no forward secrecy: one recorded session falls when the RSA key falls, with or without a quantum computer. Keep TLS 1.2 for old clients if you must, but only with ECDHE suites.',
  },
  'shorten-certificates': {
    id: 'shorten-certificates',
    title: 'Shorten certificate lifetimes and automate renewal',
    detail: 'Certificates of 90 days or less with ACME renewal are the same muscle the authentication transition will need when post-quantum certificates arrive; the CA/Browser Forum is already moving the maximum to 47 days by 2029.',
  },
  'watch-pq-certificates': {
    id: 'watch-pq-certificates',
    title: 'Nothing to do today',
    detail: 'Key exchange is protected and the foundations are in place. Authentication cannot yet be made post-quantum on the public web: watch for ML-DSA certificates in the Web PKI and your CA\'s roadmap.',
  },
};

/** The verdict in one sentence, per stage (English; the web translates by stage). */
export const VERDICT: Record<Stage, string> = {
  unreachable: 'No TLS server answered at this address.',
  inconclusive: 'The server answered in a way the probes could not read with confidence.',
  exposed: 'Connections to this host can be recorded today and decrypted later. TLS 1.3 is not available.',
  'at-risk': 'Connections to this host are safe today but can be recorded now and decrypted when a large quantum computer exists.',
  protected: 'Connections to this host are protected against future quantum decryption.',
  ready: 'Connections to this host are protected against future quantum decryption, and the foundations for the next step are in place.',
};

export const NOTE_IDS = ['kyber-draft-only', 'tls12-ecdhe-only', 'chain-not-trusted'] as const;
export type NoteId = (typeof NOTE_IDS)[number];

/** The notes in English; the trust error is the only variable part. */
export const NOTE_TEXT: Record<NoteId, (trustError: string) => string> = {
  'kyber-draft-only': () =>
    'The server accepts only the pre-standard Kyber draft (X25519Kyber768Draft00). Browsers stopped offering it in 2024; the standard X25519MLKEM768 is what they send now.',
  'tls12-ecdhe-only': () => 'TLS 1.2 is still offered, with ephemeral key exchange only. Acceptable for old clients.',
  'chain-not-trusted': (trustError) => `The certificate chain did not validate against the trust store (${trustError}). Browsers would warn before connecting.`,
};

function daysBetween(a: string, b: string): number {
  return Math.round((new Date(b).getTime() - new Date(a).getTime()) / 86400_000);
}

export function assess(f: Findings): Assessment {
  const hybridGroups = HYBRID.filter((g) => f.groups[g] === 'yes');
  const classicalGroups = CLASSICAL.filter((g) => f.groups[g] === 'yes');
  const anyAnswer =
    Object.values(f.groups).some((v) => v === 'yes' || v === 'no') || f.tls13 !== null || f.tls12 !== null || f.rsaKeyTransport !== null;
  // Every group answered, and every answer was no: with TLS 1.3 negotiable that is contradictory.
  // Untested groups do not count, so a live partial picture never reads as inconclusive.
  const allGroupsNo = (Object.keys(f.groups) as GroupName[]).every((g) => f.groups[g] === 'no');

  const leaf = f.chain[0] ?? null;
  const leafDaysValid = leaf ? daysBetween(leaf.notBefore, leaf.notAfter) : null;
  const leafDaysRemaining = leaf ? daysBetween(new Date().toISOString(), leaf.notAfter) : null;
  const pqChain = f.chain.length > 0 && f.chain.every((l) => PQ_SIGNATURES.test(l.signatureAlgorithm) || (l.selfSigned && PQ_SIGNATURES.test(l.keyAlgorithm)));

  const notes: Note[] = [];
  const note = (id: NoteId, trustError = '') => notes.push({ id, text: NOTE_TEXT[id](trustError) });
  if (hybridGroups.length === 0 && f.groups.X25519Kyber768Draft00 === 'yes') note('kyber-draft-only');
  if (f.tls12 === true && f.rsaKeyTransport === false) note('tls12-ecdhe-only');
  if (f.trusted === false && leaf) note('chain-not-trusted', f.trustError ?? 'unknown reason');

  let stage: Stage;
  if (!anyAnswer) stage = 'unreachable';
  else if (f.tls13 === true && allGroupsNo) stage = 'inconclusive';
  else if (f.tls13 === false || (f.tls13 === null && hybridGroups.length === 0 && classicalGroups.length === 0)) stage = 'exposed';
  else if (hybridGroups.length === 0) stage = 'at-risk';
  else {
    const foundationsInPlace =
      f.rsaKeyTransport === false && leafDaysValid !== null && leafDaysValid <= SHORT_LIVED_DAYS && f.trusted !== false;
    stage = foundationsInPlace ? 'ready' : 'protected';
  }

  // Points. Key exchange 60, foundations 30, certificate 10.
  const points: Record<string, number> = {};
  points.keyExchange = stage === 'unreachable' || stage === 'inconclusive' ? 0 : hybridGroups.length > 0 ? 60 : f.tls13 === true ? 30 : f.tls12 === true ? 10 : 0;
  points.noRsaKeyTransport = f.rsaKeyTransport === false ? 10 : 0;
  points.shortLivedCertificate = leafDaysValid !== null && leafDaysValid <= SHORT_LIVED_DAYS ? 8 : 0;
  points.prefersHybrid = f.preferredModernGroup !== null && HYBRID.some((g) => GROUP[g] === f.preferredModernGroup) ? 6 : 0;
  points.trustedChain = f.trusted === true ? 6 : 0;
  points.certificate = pqChain ? 10 : leaf ? (leaf.keyAlgorithm === 'EC' || leaf.keyAlgorithm === 'Ed25519' ? 5 : leaf.keyDetail === 'RSA-2048' ? 3 : 4) : 0;
  const score = stage === 'unreachable' ? 0 : Math.min(100, Object.values(points).reduce((a, b) => a + b, 0));

  let nextStep: NextStep;
  if (stage === 'unreachable') nextStep = STEPS.unreachable;
  else if (stage === 'inconclusive') nextStep = STEPS.inconclusive;
  else if (stage === 'exposed') nextStep = STEPS['enable-tls13'];
  else if (stage === 'at-risk') nextStep = STEPS['enable-hybrid'];
  else if (f.rsaKeyTransport !== false) nextStep = STEPS['retire-rsa-transport'];
  else if (leafDaysValid === null || leafDaysValid > SHORT_LIVED_DAYS) nextStep = STEPS['shorten-certificates'];
  else nextStep = STEPS['watch-pq-certificates'];

  const verdict = VERDICT[stage];

  return {
    stage,
    score,
    verdict,
    nextStep,
    keyExchange: {
      status: hybridGroups.length > 0 ? 'hybrid' : f.tls13 === true || classicalGroups.length > 0 ? 'classical' : f.tls12 === true || f.rsaKeyTransport === true ? 'legacy' : 'none',
      hybridGroups,
      classicalGroups,
      preferred: f.preferredModernGroup === null ? null : (Object.keys(GROUP) as GroupName[]).find((g) => GROUP[g] === f.preferredModernGroup) ?? `0x${f.preferredModernGroup.toString(16)}`,
      rsaKeyTransport: f.rsaKeyTransport,
      tls13: f.tls13,
      tls12: f.tls12,
    },
    certificate: {
      status: !leaf ? 'unknown' : pqChain ? 'quantum-safe' : 'not-actionable',
      quantumSafe: pqChain,
      leafKey: leaf?.keyDetail ?? null,
      leafSignature: leaf?.signatureAlgorithm ?? null,
      leafDaysValid,
      leafDaysRemaining,
      chainLength: f.chain.length,
      trusted: f.trusted,
    },
    foundations: {
      tls13: f.tls13,
      noRsaKeyTransport: f.rsaKeyTransport === null ? null : f.rsaKeyTransport === false,
      shortLivedCertificate: leafDaysValid === null ? null : leafDaysValid <= SHORT_LIVED_DAYS,
      prefersHybrid: f.preferredModernGroup === null ? null : points.prefersHybrid > 0,
      trustedChain: f.trusted,
    },
    notes,
    points,
  };
}
