// One TCP exchange: connect to an already-resolved address, send one record, read the server's
// first message, close. The only place in the engine that opens a socket for a probe.

import { parseServerMessage, type ServerMessage } from './hello';

export interface Endpoint {
  /** A resolved IP address (never a host name: resolution and its refusal list happen before). */
  address: string;
  port: number;
  timeoutMs?: number;
}

export type Exchange = ServerMessage & { ms: number };

export function exchange(endpoint: Endpoint, hello: Uint8Array): Promise<Exchange> {
  const { address, port, timeoutMs = 5000 } = endpoint;
  const started = performance.now();
  return new Promise((resolve) => {
    const chunks: Uint8Array[] = [];
    let settled = false;
    let socket: { end(): void } | undefined;
    const finish = (message: ServerMessage) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({ ...message, ms: Math.round(performance.now() - started) });
      try {
        socket?.end();
      } catch {
        // already gone
      }
    };
    const timer = setTimeout(() => finish({ kind: 'error', message: 'timeout' }), timeoutMs);
    Bun.connect({
      hostname: address,
      port,
      socket: {
        open(s) {
          socket = s;
          s.write(hello);
        },
        data(_s, data) {
          chunks.push(new Uint8Array(data));
          const message = parseServerMessage(Buffer.concat(chunks));
          if (message) finish(message);
        },
        error(_s, e) {
          finish({ kind: 'error', message: describe(e) });
        },
        close() {
          finish({ kind: 'error', message: 'closed without reply' });
        },
        connectError(_s, e) {
          finish({ kind: 'error', message: `connect: ${describe(e)}` });
        },
      },
    }).catch((e) => finish({ kind: 'error', message: `connect: ${describe(e)}` }));
  });
}

function describe(e: unknown): string {
  if (e && typeof e === 'object' && 'code' in e && typeof (e as { code: unknown }).code === 'string') {
    return (e as { code: string }).code;
  }
  return e instanceof Error ? e.message : String(e);
}
