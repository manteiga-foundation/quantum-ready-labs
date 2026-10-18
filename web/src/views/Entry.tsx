import { Animator, Animated, FrameCorners } from '@arwes/react';
import { useState, type FormEvent } from 'react';
import { parseTarget, TargetError } from '../../../engine/target';

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
      </main>
    </Animator>
  );
}
