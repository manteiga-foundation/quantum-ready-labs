// The scan's event contract: what the engine streams and what every renderer (web, CLI, the
// edge) consumes. Types only; no runtime imports, so the web can type-check without Bun.

import type { Assessment, Findings } from './assess';
import type { Target } from './target';

export type ScanEvent =
  | { type: 'start'; target: Target; address: string; startedAt: string }
  | { type: 'probe'; id: string; label: string; answer: 'yes' | 'no' | 'error'; detail: string; ms: number; group?: string; version?: string }
  | { type: 'connection'; protocol: string; cipher: string; alpn: string | null; chainLength: number; trusted: boolean | null; ms: number }
  | { type: 'assessment'; assessment: Assessment }
  | { type: 'done'; ms: number };

export interface ScanResult {
  target: Target;
  address: string;
  startedAt: string;
  ms: number;
  findings: Findings;
  assessment: Assessment;
}

