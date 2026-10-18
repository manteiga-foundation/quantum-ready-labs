// Development: scan hosts from the terminal and print the findings. `bun run scan <host> [...]`.
// The product CLI (qready) will be its own renderer over the same engine; this is a probe tool.

import { scan, type ScanEvent } from './scan';
import { parseTarget, TargetError } from './target';

const hosts = process.argv.slice(2);
if (hosts.length === 0) {
  console.error('usage: bun run scan <host[:port]> [...]   (--private allows non-public addresses)');
  process.exit(2);
}
const allowPrivate = hosts.includes('--private');

for (const raw of hosts.filter((h) => !h.startsWith('--'))) {
  try {
    const target = parseTarget(raw);
    console.log(`\n== ${target.host}:${target.port}`);
    const result = await scan(target, {
      allowPrivate,
      onEvent: (e: ScanEvent) => {
        if (e.type === 'probe') console.log(`  ${e.label.padEnd(28)} ${e.answer.padEnd(5)} ${e.detail} (${e.ms} ms)`);
        if (e.type === 'connection') console.log(`  ${'connection'.padEnd(28)} ${e.protocol} ${e.cipher} alpn=${e.alpn} chain=${e.chainLength} trusted=${e.trusted} (${e.ms} ms)`);
      },
    });
    const a = result.assessment;
    console.log(`  stage ${a.stage.toUpperCase()}  score ${a.score}  (${result.ms} ms)`);
    console.log(`  ${a.verdict}`);
    console.log(`  next: ${a.nextStep.title}`);
    for (const link of result.findings.chain) {
      console.log(`    ${link.isCA ? 'CA  ' : 'leaf'} ${link.subject} <- ${link.issuer}  ${link.keyDetail}  ${link.signatureAlgorithm}  until ${link.notAfter.slice(0, 10)}`);
    }
    for (const n of a.notes) console.log(`  note: ${n.text}`);
  } catch (e) {
    if (e instanceof TargetError) console.log(`  refused: ${e.message}`);
    else throw e;
  }
}
