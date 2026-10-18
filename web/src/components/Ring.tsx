import { STAGE_LABEL, type Stage } from '../../../engine/assess';

const R = 110;
const C = 2 * Math.PI * R;

export function stageColor(stage: Stage): string {
  return `var(--stage-${stage})`;
}

/** The double ring: a dotted outer ring, the track, and the progress arc that fills with the score. */
export function Ring({ stage, score, live }: { stage: Stage; score: number; live: boolean }) {
  const offset = C * (1 - Math.max(0, Math.min(100, score)) / 100);
  return (
    <div className="ring" data-testid="ring" style={{ ['--stage-color' as string]: stageColor(stage) }} role="img" aria-label={`${STAGE_LABEL[stage]}, ${score} of 100`}>
      <svg viewBox="0 0 260 260" aria-hidden="true">
        <circle className="outer" cx="130" cy="130" r="124" />
        <circle className="track" cx="130" cy="130" r={R} />
        <circle className="progress" cx="130" cy="130" r={R} strokeDasharray={C} strokeDashoffset={offset} />
      </svg>
      <div className="centre">
        <div className="word" data-testid="stage-word">
          {STAGE_LABEL[stage]}
        </div>
        <div className="number" data-testid="score">
          {score}
        </div>
        <div className="of">{live ? 'scanning' : 'of 100'}</div>
      </div>
    </div>
  );
}
