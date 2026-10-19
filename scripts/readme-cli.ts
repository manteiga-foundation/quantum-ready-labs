// The CLI screenshot for the README: a real scan rendered with truecolor, the ANSI turned into
// HTML inside a terminal window, screenshotted by Chromium at 2x. `bun run scripts/readme-cli.ts [host] [out.png]`

import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';
import { scan } from '../engine/scan';
import { ENGINE_VERSION } from '../engine/server';
import { parseTarget } from '../engine/target';
import { banner, renderReport } from '../engine/terminal';

const host = process.argv[2] ?? 'github.com';
const out = process.argv[3] ?? 'docs/readme/cli.png';
const columns = 96;

const result = await scan(parseTarget(host), {});
const text = banner(ENGINE_VERSION, { mode: 'truecolor', columns }) + '\n' + renderReport(result, { mode: 'truecolor', columns });

/** ANSI SGR (as engine/terminal.ts emits it: 38;2;r;g;b with optional 1; or 4;) to spans. */
function ansiToHtml(s: string): string {
  const esc = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  let html = '';
  let open = false;
  const re = /\x1b\[([0-9;]*)m/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(s))) {
    html += esc(s.slice(last, m.index));
    last = re.lastIndex;
    const codes = m[1].split(';').map(Number);
    if (codes.length === 1 && codes[0] === 0) {
      if (open) html += '</span>';
      open = false;
      continue;
    }
    const styles: string[] = [];
    for (let i = 0; i < codes.length; i++) {
      if (codes[i] === 1) styles.push('font-weight:700');
      else if (codes[i] === 4) styles.push('text-decoration:underline;text-underline-offset:3px');
      else if (codes[i] === 38 && codes[i + 1] === 2) {
        styles.push(`color:rgb(${codes[i + 2]},${codes[i + 3]},${codes[i + 4]})`);
        i += 4;
      }
    }
    if (open) html += '</span>';
    html += `<span style="${styles.join(';')}">`;
    open = true;
  }
  html += esc(s.slice(last));
  if (open) html += '</span>';
  return html;
}

const font = (file: string) => `data:font/woff2;base64,${readFileSync(`node_modules/@fontsource/jetbrains-mono/files/${file}`).toString('base64')}`;
const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
@font-face { font-family: 'JetBrains Mono'; font-weight: 400; src: url('${font('jetbrains-mono-latin-400-normal.woff2')}') format('woff2'); }
@font-face { font-family: 'JetBrains Mono'; font-weight: 700; src: url('${font('jetbrains-mono-latin-700-normal.woff2')}') format('woff2'); }
html, body { margin: 0; background: #0b1020; }
.window { width: 1040px; margin: 36px auto; border-radius: 12px; overflow: hidden; background: #0f1529; box-shadow: 0 30px 80px rgba(0,0,0,0.55), 0 0 0 1px rgba(255,255,255,0.06); }
.bar { height: 40px; display: flex; align-items: center; gap: 8px; padding: 0 16px; background: #141b33; border-bottom: 1px solid rgba(255,255,255,0.06); }
.dot { width: 12px; height: 12px; border-radius: 50%; }
.title { margin-left: auto; margin-right: auto; font: 12px 'JetBrains Mono', monospace; color: #7a879c; letter-spacing: 0.08em; }
pre { margin: 0; padding: 18px 22px 22px; font: 13.2px/1.42 'JetBrains Mono', monospace; color: #dfe7f5; white-space: pre; }
.prompt { color: #7a879c; }
</style></head><body><div class="window">
<div class="bar"><span class="dot" style="background:#ff5f57"></span><span class="dot" style="background:#febc2e"></span><span class="dot" style="background:#28c840"></span><span class="title">bun run scan ${host}</span></div>
<pre><span class="prompt">$</span> bun run scan ${host}
${ansiToHtml(text)}
</pre></div></body></html>`;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1112, height: 800 }, deviceScaleFactor: 2 });
await page.setContent(html, { waitUntil: 'load' });
await page.evaluate('document.fonts.ready');
await page.locator('.window').screenshot({ path: out, omitBackground: false });
await browser.close();
console.log(`${out}: ${host} ${result.assessment.stage} ${result.assessment.score}`);
