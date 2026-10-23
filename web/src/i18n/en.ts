// The English words of the web, and the shape every other language follows (`Messages`). The
// report's verdicts, next steps, notes and stage words are the engine's own, so the page, the
// API and the terminal say the same thing in English. Data only: the edge imports this file.
//
// Conventions the tests rely on: functions take positional strings and numbers, except
// `errors.scan`, which takes the edge's params object. Inline markup in long texts: [text](href)
// for a link and `code` for code, rendered by `Rich` (web/src/i18n/react.tsx).

import { NOTE_TEXT, STAGE_LABEL, STAGE_MEANING, STEPS, VERDICT, type NextStepId } from '../../../engine/assess';
import { TARGET_ERRORS } from '../../../engine/target';

/** What the edge and the page can say went wrong with a scan, by code. */
export const SCAN_ERROR_CODES = [
  'port-not-allowed',
  'rate-caller',
  'rate-host',
  'rate',
  'no-address',
  'not-public',
  'engine-busy',
  'engine-failed',
  'start-failed',
  'connection-lost',
  'expired',
  'load-failed',
  'no-demo',
] as const;
export type ScanErrorCode = (typeof SCAN_ERROR_CODES)[number];
export interface ScanErrorParams {
  host?: string;
  port?: number;
  allowed?: number[];
  address?: string;
  status?: number;
}

const steps = Object.fromEntries(Object.entries(STEPS).map(([id, s]) => [id, { title: s.title, detail: s.detail }])) as Record<NextStepId, { title: string; detail: string }>;

export const en = {
  meta: {
    title: 'Quantum Ready Labs: is your host ready for the quantum era?',
    description:
      'Test any public host for post-quantum readiness. Quantum Ready Labs opens a few TLS connections as a browser would and tells you where the host stands on the post-quantum transition, and what to do next.',
    ogTitle: 'Quantum Ready Labs: are you quantum ready? Test your host',
    ogDescription: 'Where does your host stand on the post-quantum transition? A plain-language report with the one next step, in under a second.',
    twitterDescription: 'Where does your host stand on the post-quantum transition? A plain-language report with the one next step.',
    shareTitle: (host: string, stage: string) => `${host} is ${stage}`,
    shareDescription: (verdict: string, step: string) => `${verdict} Next step: ${step}.`,
  },
  shell: {
    byline: 'By Manteiga Foundation',
    source: 'Source',
    howWeScore: 'How we score',
    studies: 'Studies',
    api: 'API',
    language: 'Language',
    footerScope:
      'Quantum Ready Labs tests the key exchange, protocol versions and certificate chain a host negotiates, and explains where it stands on the post-quantum transition. It is not a general TLS audit.',
    footerLicense:
      'Open source under the MIT license. A [Manteiga Foundation](https://manteiga.org) project. [API](/api) for scripts, services and agents. Abuse or questions: hello@manteiga.org',
  },
  titles: {
    metrics: 'Metrics',
    api: 'API',
    studies: 'Studies',
    noStudy: 'No such study',
    done: (host: string, stage: string) => `${host}: ${stage.toLowerCase()}`,
    testing: (host: string) => `Testing ${host}`,
  },
  entry: {
    h1: 'Are you quantum ready?',
    sub: 'Type a host name. We open a few TLS connections to it, as a browser would, and tell you where it stands on the post-quantum transition and what to do next.',
    hostLabel: 'Host',
    test: 'Test',
    notice: 'This tool opens a TLS connection to the host you enter, exactly as a browser would. Only test hosts you are allowed to connect to.',
    questions: 'Questions',
    faq: [
      {
        q: 'My certificate is valid and recent. Why is my host At risk?',
        a: 'Because the certificate is not what the stage measures. A certificate authenticates a connection at the moment it happens, and no certificate on the public web can be quantum-safe yet, so the report shows it and never alarms about it. The stage comes from the key exchange: whether the secret that encrypts each session is agreed with a hybrid post-quantum group (X25519MLKEM768) or only with classical curves. At risk means the latter: safe today, but a recording of the session can be decrypted when a large quantum computer exists.',
      },
      {
        q: 'Is this a vulnerability? Is something broken?',
        a: 'No. Nothing is broken and nothing can be exploited today. The concern is "harvest now, decrypt later": traffic recorded now stays readable to whoever holds it once such a machine exists, and some records keep their value for decades. The transition fixes that in the key exchange first, which is why browsers, OpenSSL 3.5 and the large CDNs already do it.',
      },
      {
        q: 'What does the test do to my host?',
        a: "Fourteen TLS handshakes and one ordinary connection, from one address, in about a second: the same traffic a single browser visit causes. Each handshake offers one key-exchange group and reads the server's first reply; no handshake completes, nothing is sent after it, and nothing is stored about the host except the result you see.",
      },
      {
        q: 'My host is Protected. Why not Ready?',
        a: 'Ready adds the habits that make the next transition cheap: no TLS 1.2 RSA key transport left on (it has no forward secrecy), and certificates short-lived enough to be renewed by automation, which is how a post-quantum certificate will arrive one day. Most hosts on a CDN are Protected at 85 because the RSA key transport cipher suites are still on by default; turning them off is usually one setting.',
      },
      {
        q: 'My site is behind Cloudflare, Akamai, Fastly or a load balancer. Who makes the change?',
        a: 'Whoever terminates TLS. Behind a CDN that is the CDN, and the post-quantum setting is often already on or one switch away; behind your own load balancer or web server it is the TLS configuration there (OpenSSL 3.5 or later, nginx 1.27 or later, Caddy 2.9 or later offer the hybrid group by default). The origin behind the CDN is not what the public sees and is not what this test measures.',
      },
      {
        q: 'Can I test hosts on my own network?',
        a: 'Not from this page: the public service refuses private, loopback and link-local addresses before connecting. Clone the repository and run the same engine from your terminal with `bun run scan host --private`; the result and the rubric are identical.',
      },
      {
        q: 'How often should I test again?',
        a: 'After any change to the TLS configuration, and otherwise rarely: results under 24 hours old are served from cache, and the share link of a result never changes. Leave an address in the Download dialog if you would like a quarterly readiness report; nothing is sent until those begin.',
      },
      {
        q: 'Can scripts and other services use this?',
        a: 'Yes, free and without a key: [the API](/api) answers one JSON object per scan, with the share and PDF links. Twenty scans per caller and six per host in ten minutes.',
      },
    ],
  },
  stage: {
    label: STAGE_LABEL,
    meaning: STAGE_MEANING,
  },
  report: {
    ringOf: 'of 100',
    ringScanning: 'scanning',
    ringAria: (stage: string, score: number) => `${stage}, ${score} of 100`,
    probesLive: (n: number) => `${n} of 14 probes`,
    probesDone: (n: number, ms: number) => `${n} probes in ${ms} ms`,
    stopped: 'stopped',
    complete: 'complete',
    headingTesting: 'Testing',
    headingNotRun: 'Scan not run',
    headingReady: 'Quantum ready',
    headingNotReady: 'Not yet quantum ready',
    headingUnreachable: 'Unreachable',
    headingInconclusive: 'Inconclusive',
    liveVerdict: 'The probes are answering. The ring fills as the picture improves; the verdict settles when the last one is in.',
    verdict: VERDICT,
    standing: 'Standing',
    nextStep: 'The one next step',
    steps,
    notes: NOTE_TEXT,
    unknownReason: 'unknown reason',
    download: 'Download report',
    share: 'Share link',
    copied: 'Link copied',
    copyPrompt: 'Copy this link',
    checkOwn: 'Check your own host',
    checkAnother: 'Check another host',
    recommendations: 'Recommendations',
    authTitle: 'Authentication: nothing to do yet',
    authPq: 'This chain is already signed with a post-quantum algorithm.',
    authClassical:
      "Certificates on the public web cannot yet be made quantum-safe by anyone: the Web PKI has no post-quantum roots. A signature cannot be forged retroactively, so there is no harvest-now risk here. Watch for ML-DSA certificates and your certificate authority's roadmap.",
    technical: 'Technical details',
    detailsSummary: 'Every probe, the chain link by link, and the rubric',
    /** Between a label and its value in the cards ("TLS 1.3: available"). */
    sep: ': ',
    yes: 'yes',
    no: 'no',
    none: 'none',
    notMeasured: 'not measured',
    kx: {
      title: 'Key exchange · confidentiality',
      hybrid: 'Hybrid post-quantum accepted',
      classical: 'Classical only',
      legacy: 'Legacy only',
      noAnswer: 'No answer',
      body: 'This is the urgent half. Traffic recorded today with a classical key exchange can be decrypted when a large quantum computer exists.',
      hybridGroups: 'Hybrid groups',
      classicalGroups: 'Classical groups',
      preferred: "Server's pick for a current browser",
      tls13: 'TLS 1.3',
      available: 'available',
      notAvailable: 'not available',
      rsaTransport: 'TLS 1.2 RSA key transport',
      stillAcceptedNoFs: 'still accepted (no forward secrecy)',
      refused: 'refused',
      realConnection: (protocol: string, cipher: string) => `A real connection negotiated ${protocol}, ${cipher}`,
    },
    cert: {
      title: 'Certificate · authentication',
      notRead: 'Not read',
      pqSigned: 'Post-quantum signed',
      classical: 'Classical, like all of the public web',
      bodyPq: 'The chain is signed with a post-quantum algorithm.',
      bodyClassical:
        'Certificates cannot yet be made quantum-safe on the public web; nothing is to be done here today, and nothing is to be feared: a signature cannot be forged after the fact.',
      key: 'Key',
      signature: 'Signature',
      lifetime: 'Lifetime',
      days: (n: number) => `${n} days`,
      remaining: (n: number) => `${n} remaining`,
      chain: 'Chain',
      links: (n: number) => (n === 1 ? '1 link' : `${n} links`),
      trusted: 'Trusted',
    },
    foundations: {
      title: 'Foundations · agility',
      inPlace: (n: number) => `${n} of 5 in place`,
      body: 'The habits that make the next transition cheap: modern protocol, no legacy fallbacks, automated short-lived certificates.',
      tls13: 'TLS 1.3',
      noRsa: 'No RSA key transport',
      noRsaNo: 'no, still accepted',
      shortLived: 'Short-lived certificate (100 days or less)',
      prefersHybrid: 'Server prefers hybrid when offered',
      chainTrusted: 'Chain trusted',
    },
    probes: {
      probe: 'Probe',
      answer: 'Answer',
      said: 'What the server said',
      ms: 'ms',
      supported: 'supported',
      notSupported: 'not supported',
      noAnswer: 'no answer',
      stillAccepted: 'still accepted',
      refused: 'refused',
      waiting: 'waiting',
      pqStandard: 'hybrid post-quantum (standard)',
      pqDraft: 'hybrid post-quantum (pre-standard draft)',
      ecc: 'classical elliptic curve',
      ff: 'classical finite field',
    },
    chain: {
      none: 'No certificate chain was read.',
      link: 'Link',
      subject: 'Subject',
      issuer: 'Issuer',
      key: 'Key',
      signature: 'Signature',
      validUntil: 'Valid until',
      leaf: 'leaf',
      root: 'root',
      intermediate: 'intermediate',
    },
    rubric: (score: number, kx: number, foundations: number, rsa: number, short: number, hybrid: number, trusted: number, cert: number) =>
      `Score ${score} of 100: key exchange ${kx} of 60; foundations ${foundations} of 30 (no RSA key transport ${rsa}/10, short-lived certificate ${short}/8, prefers hybrid ${hybrid}/6, trusted chain ${trusted}/6); certificate ${cert} of 10.`,
    stages: 'Stages',
    standards: 'Standards: NIST FIPS 203 (ML-KEM), IR 8547 (deprecated after 2030, disallowed after 2035), NSA CNSA 2.0, IETF draft-ietf-tls-ecdhe-mlkem.',
    printFooter: 'A Manteiga Foundation project',
  },
  study: {
    indexTitle: 'Studies',
    indexIntro:
      "A study is a named population scanned by the maintainer on one day, published as a state-of-readiness note: the figures, every institution with its result, the method. Studies are kept apart from the scanner's organic use.",
    observed: (date: string) => `Observed ${date}.`,
    notFoundTitle: 'No such study',
    notFoundBody: 'Nothing is published under this name. The studies that exist are listed at [/studies](/studies).',
    byline: (subtitle: string, date: string) => `${subtitle}. Observed ${date}. By Manteiga Foundation, with the open-source Quantum Ready Labs scanner.`,
    findings: 'Findings',
    leadRest:
      'The {notYet} split in two: {exposedCount} are {exposed} (their sites still run a protocol generation that cannot carry post-quantum protection) and {atRiskCount} are {at-risk} (modern protocol, post-quantum protection not switched on). The {protectedTotal} are {protected} ({protectedCount}) or {ready} ({readyCount}). The median institution scores {median} of 100.',
    calmBroken:
      '**Nothing is broken today.** No account, login or transaction at any of these institutions is at risk from what this note describes; every connection tested is encrypted with algorithms no computer that exists can break.',
    calmTime:
      "**The risk is time.** Encrypted traffic can be recorded now and decrypted once a large enough quantum computer exists, so anything that must stay confidential for years is already inside the window. That window is narrowing: in 2025 the estimated size of the machine needed to break today's key exchange fell from about twenty million qubits to under one million, and NIST has set 2030 to begin retiring today's key exchange and 2035 to end it. Browsers and the largest web properties already protect their traffic the new way.",
    calmFix:
      '**The fix is small.** For the {exposedCount} {exposed} institutions, the next step is to enable TLS 1.3; for the {atRiskCount} {at-risk}, to switch on the post-quantum key exchange (X25519MLKEM768), which on current servers and content-delivery networks is a configuration line or a toggle. Most are one change away from {protected}.',
    barAria: (share: number) => `${share} percent protected or ready`,
    share: (share: number) => `${share}% protected or ready`,
    institutions: 'Every institution',
    institutionsNotice: (total: number, date: string) =>
      `Alphabetical, all ${total}. Each row links to the full result page and the PDF report as observed on ${date}; Test again runs a fresh scan now. Stage and score measure quantum readiness only, not general security.`,
    filter: 'Filter by stage',
    all: (n: number) => `All ${n}`,
    colInstitution: 'Institution',
    colStage: 'Stage',
    colScore: 'Score',
    colNext: 'Next step',
    colResult: 'Result',
    report: 'Report',
    pdf: 'PDF',
    none: 'none',
    testAgain: 'Test again',
    method: 'Method',
    methodTested:
      'Each domain was tested on {date} exactly as a browser visit would be: fourteen TLS handshakes and one ordinary connection, nothing more. No page was opened and no login was attempted. The probes read, in clear, whether the server offers TLS 1.3, which key-exchange groups it accepts, among them the hybrid post-quantum group X25519MLKEM768 that current browsers propose, whether it still accepts RSA key transport, and the certificate chain. The {exposedCount} {exposedWord} results were cross-checked with OpenSSL 3 and curl, which could not complete a TLS 1.3 handshake with any of them either.',
    methodRubric:
      'The rubric is public: [How we score](https://github.com/manteiga-foundation/quantum-ready-labs/blob/main/docs/scoring.md). The scanner is open source under the MIT license; anyone can repeat the measurement with `bun run scan <host>` or the [API](/api). Standards cited: NIST IR 8547 (transition to post-quantum cryptography: deprecate quantum-vulnerable key exchange by 2030, disallow by 2035), FIPS 203 (ML-KEM), CNSA 2.0.',
    corrections:
      "A domain that is wrong, or a change made since the observation: write to hello@manteiga.org. Test again shows today's state at once, and the population is re-scanned each quarter; a fresh result replaces the row at the next run.",
    press: 'In the press',
    pressCoverage: 'wrote about it',
    pressRelease: 'the release',
    pressSyndication: 'carried the release',
  },
  dialog: {
    title: 'Download the report',
    bodyPdf: 'A five-page PDF, print-ready: cover, executive summary, where the host stands, technical details, method and standards.',
    bodyPrint: 'The report prints to PDF from your browser.',
    subscribe: (host: string) => `If you would like a quarterly readiness report for ${host}, leave an address; this is optional, and nothing is sent until the quarterly reports begin.`,
    preparing: 'Preparing the PDF.',
    preparingSlow: 'Preparing the PDF. The first one after a quiet spell takes up to twenty seconds while the renderer starts.',
    ready: (kb: number) => `PDF ready, ${kb} KB.`,
    error: 'The PDF could not be prepared right now. Reload the page to try again, or print from your browser.',
    email: 'Email',
    downloadSubscribe: 'Download and subscribe',
    downloadPdf: 'Download PDF',
    preparingButton: 'Preparing',
    print: 'Print',
    cancel: 'Cancel',
  },
  errors: {
    target: { ...TARGET_ERRORS } as Record<keyof typeof TARGET_ERRORS, string>,
    scan: {
      'port-not-allowed': (p: ScanErrorParams) => {
        const allowed = p.allowed ?? [443];
        return `The public scanner tests port${allowed.length > 1 ? 's' : ''} ${allowed.join(', ')} only. Port ${p.port} was asked for and noted.`;
      },
      'rate-caller': () => 'Too many scans from your address. Please wait a few minutes.',
      'rate-host': () => 'This host was tested several times in the last minutes. The last result is shown when it is fresh; please try again shortly.',
      rate: () => 'Too many scans right now. Try again in a moment.',
      'no-address': (p: ScanErrorParams) => `${p.host} does not resolve to any address.`,
      'not-public': (p: ScanErrorParams) => `${p.host} resolves to ${p.address}, which is not a public Internet address. The public scanner tests only public hosts.`,
      'engine-busy': () => 'The scanner is busy. Please try again in a moment.',
      'engine-failed': () => 'The scanner could not run. Please try again in a moment.',
      'start-failed': (p: ScanErrorParams) => `The scan could not start (${p.status}).`,
      'connection-lost': () => 'The connection to the scanner was lost.',
      expired: () => 'This result has expired or never existed. Results are kept for 30 days.',
      'load-failed': (p: ScanErrorParams) => `The result could not be loaded (${p.status}).`,
      'no-demo': () => 'There is no such demo result.',
    } satisfies Record<ScanErrorCode, (p: ScanErrorParams) => string>,
  },
};

export type Messages = typeof en;
