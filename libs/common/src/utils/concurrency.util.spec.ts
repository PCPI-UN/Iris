import { mapWithConcurrency } from './concurrency.util';

describe('mapWithConcurrency', () => {
  it('keeps the order of the items whatever finishes first', async () => {
    const result = await mapWithConcurrency([30, 10, 20], 3, async (ms) => {
      await new Promise((resolve) => setTimeout(resolve, ms));
      return ms * 2;
    });
    expect(result).toEqual([60, 20, 40]);
  });

  it('never runs more than `limit` calls at a time', async () => {
    let running = 0;
    let peak = 0;
    await mapWithConcurrency([1, 2, 3, 4, 5], 2, async () => {
      running++;
      peak = Math.max(peak, running);
      await new Promise((resolve) => setTimeout(resolve, 5));
      running--;
    });
    expect(peak).toBe(2);
  });

  it('returns an empty array for no items', async () => {
    expect(await mapWithConcurrency([], 4, () => Promise.resolve(1))).toEqual(
      [],
    );
  });
});
