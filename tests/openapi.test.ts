import { describe, expect, test } from 'bun:test';
import { STAGE_LABEL } from '../engine/assess';

// The API description is a promise to agents and other services; it must match the edge's routes
// and the engine's vocabulary, or it is worse than none.

const spec = (await Bun.file('web/public/openapi.json').json()) as {
  openapi: string;
  servers: { url: string }[];
  paths: Record<string, Record<string, { summary?: string; responses?: Record<string, unknown> }>>;
  components: { schemas: Record<string, { enum?: string[]; properties?: Record<string, unknown> }> };
};
const worker = await Bun.file('worker/src/index.ts').text();
const llms = await Bun.file('web/public/llms.txt').text();

describe('the API description', () => {
  test('is OpenAPI 3 for the production origin, at the version of the package', async () => {
    expect(spec.openapi.startsWith('3.')).toBe(true);
    expect(spec.servers[0].url).toBe('https://quantumreadylabs.com');
    const pkg = (await Bun.file('package.json').json()) as { version: string };
    const { ENGINE_VERSION } = await import('../engine/server');
    expect((spec as unknown as { info: { version: string } }).info.version).toBe(pkg.version);
    expect(ENGINE_VERSION).toBe(pkg.version);
    expect(pkg.version).toMatch(/^1\.1\./);
  });

  test('names the public routes, each of which the edge serves', () => {
    expect(Object.keys(spec.paths).sort()).toEqual(['/api/report/{id}.pdf', '/api/result/{id}', '/api/scan', '/r/{id}'].sort());
    expect(spec.paths['/api/scan'].post).toBeDefined();
    expect(spec.paths['/api/scan'].get).toBeDefined();
    expect(worker).toContain("pathname === '/api/scan'");
    expect(worker).toContain("pathname.startsWith('/api/result/')");
    expect(worker).toContain('/api\\/report\\/');
  });

  test('uses the stage vocabulary of the engine, exactly', () => {
    expect(spec.components.schemas.Stage.enum?.sort()).toEqual(Object.keys(STAGE_LABEL).sort());
  });

  test('llms.txt points at the spec and states the limits in one screen', () => {
    expect(llms).toContain('/openapi.json');
    expect(llms).toContain('/api/scan');
    expect(llms).toMatch(/20 scans/);
    expect(llms.split('\n').length).toBeLessThan(60);
  });
});
