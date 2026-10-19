// README visuals: a hero still of a finished report and a GIF of the ring climbing during a scan.
// `bun run scripts/readme-media.ts <port>` (dev server running; ffmpeg on PATH).
import { chromium } from 'playwright';
import { mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const port = process.argv[2] ?? '5180';
const base = `http://127.0.0.1:${port}`;
const out = 'docs/readme';
mkdirSync(out, { recursive: true });

const browser = await chromium.launch({ args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] });

// Hero: the finished report, desktop.
{
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 });
  await page.goto(`${base}/scan?host=protected.example&demo=protected`);
  await page.getByTestId('next-step').waitFor({ timeout: 15000 });
  await page.waitForTimeout(900);
  await page.screenshot({ path: `${out}/hero.png` });
  await page.close();
  console.log(`${out}/hero.png`);
}

// GIF: entry, typing, Enter, the ring climbing to the verdict. Frames every 100 ms, 960 px wide.
{
  const frames = join(process.env.TMPDIR ?? '/tmp', `qrl-frames-${Date.now()}`);
  mkdirSync(frames, { recursive: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 });
  await page.goto(`${base}/?demo=protected`);
  const field = page.getByRole('textbox', { name: 'Host' });
  await field.waitFor({ state: 'visible' });
  await page.waitForTimeout(400);
  let n = 0;
  const snap = async () => {
    await page.screenshot({ path: join(frames, `f${String(n++).padStart(4, '0')}.png`) });
  };
  for (let i = 0; i < 6; i++) await snap();
  for (const ch of 'protected.example') {
    await field.type(ch, { delay: 0 });
    await snap();
  }
  for (let i = 0; i < 4; i++) await snap();
  await field.press('Enter');
  const t0 = Date.now();
  while (Date.now() - t0 < 3200) {
    await snap();
    await page.waitForTimeout(60);
  }
  for (let i = 0; i < 14; i++) {
    await snap();
    await page.waitForTimeout(60);
  }
  await page.close();
  const count = readdirSync(frames).length;
  // ffconcat with a steady 100 ms per frame, holding the last frame for 1.6 s.
  const list = readdirSync(frames)
    .sort()
    .map((f, i) => `file '${join(frames, f)}'\nduration ${i === count - 1 ? 1.6 : 0.1}`)
    .join('\n');
  writeFileSync(join(frames, 'list.txt'), list + '\n');
  const palette = join(frames, 'palette.png');
  const run = async (args: string[]) => {
    const p = Bun.spawn(['ffmpeg', '-y', '-loglevel', 'error', ...args], { stdout: 'inherit', stderr: 'inherit' });
    if ((await p.exited) !== 0) throw new Error('ffmpeg failed');
  };
  await run(['-f', 'concat', '-safe', '0', '-i', join(frames, 'list.txt'), '-vf', 'fps=10,scale=960:-1:flags=lanczos,palettegen=max_colors=128', palette]);
  await run(['-f', 'concat', '-safe', '0', '-i', join(frames, 'list.txt'), '-i', palette, '-lavfi', 'fps=10,scale=960:-1:flags=lanczos[x];[x][1:v]paletteuse=dither=bayer:bayer_scale=5', `${out}/scan.gif`]);
  rmSync(frames, { recursive: true, force: true });
  console.log(`${out}/scan.gif (${count} frames)`);
}

await browser.close();
