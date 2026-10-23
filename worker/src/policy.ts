// Edge decisions as pure functions, so bun test can exercise them without the Workers runtime.

import type { NextStepId } from '../../engine/assess';
import type { ScanResult } from '../../engine/events';
import { en, type ScanErrorCode, type ScanErrorParams } from '../../web/src/i18n/en';
import { localePath, type Locale } from '../../web/src/i18n/locales';
import { MESSAGES } from '../../web/src/i18n/messages';

export const RATE_LIMITS = {
  /** Per caller (client IP): a generous burst, then a wait. */
  caller: { max: 20, windowS: 600 },
  /** Per target host: nobody gets to hammer a third party through us. */
  host: { max: 6, windowS: 600 },
} as const;

export type RateKind = keyof typeof RATE_LIMITS;

export type RateDecision = { allowed: true; reset?: true } | { allowed: false; retryAfterS: number };

export function decideRateLimit({ kind, count, windowStart, now }: { kind: RateKind; count: number; windowStart: number; now: number }): RateDecision {
  const { max, windowS } = RATE_LIMITS[kind];
  if (now - windowStart > windowS * 1000) return { allowed: true, reset: true };
  if (count >= max) return { allowed: false, retryAfterS: Math.max(1, Math.ceil((windowStart + windowS * 1000 - now) / 1000)) };
  return { allowed: true };
}

export const CACHE_TTL_MS = 24 * 3600 * 1000;

export function isFresh(createdAtMs: number, nowMs: number): boolean {
  return nowMs - createdAtMs <= CACHE_TTL_MS;
}

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_-';

export function newShareId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(12));
  let id = '';
  for (const b of bytes) id += ALPHABET[b & 63];
  return id;
}

interface DohAnswer {
  type: number;
  data: string;
}

/** Addresses from a DNS-over-HTTPS JSON answer (A = 1, AAAA = 28); CNAME links are skipped. */
export function addressesFromDoh(doh: { Status: number; Answer?: DohAnswer[] }): string[] {
  if (doh.Status !== 0 || !doh.Answer) return [];
  return doh.Answer.filter((a) => a.type === 1 || a.type === 28).map((a) => a.data.toLowerCase());
}

export interface Preview {
  title: string;
  description: string;
  image: string;
  url: string;
}

export function previewFor(result: ScanResult, id: string, origin: string, locale: Locale = 'en'): Preview {
  const t = MESSAGES[locale];
  const host = result.target.port === 443 ? result.target.host : `${result.target.host}:${result.target.port}`;
  const stage = result.assessment.stage;
  const step = t.report.steps[result.assessment.nextStep.id as NextStepId] ?? result.assessment.nextStep;
  return {
    title: `${t.meta.shareTitle(host, t.stage.label[stage])} · Quantum Ready Labs`,
    description: t.meta.shareDescription(t.report.verdict[stage], step.title),
    image: `${origin}/og/${stage}.png`,
    url: `${origin}${localePath(locale, `/r/${id}`)}`,
  };
}

/**
 * A refusal as the edge answers it: English words in `error` (scripts and agents read those, as
 * before), and a code with params so the page can say it in the reader's language.
 */
export function scanError(code: ScanErrorCode, params: ScanErrorParams = {}): { error: string; code: ScanErrorCode; params: ScanErrorParams } {
  return { error: en.errors.scan[code](params), code, params };
}

export function escapeAttr(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** A study slug: lower-case, digits and dashes, 3-40 chars. Rows it owns are tagged `study:<slug>`. */
export function studyClient(slug: unknown): string | null {
  if (typeof slug !== 'string' || !/^[a-z0-9][a-z0-9-]{2,39}$/.test(slug)) return null;
  return `study:${slug}`;
}
