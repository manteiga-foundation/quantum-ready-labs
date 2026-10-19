import { describe, expect, test } from 'bun:test';
import { pacer } from '../web/src/pace';

describe('pacer: events reach the view one at a time, never in a burst', () => {
  test('a burst of events is released at the interval, in order, and the end waits for the last', async () => {
    const seen: { n: number; at: number }[] = [];
    const t0 = performance.now();
    let ended = -1;
    const p = pacer<number>((n) => seen.push({ n, at: performance.now() - t0 }), () => (ended = performance.now() - t0), 20);
    for (let i = 0; i < 5; i++) p.push(i);
    p.end();
    expect(seen.length).toBe(1); // the first goes out at once
    await Bun.sleep(150);
    expect(seen.map((s) => s.n)).toEqual([0, 1, 2, 3, 4]);
    for (let i = 1; i < seen.length; i++) expect(seen[i].at - seen[i - 1].at).toBeGreaterThanOrEqual(15);
    expect(ended).toBeGreaterThanOrEqual(seen[4].at);
  });

  test('with a rank, a burst is shown lowest rank first while the first event still goes out at once', async () => {
    const seen: number[] = [];
    const p = pacer<number>((n) => seen.push(n), () => {}, 10, (n) => -n);
    p.push(1);
    p.push(2);
    p.push(5);
    p.push(3);
    p.end();
    await Bun.sleep(80);
    expect(seen).toEqual([1, 5, 3, 2]);
  });

  test('cancel drops what has not been shown yet', async () => {
    const seen: number[] = [];
    const p = pacer<number>((n) => seen.push(n), () => {}, 20);
    p.push(1);
    p.push(2);
    p.push(3);
    p.cancel();
    await Bun.sleep(80);
    expect(seen).toEqual([1]);
  });
});
