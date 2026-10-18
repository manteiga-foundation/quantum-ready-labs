// Records a scan as a fixture for the web views: the event stream and the result, with the host
// renamed to a neutral example name. `bun run scripts/record-fixture.ts <host> <name>`.

import { scan, type ScanEvent } from '../engine/scan';
import { parseTarget } from '../engine/target';

const [rawHost, name] = process.argv.slice(2);
if (!rawHost || !name) {
  console.error('usage: bun run scripts/record-fixture.ts <host[:port]> <name>');
  process.exit(2);
}
const target = parseTarget(rawHost);
const events: ScanEvent[] = [];
const result = await scan(target, { onEvent: (e) => events.push(e) });

const alias = `${name}.example`;
const text = JSON.stringify({ events, result }, null, 2)
  .replaceAll(target.host, alias)
  .replaceAll(result.address, '203.0.113.10')
  .replace(/"subject": "(\*\.)?[^"]*"(,\n\s+"issuer": "[^"]*",\n\s+"keyAlgorithm")/, '"subject": "$1' + alias + '"$2');
const path = `web/src/fixtures/${name}.json`;
await Bun.write(path, text + '\n');
console.log(`${path}: ${events.length} events, stage ${result.assessment.stage}, score ${result.assessment.score}`);
