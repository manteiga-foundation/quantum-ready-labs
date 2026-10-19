// The tests CI runs on Linux: every test file that does not drive a browser.
import { readdirSync } from 'node:fs';

const browserBound = ['web.test.ts', 'render.test.ts'];
const files = readdirSync('tests')
  .filter((f) => f.endsWith('.test.ts') && !browserBound.includes(f))
  .map((f) => `tests/${f}`);
const proc = Bun.spawn(['bun', 'test', '--timeout', '60000', ...files], { stdout: 'inherit', stderr: 'inherit' });
process.exit(await proc.exited);
