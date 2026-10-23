import type { Stage } from '../../../engine/assess';
import { useI18n } from '../i18n/react';

const R = 110;
const C = 2 * Math.PI * R;

export function stageColor(stage: Stage): string {
  return `var(--stage-${stage})`;
}

/**
 * How wide a label is, in ems at the ring's letter-spacing: a Latin capital is about 0.73 em, a
 * Japanese character about 1.14 em, a space about 0.45 em (measured in Chromium at 1.35rem). The
 * ring sizes the word from this so the longest labels (UNGESCHÜTZT, INDETERMINADO) stay on one
 * line inside the track.
 */
export function labelEm(label: string): number {
  return Array.from(label).reduce((sum, ch) => sum + (ch === ' ' ? 0.45 : /[\u3000-\u9fff\uff00-\uffef]/.test(ch) ? 1.14 : 0.73), 0);
}

/** The double ring: a dotted outer ring, the track, and the progress arc that fills with the score. */
export function Ring({ stage, score, live }: { stage: Stage; score: number; live: boolean }) {
  const { t } = useI18n();
  const offset = C * (1 - Math.max(0, Math.min(100, score)) / 100);
  const word = t.stage.label[stage];
  return (
    <div className="ring" data-testid="ring" style={{ ['--stage-color' as string]: stageColor(stage), ['--word-em' as string]: labelEm(word).toFixed(2) }} role="img" aria-label={t.report.ringAria(word, score)}>
      <svg viewBox="0 0 260 260" aria-hidden="true">
        <circle className="outer" cx="130" cy="130" r="124" />
        <circle className="track" cx="130" cy="130" r={R} />
        <circle className="progress" cx="130" cy="130" r={R} strokeDasharray={C} strokeDashoffset={offset} />
      </svg>
      <div className="centre">
        <div className="word" data-testid="stage-word">
          {word}
        </div>
        <div className="number" data-testid="score">
          {score}
        </div>
        <div className="of">{live ? t.report.ringScanning : t.report.ringOf}</div>
      </div>
    </div>
  );
}
