// A real TLS server for the tests: Bun.serve with the fixture certificate (ECDSA P-256,
// self-signed, CN=localhost). BoringSSL underneath, so it already speaks X25519MLKEM768.

import { join } from 'node:path';

export interface Fixture {
  port: number;
  stop(): void;
}

const here = import.meta.dir;

export const FIXTURE_CERT = join(here, 'fixtures/localhost-cert.pem');
export const FIXTURE_KEY = join(here, 'fixtures/localhost-key.pem');

export async function startFixture(): Promise<Fixture> {
  const server = Bun.serve({
    hostname: '127.0.0.1',
    port: 0,
    tls: { key: Bun.file(FIXTURE_KEY), cert: Bun.file(FIXTURE_CERT) },
    fetch() {
      return new Response('fixture');
    },
  });
  return { port: server.port!, stop: () => server.stop(true) };
}
