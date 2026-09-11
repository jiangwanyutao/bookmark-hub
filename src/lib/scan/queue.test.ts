import { describe, expect, it } from 'vitest';
import { runQueue } from './queue';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const range = (n: number) => Array.from({ length: n }, (_, i) => i);

function tracker() {
  let active = 0;
  let maxActive = 0;
  const activeByKey = new Map<string, number>();
  const maxByKey = new Map<string, number>();
  return {
    async run(key: string) {
      active += 1;
      activeByKey.set(key, (activeByKey.get(key) ?? 0) + 1);
      maxActive = Math.max(maxActive, active);
      maxByKey.set(key, Math.max(maxByKey.get(key) ?? 0, activeByKey.get(key)!));
      await sleep(3);
      active -= 1;
      activeByKey.set(key, activeByKey.get(key)! - 1);
    },
    get maxActive() {
      return maxActive;
    },
    maxFor: (key: string) => maxByKey.get(key) ?? 0,
  };
}

describe('runQueue', () => {
  it('processes every item exactly once', async () => {
    const seen: number[] = [];
    await runQueue(range(20), async (n) => void seen.push(n), { concurrency: 4, perKey: 2, keyOf: (n) => String(n % 3) });
    expect(seen.sort((a, b) => a - b)).toEqual(range(20));
  });

  it('never runs more than the global limit at once', async () => {
    const t = tracker();
    await runQueue(range(20), (n) => t.run(String(n)), { concurrency: 3, perKey: 3, keyOf: String });
    expect(t.maxActive).toBe(3);
  });

  it('never runs more than the per-key limit for the same key', async () => {
    const t = tracker();
    const items = range(20).map((n) => (n < 10 ? 'a' : 'b'));
    await runQueue(items, (key) => t.run(key), { concurrency: 8, perKey: 2, keyOf: (k) => k });
    expect(t.maxFor('a')).toBe(2);
    expect(t.maxFor('b')).toBe(2);
    expect(t.maxActive).toBe(4);
  });

  it('stops taking new items once aborted', async () => {
    const controller = new AbortController();
    const seen: number[] = [];
    await runQueue(
      range(20),
      async (n) => {
        seen.push(n);
        if (seen.length === 3) controller.abort();
        await sleep(1);
      },
      { concurrency: 1, perKey: 1, keyOf: String, signal: controller.signal },
    );
    expect(seen).toHaveLength(3);
  });

  it('rejects when a worker throws', async () => {
    await expect(
      runQueue(range(3), async () => {
        throw new Error('boom');
      }, { concurrency: 2, perKey: 2, keyOf: String }),
    ).rejects.toThrow('boom');
  });
});
