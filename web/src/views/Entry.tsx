import { Animator, Animated, FrameCorners } from '@arwes/react';
import { useState, type FormEvent, type ReactNode } from 'react';
import { parseTarget, TargetError } from '../../../engine/target';

/** The questions people ask after their first result, answered in the order they are asked. */
const FAQ: [string, ReactNode][] = [
  [
    'My certificate is valid and recent. Why is my host At risk?',
    'Because the certificate is not what the stage measures. A certificate authenticates a connection at the moment it happens, and no certificate on the public web can be quantum-safe yet, so the report shows it and never alarms about it. The stage comes from the key exchange: whether the secret that encrypts each session is agreed with a hybrid post-quantum group (X25519MLKEM768) or only with classical curves. At risk means the latter: safe today, but a recording of the session can be decrypted when a large quantum computer exists.',
  ],
  [
    'Is this a vulnerability? Is something broken?',
    'No. Nothing is broken and nothing can be exploited today. The concern is "harvest now, decrypt later": traffic recorded now stays readable to whoever holds it once such a machine exists, and some records keep their value for decades. The transition fixes that in the key exchange first, which is why browsers, OpenSSL 3.5 and the large CDNs already do it.',
  ],
  [
    'What does the test do to my host?',
    'Fourteen TLS handshakes and one ordinary connection, from one address, in about a second: the same traffic a single browser visit causes. Each handshake offers one key-exchange group and reads the server\'s first reply; no handshake completes, nothing is sent after it, and nothing is stored about the host except the result you see.',
  ],
  [
    'My host is Protected. Why not Ready?',
    'Ready adds the habits that make the next transition cheap: no TLS 1.2 RSA key transport left on (it has no forward secrecy), and certificates short-lived enough to be renewed by automation, which is how a post-quantum certificate will arrive one day. Most hosts on a CDN are Protected at 85 because the RSA key transport cipher suites are still on by default; turning them off is usually one setting.',
  ],
  [
    'My site is behind Cloudflare, Akamai, Fastly or a load balancer. Who makes the change?',
    'Whoever terminates TLS. Behind a CDN that is the CDN, and the post-quantum setting is often already on or one switch away; behind your own load balancer or web server it is the TLS configuration there (OpenSSL 3.5 or later, nginx 1.27 or later, Caddy 2.9 or later offer the hybrid group by default). The origin behind the CDN is not what the public sees and is not what this test measures.',
  ],
  [
    'Can I test hosts on my own network?',
    <>
      Not from this page: the public service refuses private, loopback and link-local addresses before connecting. Clone the repository and run the same engine from your terminal with{' '}
      <code>bun run scan host --private</code>; the result and the rubric are identical.
    </>,
  ],
  [
    'How often should I test again?',
    'After any change to the TLS configuration, and otherwise rarely: results under 24 hours old are served from cache, and the share link of a result never changes. Leave an address in the Download dialog if you would like a quarterly readiness report; nothing is sent until those begin.',
  ],
  [
    'Can scripts and other services use this?',
    <>
      Yes, free and without a key: <a href="/api">the API</a> answers one JSON object per scan, with the share and PDF links. Twenty scans per caller and six per host in ten minutes.
    </>,
  ],
];

export function Entry({ onScan }: { onScan: (host: string) => void }) {
  const [value, setValue] = useState('');
  const [error, setError] = useState<string | null>(null);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    try {
      const target = parseTarget(value);
      setError(null);
      onScan(target.port === 443 ? target.host : `${target.host.includes(':') ? `[${target.host}]` : target.host}:${target.port}`);
    } catch (err) {
      setError(err instanceof TargetError ? err.message : 'That address could not be read.');
    }
  };

  return (
    <Animator combine manager="stagger">
      <main className="entry">
        <Animator>
          <Animated as="h1" animated={['fade', ['y', 16, 0]]}>
            Are you quantum ready?
          </Animated>
        </Animator>
        <Animator>
          <Animated as="p" className="sub" animated={['fade', ['y', 12, 0]]}>
            Type a host name. We open a few TLS connections to it, as a browser would, and tell you where it stands on the post-quantum transition and what to do next.
          </Animated>
        </Animator>
        <Animator>
          <form className="scan-form" onSubmit={submit} noValidate>
            <FrameCorners strokeWidth={1} cornerLength={18} />
            <div className="row">
              <label htmlFor="host" className="sr-only">
                Host
              </label>
              <input
                id="host"
                name="host"
                type="text"
                inputMode="url"
                autoComplete="off"
                autoCapitalize="none"
                spellCheck={false}
                placeholder="example.com"
                value={value}
                onChange={(e) => setValue(e.target.value)}
                aria-invalid={error ? true : undefined}
                aria-describedby={error ? 'host-error' : 'host-notice'}
              />
              <button type="submit" className="button">
                Test
              </button>
            </div>
          </form>
        </Animator>
        {error && (
          <p className="alert" role="alert" id="host-error">
            {error}
          </p>
        )}
        <Animator>
          <Animated as="p" className="notice" id="host-notice" animated={['fade']}>
            This tool opens a TLS connection to the host you enter, exactly as a browser would. Only test hosts you are allowed to connect to.
          </Animated>
        </Animator>
        <Animator>
          <Animated as="section" className="faq" data-testid="faq" aria-labelledby="faq-title" animated={['fade']}>
            <h2 id="faq-title">Questions</h2>
            <dl>
              {FAQ.map(([q, a]) => (
                <div key={q} className="faq-item">
                  <dt data-testid="faq-question">{q}</dt>
                  <dd>{a}</dd>
                </div>
              ))}
            </dl>
          </Animated>
        </Animator>
      </main>
    </Animator>
  );
}
