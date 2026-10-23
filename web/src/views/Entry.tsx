import { Animator, Animated, FrameCorners } from '@arwes/react';
import { useState, type FormEvent } from 'react';
import { parseTarget, TargetError } from '../../../engine/target';
import { errorText, Rich, useI18n } from '../i18n/react';

export function Entry({ onScan }: { onScan: (host: string) => void }) {
  const { t } = useI18n();
  const [value, setValue] = useState('');
  const [error, setError] = useState<{ code: string; message: string } | null>(null);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    try {
      const target = parseTarget(value);
      setError(null);
      onScan(target.port === 443 ? target.host : `${target.host.includes(':') ? `[${target.host}]` : target.host}:${target.port}`);
    } catch (err) {
      setError(err instanceof TargetError ? { code: err.code, message: err.message } : { code: 'unreadable', message: t.errors.target.unreadable });
    }
  };

  return (
    <Animator combine manager="stagger">
      <main className="entry">
        <Animator>
          <Animated as="h1" animated={['fade', ['y', 16, 0]]}>
            {t.entry.h1}
          </Animated>
        </Animator>
        <Animator>
          <Animated as="p" className="sub" animated={['fade', ['y', 12, 0]]}>
            {t.entry.sub}
          </Animated>
        </Animator>
        <Animator>
          <form className="scan-form" onSubmit={submit} noValidate>
            <FrameCorners strokeWidth={1} cornerLength={18} />
            <div className="row">
              <label htmlFor="host" className="sr-only">
                {t.entry.hostLabel}
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
                {t.entry.test}
              </button>
            </div>
          </form>
        </Animator>
        {error && (
          <p className="alert" role="alert" id="host-error">
            {errorText(t, error.message, error.code, {})}
          </p>
        )}
        <Animator>
          <Animated as="p" className="notice" id="host-notice" animated={['fade']}>
            {t.entry.notice}
          </Animated>
        </Animator>
        <Animator>
          <Animated as="section" className="faq" data-testid="faq" aria-labelledby="faq-title" animated={['fade']}>
            <h2 id="faq-title">{t.entry.questions}</h2>
            <dl>
              {/* The questions people ask after their first result, answered in the order they are asked. */}
              {t.entry.faq.map(({ q, a }) => (
                <div key={q} className="faq-item">
                  <dt data-testid="faq-question">{q}</dt>
                  <dd>
                    <Rich text={a} />
                  </dd>
                </div>
              ))}
            </dl>
          </Animated>
        </Animator>
      </main>
    </Animator>
  );
}
