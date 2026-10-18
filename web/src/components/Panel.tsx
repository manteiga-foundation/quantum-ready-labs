import { Animator, FrameCorners, FrameLines } from '@arwes/react';
import type { ReactNode } from 'react';

/** A framed panel in the house style. The frame reads its colours from the CSS variables on .card. */
export function Panel({ children, className = '', corners = false, testId }: { children: ReactNode; className?: string; corners?: boolean; testId?: string }) {
  return (
    <Animator>
      <div className={`card ${className}`} data-testid={testId}>
        {corners ? <FrameCorners strokeWidth={1} cornerLength={14} /> : <FrameLines largeLineWidth={1} smallLineWidth={1} smallLineLength={14} />}
        {children}
      </div>
    </Animator>
  );
}
