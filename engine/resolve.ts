// Resolution with the refusal list: the only step between a Target and a socket address.
// Resolve once, judge every address, connect to the chosen one, never resolve again.

import { lookup } from 'node:dns/promises';
import { isPublicAddress, isCanonicalIpv4, TargetError, type Target } from './target';

export interface Resolved {
  address: string;
  family: 4 | 6;
  all: string[];
}

export interface ResolveOptions {
  /** The CLI scanning an internal network sets this; the public engine never does. */
  allowPrivate?: boolean;
}

export async function resolveTarget(target: Target, options: ResolveOptions = {}): Promise<Resolved> {
  const literal = isCanonicalIpv4(target.host) ? 4 : target.host.includes(':') ? 6 : null;
  let all: { address: string; family: number }[];
  if (literal) {
    all = [{ address: target.host, family: literal }];
  } else {
    try {
      all = await lookup(target.host, { all: true, verbatim: true });
    } catch (e) {
      const code = e && typeof e === 'object' && 'code' in e ? String((e as { code: unknown }).code) : '';
      if (code === 'ENOTFOUND' || code === 'ENODATA' || code === 'ESERVFAIL') {
        throw new TargetError('no-address', `${target.host} does not resolve to any address.`);
      }
      throw new TargetError('unresolvable', `${target.host} could not be resolved (${code || 'resolver error'}).`);
    }
    if (all.length === 0) throw new TargetError('no-address', `${target.host} does not resolve to any address.`);
  }
  if (!options.allowPrivate) {
    const refused = all.filter((a) => !isPublicAddress(a.address));
    if (refused.length) {
      throw new TargetError(
        'not-public',
        `${target.host} resolves to ${refused[0].address}, which is not a public Internet address. The public scanner tests only public hosts.`,
      );
    }
  }
  const preferred = all.find((a) => a.family === 4) ?? all[0];
  return { address: preferred.address, family: preferred.family as 4 | 6, all: all.map((a) => a.address) };
}
