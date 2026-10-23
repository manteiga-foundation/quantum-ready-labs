// The live report: a pure reducer from the scan's event stream to what the views render.
// Shared with nothing DOM-bound so bun test can replay fixtures against it.

import { assess, emptyFindings, type Assessment, type Findings } from '../../engine/assess';
import { GROUP, type GroupName } from '../../engine/hello';
import type { ScanEvent, ScanResult } from '../../engine/events';
import type { ScanErrorParams } from './i18n/en';

/** An error carries English words for scripts, and a code with params the page says in the reader's language. */
export type ErrorEvent = { type: 'error'; error: string; code?: string; params?: ScanErrorParams };

export type StreamEvent = ScanEvent | { type: 'result'; result: ScanResult } | { type: 'saved'; id: string } | ErrorEvent;

export interface ProbeRow {
  id: string;
  label: string;
  answer: 'yes' | 'no' | 'error';
  detail: string;
  ms: number;
  group?: string;
  version?: string;
}

export interface ReportState {
  status: 'idle' | 'scanning' | 'done' | 'error';
  host: string | null;
  port: number | null;
  address: string | null;
  startedAt: string | null;
  findings: Findings;
  assessment: Assessment;
  probes: ProbeRow[];
  result: ScanResult | null;
  shareId: string | null;
  error: string | null;
  errorCode: string | null;
  errorParams: ScanErrorParams;
  ms: number | null;
}

export function initialReport(): ReportState {
  const findings = emptyFindings();
  return {
    status: 'idle',
    host: null,
    port: null,
    address: null,
    startedAt: null,
    findings,
    assessment: assess(findings),
    probes: [],
    result: null,
    shareId: null,
    error: null,
    errorCode: null,
    errorParams: {},
    ms: null,
  };
}

const GROUP_CODES = Object.fromEntries((Object.keys(GROUP) as GroupName[]).map((g) => [g, GROUP[g]])) as Record<GroupName, number>;

function cloneFindings(f: Findings): Findings {
  return { ...f, groups: { ...f.groups }, chain: [...f.chain], errors: [...f.errors] };
}

export function applyEvent(state: ReportState, event: StreamEvent): ReportState {
  switch (event.type) {
    case 'start':
      return {
        ...initialReport(),
        status: 'scanning',
        host: event.target.host,
        port: event.target.port,
        address: event.address,
        startedAt: event.startedAt,
      };
    case 'probe': {
      const findings = cloneFindings(state.findings);
      const { id, answer } = event;
      if (id.startsWith('group:')) {
        const g = id.slice(6) as GroupName;
        if (g in findings.groups) findings.groups[g] = answer;
      } else if (id === 'tls13') {
        findings.tls13 = answer === 'yes' ? true : answer === 'no' ? false : null;
      } else if (id === 'tls12') {
        findings.tls12 = answer === 'yes' ? true : answer === 'no' ? false : null;
      } else if (id === 'rsa-transport') {
        findings.rsaKeyTransport = answer === 'yes' ? true : answer === 'no' ? false : null;
      } else if (id === 'modern') {
        findings.preferredModernGroup = answer === 'yes' && event.group && event.group in GROUP_CODES ? GROUP_CODES[event.group as GroupName] : null;
      }
      if (answer === 'error') findings.errors.push(`${id}: ${event.detail}`);
      const probes = [...state.probes.filter((p) => p.id !== id), { id, label: event.label, answer, detail: event.detail, ms: event.ms, group: event.group, version: event.version }];
      return { ...state, findings, probes, assessment: assess(findings) };
    }
    case 'connection': {
      const findings = cloneFindings(state.findings);
      findings.connection = { protocol: event.protocol, cipher: event.cipher, alpn: event.alpn };
      findings.trusted = event.trusted;
      return { ...state, findings, assessment: assess(findings) };
    }
    case 'assessment':
      return { ...state, assessment: event.assessment };
    case 'result':
      return {
        ...state,
        status: 'done',
        result: event.result,
        findings: event.result.findings,
        assessment: event.result.assessment,
        ms: event.result.ms,
        host: event.result.target.host,
        port: event.result.target.port,
        address: event.result.address,
        startedAt: event.result.startedAt,
      };
    case 'saved':
      return { ...state, shareId: event.id };
    case 'done':
      return { ...state, status: state.status === 'error' ? 'error' : 'done', ms: state.ms ?? event.ms };
    case 'error':
      return { ...state, status: 'error', error: event.error, errorCode: event.code ?? null, errorParams: event.params ?? {} };
    default:
      return state;
  }
}

/** A finished report rebuilt from a stored result (the shared /r/<id> view). */
export function reportFromResult(result: ScanResult, shareId: string | null = null): ReportState {
  return applyEvent({ ...initialReport(), shareId }, { type: 'result', result });
}
